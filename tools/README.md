# Strumenti

Qui resta quello che non è un'applicazione da distribuire: lo scanner in Python e gli
strumenti che accompagnano le due superfici senza andare in produzione con loro, cioè
il controllo di parità, il generatore della foto e la segnalazione ai motori. Le due
superfici che stanno online — la pagina
esca e la sua copia di controllo — sono diventate app del workspace e stanno in
[../apps/](../apps/).

| Dove | Cosa fa | Quando va acceso |
|---|---|---|
| [scanner/](scanner/) | Scansione appaiata GPTBot/Chrome su una lista di domini | una passata entro il 14 settembre, una il 16 |
| [indexnow.py](indexnow.py) | Segnala a Bing e agli altri motori che la pagina è cambiata, senza aspettare il crawler | dopo ogni deploy che cambia la pagina |
| [page-parity.mjs](page-parity.mjs) | Verifica che esca e copia di controllo servano la stessa pagina, e che beta non stia in nessun byte servito; con `--sync` copia il template del Worker nel mirror | prima di ogni deploy che tocca la pagina |
| [build-avatar.py](build-avatar.py) | Genera da una foto i due moduli con l'immagine dell'autore, come data URI dentro la pagina | quando cambia la foto |
| [../apps/doesitcrawl/](../apps/doesitcrawl/) | Pagina esca a tre marcatori più registro dei crawler, Worker Cloudflare | acceso il 7 settembre 2026 |
| [../apps/doesitcrawl-mirror/](../apps/doesitcrawl-mirror/) | La stessa pagina fuori da Cloudflare, come controllo | da accendere |

I risultati vanno in docs/measurements.md, con la data e la
soglia dichiarata prima.

Lo scanner non è entrato nel workspace pnpm di proposito: è Python, non ha un
`package.json` e non ha niente da fare in `apps/`, che contiene solo cose che si
distribuiscono.

## Cosa questi strumenti non fanno

Non misurano se il Googlebot vero venga bloccato: quella prova richiede lo screenshot
di Search Console di un proprietario consenziente, ed è la metà lenta del cancello del
16 settembre. Non scrivono mail e non cercano clienti. E non sostituiscono il
conteggio a mano delle agenzie GEO europee, che è gratis, si fa in un pomeriggio, e
può far cadere la raccomandazione principale della verifica mondiale prima di
qualunque altra cosa.
