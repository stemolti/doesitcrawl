# Copia di controllo, fuori da Cloudflare

Stessa pagina esca di [apps/doesitcrawl](../doesitcrawl), su Vercel, con tre token propri.
Non è un secondo esperimento: è il controllo del primo.

## Il problema che risolve

Un blocco di Cloudflare avviene **prima** del Worker. Il crawler bloccato non
lascia traccia in D1, quindi un registro vuoto è indistinguibile da un crawler che
non è mai passato — e il rimedio non può stare nel Worker, perché il Worker in quel
caso non viene eseguito. Serve un secondo punto di osservazione fuori da Cloudflare.

| Registro `cloudflare` | Registro `vercel` | Cosa hai imparato |
|---|---|---|
| visite | visite | nessuno blocca: si aspetta la lettura sui motori |
| niente | visite | Cloudflare blocca, e la data è nel registro |
| niente | niente | problema di scoperta, non di rendering |
| visite | niente | anomalia lato Vercel, da guardare |

Come effetto secondario risolve anche il rischio principale della esca: `vercel.app`
è un dominio che i crawler già visitano, mentre `doesitcrawl.com` è nato ieri.

## Le tre regole che lo rendono un controllo

1. **La pagina è strutturalmente identica** a quella del Worker. Le uniche
   differenze ammesse sono i tre token e l'URL canonico. Ogni altra differenza
   trasforma un confronto fra due host in un confronto fra due pagine. Il template
   è scritto due volte, in [api/_shared.js](api/_shared.js) e in
   [../doesitcrawl/src/worker.js](../doesitcrawl/src/worker.js), quindi prima di
   ogni deploy che tocca la pagina va lanciato `node tools/page-parity.mjs` dalla
   radice del repository, e le due superfici vanno ridistribuite insieme: fra il
   deploy dell'una e dell'altra il controllo è sospeso.
2. **Il canonico punta a se stesso.** Se puntasse a `doesitcrawl.com`, i motori
   tratterebbero questa copia come duplicato e il controllo sparirebbe.
3. **Tre token nuovi**, diversi da quelli della esca, e come quelli mai scritti
   da nessuna parte che sia indicizzabile.

## Registra due volte, e sono due per un motivo

**Su Supabase**, che è il registro indipendente. Se il mirror scrivesse solo
attraverso il Worker su `doesitcrawl.com`, riferirebbe attraverso la cosa che sta
controllando: un blocco o un guasto di Cloudflare farebbe fallire anche il registro
del controllo, e in silenzio, che è esattamente il modo di rompersi che questa copia
doveva eliminare.

**E al Worker**, che tiene su D1 il registro comodo con le due superfici affiancate.

Le due scritture sono indipendenti: se una fallisce l'altra parte lo stesso, e un
disaccordo fra le due copie è a sua volta un dato. La risposta al crawler non
fallisce mai per colpa del registro.

Vercel non espone ASN e organizzazione, e non ha una nozione di bot verificato:
quelle colonne restano vuote per questa superficie, e la verifica dell'identità va
rifatta a mano sulle fasce IP pubblicate dagli operatori. I log nativi di Vercel sul
piano Hobby hanno una conservazione troppo breve per appoggiarci una misura.

## Accensione

Undici variabili d'ambiente nel progetto Vercel, in Settings → Environment Variables.
Finché mancano i token la pagina risponde **503 not configured**, di proposito: una
pagina servita con i marcatori vuoti sembrerebbe funzionante e non lo è.

| Variabile | Valore |
|---|---|
| `SITE` | `https://doesitcrawl-mirror.vercel.app` |
| `STARTED` | la data di accensione |
| `CONTACT` | lo stesso della esca |
| `AUTHOR` | lo stesso della esca: il nome nella riga dell'autore sotto il titolo |
| `TOKEN_ALPHA`, `TOKEN_BETA`, `TOKEN_GAMMA` | tre valori nuovi, generati da te |
| `INGEST_URL` | `https://doesitcrawl.com/ingest` |
| `LOG_KEY` | lo stesso segreto del Worker |
| `SUPABASE_URL` | `https://<ref>.supabase.co`, dal progetto `doesitcrawl` |
| `SUPABASE_KEY` | la chiave **anon**, non la service_role |

La chiave anon basta e va preferita: la politica in
[infra/supabase/schema.sql](../../infra/supabase/schema.sql) le permette solo di aggiungere
righe, non di leggerle, modificarle o cancellarle. Se finisse dove non deve, il
danno massimo è un registro sporcato, non un registro portato via o svuotato.

Poi un redeploy, perché le variabili sono lette all'avvio.

## Verifica dopo l'accensione

Il token beta non deve comparire in nessun byte servito, il gamma deve stare solo
dentro `/e.js`, e la risposta non deve portare `X-Robots-Tag`: un noindex renderebbe
il controllo muto senza dirlo.
