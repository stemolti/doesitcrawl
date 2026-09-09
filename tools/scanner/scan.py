#!/usr/bin/env python3
"""
Scansione appaiata GPTBot/Chrome per l'idea 2 della verifica mondiale.

Misura, dall'esterno e senza toccare niente di nessuno, la popolazione a rischio
del cambio Cloudflare del 15 settembre 2026: i domini che bloccano i crawler di
addestramento e che applicano davvero quel blocco al bordo.

Cosa questo script NON misura, e non puo' misurare: se il Googlebot vero venga
bloccato. Quella e' la seconda misura del cancello del 16 settembre e richiede lo
screenshot di Search Console di un proprietario consenziente. Mandare uno
user-agent Googlebot da un IP di datacenter e' impersonation: Cloudflare sfida
sempre quella richiesta e lo script scriverebbe come difetto un 403 che si e'
inventato da solo. Per questo gli user-agent dei crawler verificati sono vietati
piu' sotto, con un controllo che ferma il programma.

Uso tipico:
    python scan.py --domains top500.csv --label baseline-pre-15 --out results/
"""

import argparse
import csv
import json
import os
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import requests
from requests.adapters import HTTPAdapter

# --------------------------------------------------------------------------
# User-agent
# --------------------------------------------------------------------------

UA_CHROME = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)

# Da verificare contro la stringa pubblicata da OpenAI prima di una scansione che
# conta: la versione cambia e una stringa vecchia puo' non essere riconosciuta.
UA_GPTBOT = (
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); "
    "compatible; GPTBot/1.1; +https://openai.com/gptbot"
)

# Il report vieta esplicitamente Googlebot. Bingbot e Applebot sono verificati per
# IP con la stessa logica, quindi l'estensione del divieto e' mia, non del report.
UA_FORBIDDEN = ("googlebot", "bingbot", "applebot", "duckduckbot", "yandexbot")

# --------------------------------------------------------------------------
# Riconoscimento robots.txt
# --------------------------------------------------------------------------

# Crawler di addestramento e di risposta AI. Il selettore dell'idea 2 e' il blocco
# Training preesistente, non ads.txt.
AI_BOTS = [
    "gptbot", "chatgpt-user", "oai-searchbot", "claudebot", "claude-web",
    "claude-searchbot", "claude-user", "anthropic-ai", "ccbot", "perplexitybot",
    "perplexity-user", "google-extended", "applebot-extended", "bytespider",
    "amazonbot", "meta-externalagent", "facebookbot", "diffbot", "omgilibot",
    "cohere-ai", "imagesiftbot", "youbot", "timpibot", "ai2bot", "webzio-extended",
]

# Tracce che Cloudflare gestisca il file. Sono ipotesi da confermare leggendo le
# righe grezze che lo script salva in `robots_marker_lines`: nessuna e' stata
# verificata contro un robots.txt reale, quindi la colonna va letta a mano prima
# di dichiarare qualunque tasso.
CLOUDFLARE_MARKERS = [
    re.compile(r"cloudflare", re.I),
    re.compile(r"content[-\s]?signal", re.I),
    re.compile(r"\bai-train\s*=", re.I),
    re.compile(r"\bai-input\s*=", re.I),
    re.compile(r"managed\s+by", re.I),
    re.compile(r"bot\s+preference", re.I),
]

BLOCK_STATUSES = {401, 403, 429, 451, 503}


def check_forbidden_ua():
    for ua in (UA_CHROME, UA_GPTBOT):
        for forbidden in UA_FORBIDDEN:
            if forbidden in ua.lower():
                sys.exit(
                    "ERRORE: lo user-agent contiene '" + forbidden + "'. I crawler "
                    "verificati per IP non vanno impersonati: il 403 che ne "
                    "risulta e' un difetto inventato dallo script."
                )


def new_session():
    s = requests.Session()
    ad = HTTPAdapter(max_retries=0, pool_connections=4, pool_maxsize=4)
    s.mount("https://", ad)
    s.mount("http://", ad)
    return s


def fetch(s, url, ua, timeout):
    """Una richiesta. Ritorna sempre un dizionario, mai un'eccezione."""
    try:
        r = s.get(
            url,
            headers={
                "User-Agent": ua,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            },
            timeout=timeout,
            allow_redirects=True,
        )
        return {
            "status": r.status_code,
            "content_type": (r.headers.get("Content-Type") or "").split(";")[0].strip().lower(),
            "server": (r.headers.get("Server") or "").lower(),
            "cf_ray": r.headers.get("CF-RAY") or "",
            "last_modified": r.headers.get("Last-Modified") or "",
            "final_url": r.url,
            "text": r.text[:400000],
            "error": "",
        }
    except requests.RequestException as e:
        return {
            "status": 0, "content_type": "", "server": "", "cf_ray": "",
            "last_modified": "", "final_url": url, "text": "",
            "error": type(e).__name__,
        }


