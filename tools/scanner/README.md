# Scansione appaiata GPTBot/Chrome

Lo strumento della prima misura del cancello del 16 settembre, idea 2 della verifica
mondiale.

## La finestra si chiude il 15 settembre

Il report dice «*rifai* la scansione su 500 domini» il 16 settembre. Quel verbo
presuppone un primo passaggio che non è mai stato fatto. Senza una misura presa
prima del cambio, il tasso del 16 non è distinguibile dai falsi positivi dello
script stesso, ed è esattamente l'affermazione per cui ti faresti pagare. Dopo il 15
quel dato non è più recuperabile.

```bash
python scan.py --domains domains.csv --label baseline-pre-15
```

Il 16 settembre, stesso file di domini, etichetta diversa:

```bash
python scan.py --domains domains.csv --label gate-16-september
```

Serve solo `requests`. Riprende da dove si era fermato se lo interrompi.

## Da dove prendono i domini

Un file con un dominio per riga, oppure un CSV in formato Tranco (`rank,domain`),
oppure URL interi: lo script normalizza da solo. La lista dev'essere **la stessa**
nelle due passate, altrimenti stai confrontando due popolazioni diverse.

## Cosa misura, e cosa no

Per ogni dominio fa tre richieste dalla stessa macchina, quindi dallo stesso IP:
`robots.txt` con user-agent Chrome, la home con Chrome, la home con GPTBot.

- `training_blocked` — robots.txt ha un gruppo `Disallow: /` per almeno un crawler AI
- `edge_defect` — Chrome prende 200 e GPTBot prende 401/403/429/451/503
- `robots_managed_by_cf` + `robots_marker_lines` — tracce che il file sia gestito da
  Cloudflare, con le righe grezze salvate per intero: i marker sono ipotesi mie, non
  verificate contro un file reale, e vanno letti a mano prima di dichiarare un tasso

**Il blocco del Googlebot vero non è misurabile da qui, e lo script si rifiuta di
provarci.** Uno user-agent Googlebot da un IP di datacenter è impersonation:
Cloudflare sfida sempre quella richiesta e lo script scriverebbe come difetto un 403
che si è inventato da solo. Il controllo `check_forbidden_ua()` ferma il programma
se qualcuno ci prova. Quella misura è la seconda del cancello e richiede lo
screenshot di Search Console di 20 proprietari consenzienti: è la metà lenta, e le
persone vanno cercate adesso, non il 16.

## Il filtro anti-falso-positivo

Se la richiesta con Chrome non torna 200 con `text/html`, il dominio esce da tutti i
tassi con il motivo scritto in `exclusion_reason`. Serve: nella prova su otto domini
`stackoverflow.com` ha risposto 403 a entrambe le gambe, e senza il filtro sarebbe
finito nel conteggio come difetto.

I domini con `edge_defect` ma senza `training_blocked` finiscono in `notes` e vanno
guardati a mano. Nella stessa prova era il caso di `reddit.com`: bloccato al bordo,
ma non da un `Disallow` in robots.txt. Se quella colonna è grossa, il metro ha un
difetto suo e il tasso non vale niente.

## Soglia, scritta prima di partire

Sotto il 2-3% l'idea 2 si chiude il giorno stesso. Vale anche l'altra: se su 20
domini con Training bloccato nessuno mostra il blocco di Googlebot in Search
Console, l'idea cade con lo stesso automatismo.

I risultati vanno in measurements.md con la data.
