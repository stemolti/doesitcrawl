CREATE TABLE IF NOT EXISTS visits (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ts              TEXT NOT NULL,
  -- Da quale superficie arriva la visita: 'cloudflare' per la pagina esca sul
  -- Worker, 'vercel' per la copia di controllo fuori da Cloudflare. Il confronto
  -- fra le due colonne e' cio' che distingue "bloccato al bordo" da "mai passato".
  source          TEXT NOT NULL DEFAULT 'cloudflare',
  path            TEXT NOT NULL,
  method          TEXT,
  ua              TEXT,
  ip              TEXT,
  -- asn, as_org e verified_bot li riempie solo Cloudflare: dal mirror restano
  -- vuoti, e la verifica dell'identita' del bot va rifatta a mano sulle fasce IP.
  asn             INTEGER,
  as_org          TEXT,
  country         TEXT,
  verified_bot    TEXT,
  signature_agent TEXT,
  referer         TEXT,
  accept          TEXT,
  family          TEXT
);

CREATE INDEX IF NOT EXISTS idx_visits_ts ON visits (ts);
CREATE INDEX IF NOT EXISTS idx_visits_family ON visits (family);
CREATE INDEX IF NOT EXISTS idx_visits_ip ON visits (ip);
CREATE INDEX IF NOT EXISTS idx_visits_source ON visits (source);