def parse_robots(text):
    """Gruppi user-agent -> disallow. Ritorna i bot AI bloccati e i marker trovati."""
    blocked = []
    markers = []
    current_group = []
    group_has_rules = False

    for raw_line in text.splitlines():
        for m in CLOUDFLARE_MARKERS:
            if m.search(raw_line):
                clean_line = raw_line.strip()[:200]
                if clean_line and clean_line not in markers:
                    markers.append(clean_line)
                break

        line = raw_line.split("#")[0].strip()
        if not line or ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip().lower()
        value = value.strip()

        if key == "user-agent":
            if group_has_rules:              # nuovo gruppo dopo delle direttive
                current_group = []
                group_has_rules = False
            current_group.append(value.lower())
        elif key in ("disallow", "allow", "crawl-delay") and current_group:
            group_has_rules = True
            if key == "disallow" and value == "/":
                for ua in current_group:
                    if ua in AI_BOTS and ua not in blocked:
                        blocked.append(ua)
                    elif ua == "*" and "*" not in blocked:
                        blocked.append("*")
    return blocked, markers


def probe(domain, timeout, delay):
    s = new_session()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    r = {"domain": domain, "ts": now, "outcome": "ok", "exclusion_reason": "", "notes": ""}

    robots = fetch(s, "https://" + domain + "/robots.txt", UA_CHROME, timeout)
    time.sleep(delay)
    chrome = fetch(s, "https://" + domain + "/", UA_CHROME, timeout)
    time.sleep(delay)
    gptbot = fetch(s, "https://" + domain + "/", UA_GPTBOT, timeout)
    s.close()

    if robots["status"] == 200:
        blocked, markers = parse_robots(robots["text"])
    else:
        blocked, markers = [], []
    ai_blocked = [b for b in blocked if b != "*"]

    r.update({
        "chrome_status": chrome["status"],
        "chrome_content_type": chrome["content_type"],
        "chrome_final_url": chrome["final_url"],
        "gptbot_status": gptbot["status"],
        "behind_cloudflare": bool(chrome["cf_ray"]) or "cloudflare" in chrome["server"],
        "cf_ray": chrome["cf_ray"][:24],
        "robots_status": robots["status"],
        "robots_last_modified": robots["last_modified"],
        "robots_managed_by_cf": bool(markers),
        "robots_marker_lines": " | ".join(markers[:6]),
        "robots_ai_blocked": ",".join(ai_blocked),
        "robots_wildcard_blocked": "*" in blocked,
        "training_blocked": bool(ai_blocked),
    })

    # Filtro anti-falso-positivo: se la gamba Chrome non e' 200 text/html, il
    # dominio non entra in nessun tasso. Un 403 di Cloudflare verso tutti non e'
    # il difetto che stiamo cercando, e un redirect a una pagina di parcheggio
    # nemmeno.
    if chrome["error"]:
        r["outcome"] = "error"
        r["exclusion_reason"] = chrome["error"]
    elif chrome["status"] != 200:
        r["outcome"] = "excluded"
        r["exclusion_reason"] = "chrome_" + str(chrome["status"])
    elif not chrome["content_type"].startswith("text/html"):
        r["outcome"] = "excluded"
        r["exclusion_reason"] = "type_" + (chrome["content_type"] or "empty")

    r["edge_defect"] = bool(
        r["outcome"] == "ok"
        and gptbot["status"] in BLOCK_STATUSES
        and chrome["status"] == 200
    )
    if r["outcome"] == "ok" and r["edge_defect"] and not r["training_blocked"]:
        r["notes"] = "bloccato al bordo senza blocco in robots.txt: da guardare a mano"
    return r


COLUMNS = [
    "domain", "ts", "outcome", "exclusion_reason", "chrome_status", "chrome_content_type",
    "chrome_final_url", "gptbot_status", "edge_defect", "behind_cloudflare", "cf_ray",
    "robots_status", "robots_last_modified", "robots_managed_by_cf", "robots_marker_lines",
    "robots_ai_blocked", "robots_wildcard_blocked", "training_blocked", "notes",
]


