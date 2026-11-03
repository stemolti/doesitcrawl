# Pagina esca e registro dei crawler

Un solo Worker Cloudflare su piano gratuito che fa due cose che nei report stanno
separate: il canary test dell'idea 3 e il Worker di
logging dei giorni 4-7 del dossier, che è
anche il primo dei tre lavori venduti nell'idea 1.

## Perché è acceso

È l'unica misura del piano il cui orologio parte quando parti tu. La latenza di
scoperta di un dominio nuovo a zero autorità è di 4-8 settimane, 6-10 per un esito
leggibile. Il Worker è acceso dal 7 settembre 2026, e la finestra di lettura è questa.

## I tre marcatori

| Token | Dove sta | Cosa dimostra se compare in una risposta AI |
|---|---|---|
| `-alpha` | nell'HTML servito | la pagina è stata presa e trattenuta |
| `-beta` | in nessun byte servito, ricomposto solo eseguendo JS | il crawler renderizza davvero |
| `-gamma` | letterale dentro `/e.js`, mai inserito nella pagina | scarica il JS e ne indicizza il testo senza eseguirlo |

Il terzo separa due cose che il test classico confonde. GPTBot scarica file JS
nell'11,5% delle richieste e ClaudeBot nel 23,84% senza eseguirli: se il token beta
fosse una stringa dentro lo script, un crawler che si limita a ingerire il file lo
troverebbe lo stesso e il test direbbe "renderizza" dove non renderizza. Per questo
beta viaggia XOR-ato con una chiave diversa a ogni richiesta.

**I token non vanno scritti da nessun'altra parte che sia indicizzabile.** Non in un
post, non in un repo pubblico, non in un messaggio su un forum. Se un motore impara
un token da un'altra pagina invece che da questa, quella misura è morta e non te ne
accorgi.

## Stato al 3 novembre 2026

Il Worker è in produzione dal 7 settembre 2026. `/ingest`, il battito quotidiano e il
cron `23 5 * * *` sono attivi; il registro sta su D1 e la copia indipendente su
Supabase. Non ci sono stati deploy dal 10 settembre, quindi la versione online è
quella con il beacon e le due primitive.

Il database D1 `bait`, lo schema, il dominio e i secret esistono già. Se ricostruisci
l'esperimento da zero, la migrazione va eseguita **prima** del deploy: il codice nuovo
scrive la colonna `source`, e se la colonna non esiste gli inserimenti falliscono in
silenzio e le visite si perdono. I comandi sono quelli di `wrangler`, dalla cartella
che contiene `wrangler.toml`.

## Farsi trovare senza aspettare

Il Worker serve anche il file della chiave IndexNow, su `/<INDEXNOW_KEY>.txt`. Serve a
segnalare ai motori che la pagina è cambiata invece di aspettare che un crawler
ripassi, e il motore che conta è Bing: il suo indice è il livello di recupero di
ChatGPT e di Copilot, quindi una pagina che non è su Bing non può finire in quelle
risposte per quanto GPTBot l'abbia scaricata.

La chiave sta in chiaro in `wrangler.toml` **di proposito**: il protocollo pretende che
sia pubblica, ed è proprio quel file a dimostrare al motore che chi segnala controlla
il dominio. Non è un segreto e non va confusa con `LOG_KEY`.

La rotta non si registra, come `/log` e `/ingest`: un motore rilegge quel file a ogni
segnalazione, e quelle riletture non sono visite di crawler alla pagina.

```bash
python tools/indexnow.py
```

Lo script verifica prima che il file risponda, perché senza il motore rifiuta la
segnalazione con un 403 poco visibile.

Ogni deploy che tocca la pagina va preceduto da `node tools/page-parity.mjs` dalla
radice del repository, e va fatto insieme a quello della copia di controllo: la
regola della [copia](../doesitcrawl-mirror/README.md) è che le due pagine siano
identiche a meno dei token, e fra un deploy e l'altro non lo sono. Si modifica solo
`src/worker.js`, e `--sync` ricopia il template nel mirror. La riga dell'autore sotto
il titolo prende il nome da `AUTHOR` in `wrangler.toml` e la foto da `src/avatar.js`,
che si genera con `python tools/build-avatar.py FOTO`.

Dopo il deploy, i controlli dall'esterno sono: pagina 200, alpha presente, beta
assente da ogni byte servito, gamma solo in `/e.js`, `robots.txt` con `Allow: /`, e
`/ingest` che risponde 401 senza chiave invece di 404.

## Controllo che il test sia valido

Il token beta non deve comparire in nessun byte servito. Con il dominio al posto di
`SITE`:

```bash
curl -s https://SITE/ | grep -c 'IL_TUO_TOKEN_BETA'
```

Deve stampare `0`. Se stampa altro, l'offuscamento è rotto e il test misura
qualcosa che non è il rendering. Poi la stessa cosa su `/e.js`, dove invece deve
comparire solo il gamma.

## Leggere il registro

```bash
curl -s 'https://SITE/log?key=LA_TUA_CHIAVE&bot=1&format=csv' -o log.csv
```

`bot=1` toglie le visite da browser. Le colonne che contano sono `ip`, `asn` e
`verified_bot`: lo user-agent da solo non prova niente, e la verifica va fatta
contro le fasce IP pubblicate da OpenAI, Anthropic e Perplexity. `signature_agent`
è la firma Web Bot Auth, presente solo su una minoranza di crawler.

L'endpoint `/log` non si registra da sé, così le tue visite non sporcano i dati.

## Cosa dicono i dati finora

La soglia era scritta prima di partire: se i crawler AI eseguono il JavaScript, l'idea 3
si chiude e il rendering esce dall'idea 1. È successo due volte, con
`meta-externalagent` il 14 settembre e con `GoogleOther` il 17 ottobre. I risultati
aggiornati stanno nel [README principale](../../README.md).
