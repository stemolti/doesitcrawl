-- Registro indipendente della copia di controllo, su Supabase.
--
-- Perche' non basta D1. Il mirror esiste perche' un blocco o un guasto di
-- Cloudflare non lasci traccia; ma se il mirror scrive solo attraverso il Worker
-- su doesitcrawl.com, allora riferisce attraverso la cosa che sta controllando, e
-- quella scrittura fallirebbe in silenzio proprio nel caso che ci interessa.
-- Quindi il mirror scrive due volte: qui, e al Worker. Se le due copie non
-- concordano, il disaccordo e' a sua volta un dato, ed e' visibile.
--
-- Da incollare nel SQL Editor del progetto 'doesitcrawl', una volta sola.

create table if not exists public.visits (
  id              bigint generated always as identity primary key,
  ts              timestamptz not null default now(),
  -- 'vercel' per le visite alla copia di controllo, 'heartbeat' per il battito
  -- quotidiano scritto dal cron. Il battito e' quello che trasforma "non ci sono
  -- righe" in "il registro era vivo quel giorno e non e' passato nessuno".
  source          text not null,
  path            text,
  method          text,
  ua              text,
  ip              text,
  country         text,
  signature_agent text,
  referer         text,
  accept          text,
  family          text
);

create index if not exists visits_ts_idx on public.visits (ts desc);
create index if not exists visits_source_idx on public.visits (source);
create index if not exists visits_family_idx on public.visits (family);

-- La chiave che finisce nelle variabili d'ambiente di Vercel e del Worker e' la
-- chiave pubblica (anon), non la service_role. Con questa politica quella chiave
-- puo' solo aggiungere righe: non puo' leggerle, non puo' modificarle, non puo'
-- cancellarle. Se un giorno finisse dove non deve, il danno massimo e' qualcuno
-- che sporca il registro, non qualcuno che se lo porta via o lo svuota.
alter table public.visits enable row level security;

drop policy if exists "solo inserimento anonimo" on public.visits;
create policy "solo inserimento anonimo"
  on public.visits for insert
  to anon
  with check (true);

-- Le letture si fanno da qui, nel SQL Editor del pannello:
--
--   select date(ts) as giorno, source, family, count(*)
--   from public.visits
--   where family not in ('browser','no-ua') or source = 'heartbeat'
--   group by 1,2,3
--   order by 1 desc;
--
-- Un giorno con una riga 'heartbeat' e nessuna riga di crawler significa che il
-- registro funzionava e non e' passato nessuno. Un giorno senza nemmeno il
-- battito non dice niente, e va escluso dal conto.