def load_domains(path, limit):
    domains = []
    seen = set()
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            # accetta "1,example.com" (formato Tranco), "example.com" e URL interi
            field = line.split(",")[-1].strip().strip('"')
            field = re.sub(r"^https?://", "", field).split("/")[0].lower()
            if not field or "." not in field:
                continue
            if field not in seen:
                seen.add(field)
                domains.append(field)
            if limit and len(domains) >= limit:
                break
    return domains


def summarize(csv_path, label, out):
    with open(csv_path, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    def is_true(r, c):
        return str(r.get(c, "")).lower() in ("true", "1")

    valid = [r for r in rows if r["outcome"] == "ok"]
    n = len(valid) or 1
    training = [r for r in valid if is_true(r, "training_blocked")]
    defect = [r for r in valid if is_true(r, "edge_defect")]
    defect_with_training = [r for r in defect if is_true(r, "training_blocked")]
    defect_without_training = [r for r in defect if not is_true(r, "training_blocked")]

    s = {
        "label": label,
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "scanned": len(rows),
        "valid": len(valid),
        "excluded": sum(1 for r in rows if r["outcome"] == "excluded"),
        "errors": sum(1 for r in rows if r["outcome"] == "error"),
        "behind_cloudflare": sum(1 for r in valid if is_true(r, "behind_cloudflare")),
        "robots_with_cf_marker": sum(1 for r in valid if is_true(r, "robots_managed_by_cf")),
        "training_blocked": len(training),
        "training_blocked_rate_pct": round(100 * len(training) / n, 2),
        "edge_defect": len(defect),
        "edge_defect_rate_pct": round(100 * len(defect) / n, 2),
        "defect_with_training_in_robots": len(defect_with_training),
        "defect_without_training_in_robots": len(defect_without_training),
    }
    with open(os.path.join(out, label + "-summary.json"), "w", encoding="utf-8") as f:
        json.dump(s, f, indent=2, ensure_ascii=False)

    print("\n--- Riepilogo " + label + " ---")
    for k, v in s.items():
        print("{:34} {}".format(k, v))
    print(
        "\nSoglia scritta prima di partire (verifica mondiale, idea 2): sotto il 2-3%\n"
        "l'idea si chiude il giorno stesso. Il numero qui sopra e' la popolazione a\n"
        "rischio applicata al bordo, NON il blocco del Googlebot vero: quello lo\n"
        "dimostrano solo gli screenshot di Search Console di 20 proprietari.\n"
        "I " + str(s["defect_without_training_in_robots"]) + " domini con difetto ma senza "
        "blocco in robots.txt vanno guardati\na mano: se sono tanti, il tuo metro ha un difetto suo."
    )


def main():
    p = argparse.ArgumentParser(description="Scansione appaiata GPTBot/Chrome, idea 2.")
    p.add_argument("--domains", required=True, help="file con un dominio per riga, o CSV Tranco")
    p.add_argument("--label", required=True, help="es. baseline-pre-15 oppure gate-16-september")
    p.add_argument("--out", default="results", help="cartella di output")
    p.add_argument("--limit", type=int, default=500)
    p.add_argument("--workers", type=int, default=8)
    p.add_argument("--timeout", type=float, default=12.0)
    p.add_argument("--delay", type=float, default=0.4, help="secondi fra le richieste allo stesso dominio")
    a = p.parse_args()

    check_forbidden_ua()
    os.makedirs(a.out, exist_ok=True)
    csv_path = os.path.join(a.out, a.label + ".csv")

    done = set()
    if os.path.exists(csv_path):
        with open(csv_path, encoding="utf-8") as f:
            done = {r["domain"] for r in csv.DictReader(f)}
        print("Ripresa: " + str(len(done)) + " domini gia' fatti in " + csv_path)

    domains = [d for d in load_domains(a.domains, a.limit) if d not in done]
    print("Da scansionare: " + str(len(domains)) + " domini, " + str(a.workers) + " in parallelo\n")

    lock = threading.Lock()
    is_new = not os.path.exists(csv_path)
    with open(csv_path, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS, extrasaction="ignore")
        if is_new:
            w.writeheader()
        with ThreadPoolExecutor(max_workers=a.workers) as ex:
            futures = [ex.submit(probe, d, a.timeout, a.delay) for d in domains]
            for i, fut in enumerate(as_completed(futures), 1):
                r = fut.result()
                with lock:
                    w.writerow(r)
                    f.flush()
                if i % 25 == 0 or i == len(domains):
                    print("  " + str(i) + "/" + str(len(domains)))

    summarize(csv_path, a.label, a.out)


if __name__ == "__main__":
    main()
