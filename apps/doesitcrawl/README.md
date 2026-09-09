# Pagina esca e registro dei crawler

Un solo Worker Cloudflare su piano gratuito che fa due cose che nei report stanno
separate: il canary test dell'idea 3 e il Worker di
logging dei giorni 4-7 del dossier, che è
anche il primo dei tre lavori venduti nell'idea 1.

## Perché va acceso oggi

È l'unica misura del piano il cui orologio parte quando parti tu. La latenza di
scoperta di un dominio nuovo a zero autorità è di 4-8 settimane, 6-10 per un esito
leggibile. Acceso il 6 settembre, il risultato arriva fra metà ottobre e metà
novembre. Ogni giorno di attesa è un giorno spostato in fondo.

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

## Accensione

Il Worker e' stato acceso il 7 settembre 2026 e sta misurando: database D1 `bait`
creato, schema applicato, dominio collegato, tre token e `LOG_KEY` caricati come
secret. Questa sezione non e' una procedura da rifare, e rifarla da capo
ricreerebbe cose che esistono gia'.

Quello che resta da fare sulla versione in produzione, che al 7 settembre e' ancora
quella della mattina (senza `/ingest`, senza battito, senza cron):

```bash
cd apps/doesitcrawl
npx wrangler d1 execute bait --remote --file=migrations/001-add-source.sql
```

```bash
npx wrangler secret put SUPABASE_KEY
```

```bash
npx wrangler deploy
```

La migrazione va **prima** del deploy: il codice nuovo scrive anche la colonna
`source`, e se la colonna non esiste gli inserimenti falliscono in silenzio e le
visite si perdono. Tutti i comandi vanno lanciati da questa cartella, dove sta
`wrangler.toml`.

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

Dopo il deploy, i controlli dall'esterno stanno in
docs/measurements.md: pagina 200, alpha presente, beta
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

## Dopo, quando i crawler saranno passati

Interroghi i motori sui tre token, uno per volta, e annoti chi restituisce cosa in
measurements.md. La soglia era scritta prima di partire: se i crawler AI
eseguono il JavaScript, l'idea 3 si chiude e il rendering esce dall'idea 1.
