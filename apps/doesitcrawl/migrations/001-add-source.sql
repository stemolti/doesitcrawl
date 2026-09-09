-- Il database 'bait' e' stato creato il 7 settembre 2026 con lo schema senza la
-- colonna source. Questa migrazione va eseguita una volta sola sul remoto:
--
-- Dalla cartella apps/doesitcrawl, dove sta wrangler.toml:
--
--   npx wrangler d1 execute bait --remote --file=migrations/001-add-source.sql
--
-- Le righe gia' presenti prendono il default 'cloudflare', che e' corretto:
-- prima del mirror l'unica superficie era il Worker.

ALTER TABLE visits ADD COLUMN source TEXT NOT NULL DEFAULT 'cloudflare';

CREATE INDEX IF NOT EXISTS idx_visits_source ON visits (source);
