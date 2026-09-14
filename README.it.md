# doesitcrawl

*[Read in English](README.md)*

Un test pubblico e permanente su una domanda che nessuno ha più verificato dal 2024:
**i crawler delle AI eseguono il JavaScript prima di indicizzare una pagina?**

Il test è vivo su **[doesitcrawl.com](https://doesitcrawl.com)**. Questo repository è
il codice che lo fa funzionare.

## La domanda

La misura più citata è l'analisi di Vercel e MERJ del dicembre 2024, su oltre
cinquecento milioni di richieste di GPTBot, che non osservò alcuna esecuzione di
JavaScript. Da allora nessun test pubblico l'ha replicata, mentre i crawler sono
cambiati e si sono moltiplicati. Questa pagina prova a tenere la risposta aggiornata.

## Come funziona

Sulla pagina vivono tre marcatori unici. Ognuno, se un giorno comparisse nella
risposta di un assistente AI, dimostrerebbe una cosa diversa.

| Marcatore | Dove sta | Cosa dimostra |
|---|---|---|
| primo | nell'HTML servito | la pagina è stata presa e trattenuta |
| secondo | in nessun byte servito, ricomposto solo eseguendo JavaScript | il crawler renderizza davvero |
| terzo | stringa dentro `/e.js`, mai inserita nella pagina | scarica il JavaScript e ne indicizza il testo senza eseguirlo |

Il terzo separa due cose che il test classico confonde. GPTBot scarica file JavaScript
in circa l'11,5% delle richieste e ClaudeBot nel 23,84%, senza eseguirli. Se il secondo
marcatore fosse una stringa dentro lo script, un crawler che si limitasse a ingerire il
file lo troverebbe lo stesso, e il test direbbe «renderizza» dove non renderizza. Per
questo il secondo viaggia XOR-ato con una chiave diversa a ogni richiesta, e non compare
in nessun byte che il server manda.

## Cosa ha trovato finora

*Aggiornato il 14 settembre 2026. La pagina è online dal 7 settembre.*

Un quarto marcatore, in produzione dal 10 settembre, registra a ogni richiesta se il
JavaScript è stato davvero eseguito. Separa tre casi che un registro del server non può
separare: lo script è partito e ha usato una primitiva del browser, è partito e ne ha
usata un'altra, oppure il crawler ha seguito un indirizzo letterale trovato nel sorgente
**senza eseguire niente** — e l'ultimo è prova positiva di non-esecuzione, che è la metà
difficile di questa domanda.

Le categorie qui sotto sono quelle che **Cloudflare verifica**. Uno user-agent da solo
non prova niente.

| Crawler | Categoria | Richieste | Pagina | Dal marcatore | Verdetto |
|---|---|---:|---:|---:|---|
| `meta-externalagent` | AI Crawler | 6 | 3 | 2 | **esegue il JavaScript** |
| `GoogleOther` | AI Crawler | 4 | 1 | 1 | **legge il sorgente, non esegue** |
| `Googlebot` | Search Engine Crawler | 57 | 14 | 3 | esegue il JavaScript |
| `bingbot` | Search Engine Crawler | 34 | 12 | 7 | solo la pagina, mai lo script |
| `ClaudeBot` | AI Crawler | 115 | 2 | **0** | mai messo alla prova |
| `GPTBot` | AI Crawler | 14 | 2 | **0** | mai messo alla prova |
| `Applebot` | AI Search | 8 | 3 | **0** | mai messo alla prova |
| `OAI-SearchBot` | Search Engine Crawler | 11 | 0 | **0** | mai messo alla prova |

| Scoperta | Prova |
|---|---|
| Un crawler AI verificato **renderizza** | 14 set, 07:41 UTC: `meta-externalagent` prende pagina, script e tutte e due le primitive in 628 ms. Non ogni volta — il 12 aveva preso solo la pagina. Una resa su due occasioni. |
| Un crawler AI verificato **dimostrabilmente no** | 11 set: `GoogleOther`, verificato dalla rete di Google, chiede l'indirizzo letterale com'è scritto nel sorgente invece della forma che lo script costruisce a runtime. Possibile solo leggendo senza eseguire. |
| **Non tornano** | Il marcatore è partito *dopo* che i crawler AI avevano già smesso di prendere la pagina: quattro di loro non sono mai stati messi alla prova. «Mai messo alla prova» non è «non renderizza». |

| Crawler | Le sue richieste sono soprattutto | La pagina |
|---|---|---|
| `ClaudeBot` | `robots.txt` ×55, `sitemap.xml` ×54 | due volte, entrambe il 7 set |
| `GPTBot` | `sitemap.xml` ×6 | due volte, 7 e 9 set |
| `Applebot` | lo script ×3 | tre volte, tutte entro l'8 set |
| `OAI-SearchBot` | `robots.txt` ×6 | mai |

Per un dominio nuovo senza autorità questo può valere più della domanda sul rendering: un
risultato vuoto alla fine andrà letto come *hanno smesso di passare*, non come *non
renderizzano*.

### Un avvertimento sulle statistiche per user-agent

| Nome dichiarato | Verificato | Cosa ha chiesto davvero |
|---|---|---|
| `ChatGPT-User`, `PerplexityBot`, `OAI-SearchBot` | **no** | `/.env.production`, `/.git/HEAD`, `/service_account.json`, `/.netrc`, `/aws-exports.js` |

È una scansione in cerca di credenziali che indossa quei nomi. Qualunque misura del
traffico dei crawler AI costruita sui soli user-agent sta contando anche questo.

### Cosa questo non dice

Una pagina, un dominio nuovo senza autorità, poche settimane. Dice cosa hanno fatto questi
crawler qui, non cosa fanno ovunque. Un beacon assente non prova mai la non-esecuzione:
solo il caso dell'indirizzo letterale la prova in positivo.

## Cosa c'è qui dentro

| Cartella | Cosa fa |
|---|---|
| [apps/doesitcrawl](apps/doesitcrawl/) | La pagina e il registro dei crawler, su un solo Worker Cloudflare gratuito |
| [apps/doesitcrawl-mirror](apps/doesitcrawl-mirror/) | La stessa pagina fuori da Cloudflare, come controllo |
| [tools/page-parity.mjs](tools/page-parity.mjs) | Verifica che le due superfici servano la stessa pagina e che il secondo marcatore non stia in nessun byte |
| [tools/scanner](tools/scanner/) | Scansione appaiata GPTBot e Chrome dallo stesso indirizzo, per misurare chi blocca cosa |
| [tools/indexnow.py](tools/indexnow.py) | Segnala ai motori che la pagina è cambiata, senza aspettare il crawler |
| [infra/supabase](infra/supabase/) | Lo schema del registro indipendente |

### Perché esiste una copia di controllo

Un blocco di Cloudflare avviene **prima** del Worker. Il crawler bloccato non lascia
traccia nel registro, e un registro vuoto è indistinguibile da un crawler che non è mai
passato. Il rimedio non può stare nel Worker, perché in quel caso il Worker non viene
eseguito. Serve un secondo punto di osservazione fuori da Cloudflare, e il confronto fra
i due registri separa tre casi che altrimenti collassano in uno.

| Registro Cloudflare | Registro esterno | Cosa hai imparato |
|---|---|---|
| visite | visite | nessuno blocca, si aspetta la lettura sui motori |
| niente | visite | Cloudflare blocca, e la data è nel registro |
| niente | niente | problema di scoperta, non di rendering |

La regola che rende quel confronto valido è che le due pagine siano **identiche a meno
dei marcatori e dell'URL canonico**. Il template però è scritto due volte, in due file
che si distribuiscono separatamente e con due sintassi di modulo diverse, quindi può
divergere senza che nessuno se ne accorga. Da qui il controllo di parità, che va
lanciato prima di ogni distribuzione.

## Cosa non è pubblico, e perché

I valori dei tre marcatori sono segreti e stanno nei secret della piattaforma, mai nei
file. **Se un motore imparasse un marcatore da un'altra pagina invece che da questa, la
misura morirebbe senza dare segnali.**

Non è pubblico nemmeno il registro delle visite: contiene indirizzi IP, e sono gli
indirizzi a trasformare la dichiarazione di uno user-agent in un crawler verificato,
quindi contano e non sta a me pubblicarli.

**I risultati sì.** Fino al 14 settembre 2026 questa sezione diceva che non erano
pubbliche nemmeno le misure. È stato cambiato di proposito, non per distrazione: quello
che sta qui sopra non contiene nessun marcatore, nessun indirizzo e nessun registro. Un
test la cui risposta resta privata non è un test pubblico.

Nel codice restano solo i nomi delle variabili. Gli identificatori dell'account sono
sostituiti da segnaposto: chi volesse rifare l'esperimento deve creare i propri.

## Licenza

**Nessuna licenza.** Il codice è pubblicato per essere letto, non riusato: vale il
diritto d'autore pieno, tutti i diritti riservati. Se ti serve per qualcosa, scrivimi.

---

Di [Stefano Agbodan](https://github.com/stemolti). Il test è indipendente, non
commerciale, senza tracciamento e senza cookie.
