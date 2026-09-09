#!/usr/bin/env python3
"""Segnala alle motori di ricerca che una pagina e' cambiata, via IndexNow.

Il protocollo serve a non aspettare che un crawler ripassi da solo. Un solo
messaggio raggiunge Bing, Yandex, Naver, Seznam e Yep insieme, e Bing e' quello
che conta qui: il suo indice e' il livello di recupero di ChatGPT e di Copilot,
quindi una pagina che non e' su Bing non puo' finire in quelle risposte per
quanto GPTBot l'abbia scaricata.

Prima di segnalare, lo script verifica che il file della chiave risponda davvero
sull'host: se manca, il motore rifiuta la segnalazione con 403 e non lo dice in
modo evidente. Meglio scoprirlo qui che dal silenzio.

    python tools/indexnow.py                  # segnala la home della esca
    python tools/indexnow.py --url ...        # segnala un altro indirizzo
    python tools/indexnow.py --check          # verifica solo il file della chiave

La chiave si legge da wrangler.toml, dov'e' in chiaro di proposito: il protocollo
la vuole pubblica. Non e' un secret e non va confusa con LOG_KEY.
"""
import argparse
import re
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WRANGLER = ROOT / "apps/doesitcrawl/wrangler.toml"
SITE = "https://doesitcrawl.com"
ENDPOINT = "https://api.indexnow.org/indexnow"
CTX = ssl.create_default_context()

# Un motore, quando riceve la segnalazione, rilegge il file della chiave. Quelle
# riletture non sono visite di crawler alla pagina e il Worker non le registra.
MEANING = {
    200: "accettata",
    202: "ricevuta, la chiave e' in verifica: normale la prima volta",
    400: "formato della richiesta non valido",
    403: "chiave rifiutata: il file non risponde o non contiene la chiave",
    422: "l'indirizzo non appartiene all'host della chiave",
    429: "troppe segnalazioni, rallenta",
}


def key_from_wrangler():
    m = re.search(r'^\s*INDEXNOW_KEY\s*=\s*"([^"]+)"', WRANGLER.read_text(encoding="utf-8"), re.M)
    if not m:
        sys.exit("INDEXNOW_KEY non trovata in " + str(WRANGLER))
    return m.group(1)


def get(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": "doesitcrawl-indexnow (stemolti)"})
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def check(key):
    url = f"{SITE}/{key}.txt"
    status, body = get(url)
    ok = status == 200 and body.strip() == key
    print(f"file della chiave: {url}")
    print(f"  HTTP {status}, contenuto {'corretto' if ok else 'NON corretto'}")
    if not ok and status == 404:
        print("  la rotta non e' in produzione: manca il deploy del Worker")
    return ok


def main():
    ap = argparse.ArgumentParser(description="Segnala un indirizzo via IndexNow.")
    ap.add_argument("--url", default=SITE + "/")
    ap.add_argument("--check", action="store_true", help="verifica il file della chiave e basta")
    a = ap.parse_args()

    key = key_from_wrangler()
    if not check(key):
        sys.exit(1 if not a.check else 0)
    if a.check:
        return

    status, body = get(f"{ENDPOINT}?url={a.url}&key={key}")
    print(f"\nsegnalato {a.url}")
    print(f"  HTTP {status}: {MEANING.get(status, 'risposta non prevista')}")
    if body.strip():
        print("  " + body.strip()[:200])
    sys.exit(0 if status in (200, 202) else 1)


if __name__ == "__main__":
    main()
