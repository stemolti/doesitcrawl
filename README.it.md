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
misura morirebbe senza dare segnali.** Per la stessa ragione non sono pubblici né il
contenuto del registro delle visite né le misure raccolte.

Nel codice restano solo i nomi delle variabili. Gli identificatori dell'account sono
sostituiti da segnaposto: chi volesse rifare l'esperimento deve creare i propri.

## Licenza

**Nessuna licenza.** Il codice è pubblicato per essere letto, non riusato: vale il
diritto d'autore pieno, tutti i diritti riservati. Se ti serve per qualcosa, scrivimi.

---

Di [Stefano Agbodan](https://github.com/stemolti). Il test è indipendente, non
commerciale, senza tracciamento e senza cookie.
