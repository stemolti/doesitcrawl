/**
 * Pagina esca + registro dei crawler, su un solo Worker Cloudflare (piano gratuito).
 *
 * Fa due lavori che nei report sono separati:
 *
 * 1. Il canary test dell'idea 3 della verifica mondiale. Tre token unici sulla
 *    stessa pagina, che rispondono a tre domande diverse:
 *      alpha - nell'HTML servito           -> la pagina e' stata presa e indicizzata
 *      beta  - prodotto solo eseguendo JS  -> il crawler renderizza davvero
 *      gamma - letterale dentro /e.js      -> scarica il JS e ne indicizza il testo
 *    Il token beta non compare in nessun byte servito: viene mandato XOR-ato con
 *    una chiave diversa a ogni richiesta e ricomposto solo a runtime. Se fosse una
 *    stringa dentro lo script, un crawler che scarica il JS senza eseguirlo (il
 *    caso Vercel/MERJ: GPTBot 11,5%, ClaudeBot 23,84%) lo troverebbe lo stesso e
 *    il test direbbe "renderizza" quando non renderizza.
 *
 * 2. Il Worker di logging crawler dei giorni 4-7 del dossier, che e' anche il primo
 *    dei tre lavori venduti nell'idea 1. Lo stesso codice che consegni a un cliente.
 */

import { AVATAR } from './avatar.js';

const FAMILIES = [
  ['gptbot', /gptbot/i],
  ['chatgpt-user', /chatgpt-user/i],
  ['oai-searchbot', /oai-searchbot/i],
  ['claudebot', /claudebot|claude-web|claude-user|claude-searchbot|anthropic-ai/i],
  ['perplexity', /perplexitybot|perplexity-user/i],
  ['googlebot', /googlebot/i],
  ['google-extended', /google-extended/i],
  ['bingbot', /bingbot/i],
  ['applebot', /applebot/i],
  ['bytespider', /bytespider/i],
  ['ccbot', /ccbot/i],
  ['amazonbot', /amazonbot/i],
  ['meta', /meta-externalagent|facebookbot/i],
];

function family(ua) {
  const s = ua || '';
  for (const [name, re] of FAMILIES) if (re.test(s)) return name;
  if (/bot|crawler|spider|slurp|scrape/i.test(s)) return 'other-bot';
  if (!s) return 'no-ua';
  return 'browser';
}

/** XOR con chiave nuova a ogni richiesta: il token in chiaro non viaggia mai. */
function obfuscate(token) {
  const key = 11 + Math.floor(Math.random() * 200);
  const numbers = [];
  for (let i = 0; i < token.length; i++) numbers.push(token.charCodeAt(i) ^ key);
  return { key, numbers };
}

const COLUMNS = ['ts', 'source', 'path', 'method', 'ua', 'ip', 'asn', 'as_org',
  'country', 'verified_bot', 'signature_agent', 'referer', 'accept', 'family'];

async function insertVisit(env, row) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      'INSERT INTO visits (' + COLUMNS.join(', ') + ') VALUES (' +
      COLUMNS.map(() => '?').join(',') + ')'
    ).bind(...COLUMNS.map((c) => (row[c] === undefined ? null : row[c]))).run();
  } catch (e) {
    console.log('registro fallito: ' + e.message);
  }
}

async function logVisit(env, request, url) {
  const cf = request.cf || {};
  const h = request.headers;
  const ua = h.get('User-Agent') || '';
  await insertVisit(env, {
    ts: new Date().toISOString(),
    source: 'cloudflare',
    path: url.pathname,
    method: request.method,
    ua: ua.slice(0, 512),
    ip: h.get('CF-Connecting-IP') || '',
    asn: cf.asn || null,
    as_org: cf.asOrganization || '',
    country: cf.country || '',
    verified_bot: cf.verifiedBotCategory || '',
    signature_agent: (h.get('Signature-Agent') || '').slice(0, 256),
    referer: (h.get('Referer') || '').slice(0, 256),
    accept: (h.get('Accept') || '').slice(0, 256),
    family: family(ua),
  });
}

/**
 * Scrittura dalla copia di controllo fuori da Cloudflare, autenticata con LOG_KEY.
 *
 * Serve perche' un blocco di Cloudflare avviene prima del Worker: il crawler
 * bloccato non lascia traccia qui, e un registro vuoto e' indistinguibile da un
 * crawler che non e' mai venuto. Il mirror registra dalla sua parte e manda qui, e
 * la differenza fra le due colonne source e' la risposta.
 *
 * La richiesta arriva dal server del mirror, non dal crawler: asn, as_org e
 * verified_bot restano vuoti perche' quei dati li produce solo Cloudflare.
 */
async function ingest(request, env) {
  if (request.method !== 'POST') {
    return new Response('no\n', { status: 405, headers: { 'Content-Type': 'text/plain' } });
  }
  const key = request.headers.get('X-Log-Key') || '';
  const expected = env.LOG_KEY || '';
  if (!expected || key.length !== expected.length || key !== expected) {
    return new Response('no\n', { status: 401, headers: { 'Content-Type': 'text/plain' } });
  }
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response('json non valido\n', { status: 400, headers: { 'Content-Type': 'text/plain' } });
  }
  const s = (v, n) => String(v === null || v === undefined ? '' : v).slice(0, n);
  const ua = s(body.ua, 512);
  await insertVisit(env, {
    ts: new Date().toISOString(),
    source: s(body.source, 32) || 'mirror',
    path: s(body.path, 256) || '/',
    method: s(body.method, 16) || 'GET',
    ua,
    ip: s(body.ip, 64),
    asn: null,
    as_org: '',
    country: s(body.country, 8),
    verified_bot: '',
    signature_agent: s(body.signature_agent, 256),
    referer: s(body.referer, 256),
    accept: s(body.accept, 256),
    family: family(ua),
  });
  return new Response('ok\n', { headers: { 'Content-Type': 'text/plain' } });
}

function renderPage(env) {
  const b = obfuscate(env.TOKEN_BETA);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Do AI crawlers execute JavaScript? A public canary, 2026</title>
<meta name="description" content="An open, continuously running test of whether GPTBot, ClaudeBot and PerplexityBot execute JavaScript before indexing a page.">
<link rel="canonical" href="${env.SITE}/">
<script>try{if(localStorage.getItem('theme')==='light')document.documentElement.setAttribute('data-theme','light')}catch(e){}</script>
<style>
:root{color-scheme:dark;--bg:#0b0b0b;--ink:#f1f1f1;--mute:#8d8d8d;--line:#262626;--soft:#161616;
--sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
--serif:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,"Times New Roman",serif;
--mono:ui-monospace,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace}
:root[data-theme="light"]{color-scheme:light;--bg:#fff;--ink:#111;--mute:#6f6f6f;--line:#e4e4e4;--soft:#f4f4f4}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;color:var(--ink);font:17px/1.6 var(--sans);-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration-color:var(--mute);text-underline-offset:.15em}
.wrap{max-width:46rem;margin:0 auto;padding:0 1.25rem}
.top{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:1.1rem 0;border-bottom:1px solid var(--line);font:12px/1 var(--mono);letter-spacing:.05em;text-transform:uppercase;color:var(--mute)}
.top strong{color:var(--ink);font-weight:500}
.top .status{white-space:nowrap}
.top .right{display:flex;align-items:center;gap:1rem}
.theme{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;margin:-8px 0;padding:0;border:0;border-radius:50%;background:none;color:var(--mute);cursor:pointer}
.theme:hover{color:var(--ink);background:var(--soft)}
.theme svg{width:16px;height:16px}
.dot{display:inline-block;width:.5em;height:.5em;border-radius:50%;background:var(--ink);margin-right:.6em;vertical-align:baseline}
.hero{padding:4.5rem 0 3rem}
.kicker{font:12px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--mute);margin:0 0 1.5rem}
h1{font:400 clamp(2.4rem,6vw,3.6rem)/1.05 var(--serif);letter-spacing:-.02em;margin:0 0 1.25rem;text-wrap:balance}
.byline{display:flex;align-items:center;gap:.75rem;margin:0 0 2rem;font:12px/1.5 var(--mono);color:var(--mute)}
.byline b{display:block;font:500 .95rem/1.3 var(--sans);color:var(--ink);margin-bottom:.1rem}
.avatar{width:40px;height:40px;border-radius:50%;object-fit:cover;flex:none}
.lede{font-size:1.15rem;line-height:1.55;margin:0;max-width:38rem}
h2{font:500 1rem/1.3 var(--sans);margin:3.5rem 0 1rem;padding-top:1.25rem;border-top:1px solid var(--line)}
.ledger+h2{border-top:0;padding-top:0;margin-top:3rem}
p{margin:0 0 1rem;max-width:38rem}
code{font:.9em var(--mono)}
.ledger{list-style:none;margin:1.5rem 0 0;padding:0;border-top:1px solid var(--line)}
.ledger li{display:grid;grid-template-columns:3rem 1fr;gap:0 1rem;padding:1.25rem 0;border-bottom:1px solid var(--line)}
.num{font:12px/1.7 var(--mono);color:var(--mute);letter-spacing:.06em;padding-top:.15rem}
.ledger h3{margin:0 0 .35rem;font:500 1rem/1.4 var(--sans);display:flex;flex-wrap:wrap;gap:.35rem .75rem;align-items:baseline}
.where{font:11px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
.ledger p{margin:0;color:var(--mute);font-size:.95rem}
.val{display:block;margin-top:.8rem;font:.85rem/1.5 var(--mono);color:var(--ink);background:var(--soft);padding:.55rem .8rem;border-radius:4px;overflow-wrap:anywhere}
footer{margin:4rem 0 0;padding:1.5rem 0 3rem;border-top:1px solid var(--line);display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem;font:12px/1.7 var(--mono);color:var(--mute)}
footer b{display:block;color:var(--ink);font-weight:500;text-transform:uppercase;letter-spacing:.06em;font-size:11px;margin-bottom:.3rem}
@media (max-width:40rem){.hero{padding:3rem 0 2rem}.top{font-size:11px}.top .sub{display:none}.top .right{gap:.5rem}.ledger li{grid-template-columns:2.25rem 1fr;gap:0 .75rem}footer{grid-template-columns:1fr;gap:1rem}}
</style>
</head>
<body>
<div class="wrap">

<header class="top">
<span><strong>Canary</strong><span class="sub"> &middot; AI crawlers vs JavaScript</span></span>
<span class="right"><span class="status"><span class="dot"></span>Running since ${env.STARTED}</span><button class="theme" id="theme" type="button" aria-label="Toggle light mode" aria-pressed="false"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.75v12.5A6.25 6.25 0 0 0 8 1.75Z" fill="currentColor"/></svg></button></span>
</header>

<section class="hero">
<p class="kicker">An open, continuously running test &middot; 2026</p>
<h1>Do AI crawlers execute JavaScript?</h1>
<div class="byline">${AVATAR ? '<img class="avatar" src="' + AVATAR + '" alt="" width="40" height="40">' : ''}<div><b>${env.AUTHOR}</b>${/^https?:\/\//.test(env.CONTACT) ? '<a href="' + env.CONTACT + '">' + env.CONTACT.replace(/^https?:\/\//, '') + '</a>' : env.CONTACT}</div></div>
<p class="lede">The most cited measurement on this question is Vercel and MERJ's December 2024
analysis of more than 500 million GPTBot fetches, which observed no JavaScript
execution at all. As of September 2026 no public test has replicated it. This page
is a small, permanent attempt to keep the answer current.</p>
</section>

<h2>How it works</h2>

<p>Three unique markers live on this page. Each one, if it later shows up in an
AI assistant's answer, proves a different thing.</p>

<ol class="ledger">
<li><span class="num">01</span><div>
<h3>Marker one <span class="where">in the served HTML</span></h3>
<p>It only proves the page was fetched and retained.</p>
<code class="val">${env.TOKEN_ALPHA}</code>
</div></li>
<li><span class="num">02</span><div>
<h3>Marker two <span class="where">never in any served byte</span></h3>
<p>It is transmitted as an XOR-encoded array with a key that changes on every request, and it
is reassembled in the DOM only by running the script below.</p>
<code class="val" id="beta">(requires JavaScript execution)</code>
</div></li>
<li><span class="num">03</span><div>
<h3>Marker three <span class="where">plain string in an external file</span></h3>
<p>It lives in <code>/e.js</code> and is never inserted into the page. It separates crawlers that
download and read JavaScript source from crawlers that actually run it.</p>
<code class="val"><a href="/e.js">/e.js</a></code>
</div></li>
</ol>

<h2>Why the second marker is hidden from the source</h2>

<p>GPTBot downloads JavaScript files in about 11.5% of its requests and ClaudeBot in
about 23.84%, without executing them. If the marker were a literal in the script, a
crawler that merely ingested the file would surface it, and the test would report
rendering where there is none.</p>

<h2>Verification</h2>

<p>Crawl visits are logged server-side with the originating IP and autonomous system,
and are checked against the IP ranges published by the operators themselves. A
user-agent string on its own proves nothing.</p>

<footer>
<div><b>Started</b>${env.STARTED}</div>
<div><b>Terms</b>Independent, non-commercial, no tracking, no cookies.</div>
<div><b>Contact</b>${/^https?:\/\//.test(env.CONTACT) ? '<a href="' + env.CONTACT + '">' + env.CONTACT.replace(/^https?:\/\//, '') + '</a>' : env.CONTACT}</div>
</footer>

</div>
<script src="/e.js"></script>
<script>
(function () {
  var n = [${b.numbers.join(',')}], k = ${b.key}, s = '';
  for (var i = 0; i < n.length; i++) s += String.fromCharCode(n[i] ^ k);
  var el = document.getElementById('beta');
  if (el) el.textContent = s;
  document.title = document.title + ' [' + s + ']';
})();
</script>
<script>
(function () {
  var b = document.getElementById('theme'), r = document.documentElement;
  if (!b) return;
  function paint() { b.setAttribute('aria-pressed', r.getAttribute('data-theme') === 'light' ? 'true' : 'false'); }
  b.addEventListener('click', function () {
    var light = r.getAttribute('data-theme') !== 'light';
    if (light) r.setAttribute('data-theme', 'light'); else r.removeAttribute('data-theme');
    try { localStorage.setItem('theme', light ? 'light' : 'dark'); } catch (e) {}
    paint();
  });
  paint();
})();
</script>
</body>
</html>`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;

    // Nessuna di queste si registra, e per tre ragioni diverse: /log sono le tue
    // visite, /ingest e' il mirror che parla al Worker, e il file della chiave
    // IndexNow lo rilegge un motore ogni volta che gli si segnala un indirizzo.
    // Nessuna delle tre e' un crawler che visita la pagina, e lasciarle nel
    // registro vorrebbe dire contare come passaggi delle cose che abbiamo
    // provocato noi.
    if (p === '/log') return dumpLog(request, env, url);
    if (p === '/ingest') return ingest(request, env);
    if (env.INDEXNOW_KEY && p === '/' + env.INDEXNOW_KEY + '.txt') {
      // Il protocollo vuole un file che contenga solo la chiave, e che stia sullo
      // stesso host degli indirizzi segnalati: e' cosi' che il motore verifica che
      // chi segnala controlli davvero il dominio. Non e' un segreto, al contrario:
      // deve essere pubblico per funzionare.
      return new Response(env.INDEXNOW_KEY + '\n', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
      });
    }

    ctx.waitUntil(logVisit(env, request, url));

    if (p === '/' || p === '/index.html') {
      return new Response(renderPage(env), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }

    if (p === '/e.js') {
      // Il token gamma sta qui in chiaro: e' proprio quello che vogliamo misurare.
      const js = '/* canary marker, javascript source only */\n' +
        'window.__canary_gamma = "' + env.TOKEN_GAMMA + '";\n';
      return new Response(js, {
        headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
      });
    }

    if (p === '/robots.txt') {
      // La pagina deve essere crawlabile da tutti: e' il senso dell'esperimento.
      return new Response(
        'User-agent: *\nAllow: /\n\nSitemap: ' + env.SITE + '/sitemap.xml\n',
        { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
      );
    }

    if (p === '/sitemap.xml') {
      const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        '<url><loc>' + env.SITE + '/</loc><changefreq>daily</changefreq></url>\n' +
        '</urlset>\n';
      return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
    }

    return new Response('not found\n', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  },

  /**
   * Battito quotidiano, scritto in tutti e due i registri.
   *
   * Non serve a tenere in piedi niente di tecnico: serve a rendere leggibili i
   * giorni vuoti. Senza, "non ci sono righe" puo' voler dire che non e' passato
   * nessuno oppure che il registro era rotto, e a fine ottobre le due cose non si
   * distinguono piu'. Con il battito, un giorno con la riga e senza crawler dice
   * che il registro era vivo e non e' passato nessuno; un giorno senza battito
   * non dice niente e va escluso dal conto.
   *
   * Sul piano gratuito di Supabase serve anche a non far mettere in pausa il
   * progetto per inattivita', che e' proprio cio' che succederebbe nelle settimane
   * di silenzio prima della prima visita.
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(heartbeat(env));
  },
};

async function heartbeat(env) {
  const ts = new Date().toISOString();
  await insertVisit(env, {
    ts: ts, source: 'heartbeat', path: '/', method: 'CRON', ua: '',
    ip: '', asn: null, as_org: '', country: '', verified_bot: '',
    signature_agent: '', referer: '', accept: '', family: 'heartbeat',
  });

  const url = (env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_KEY || '';
  if (!url || !key) return;
  try {
    const r = await fetch(url + '/rest/v1/visits', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: 'Bearer ' + key,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        source: 'heartbeat', path: '/', method: 'CRON', family: 'heartbeat',
      }),
    });
    if (!r.ok) console.log('battito rifiutato da Supabase: ' + r.status);
  } catch (e) {
    console.log('battito fallito: ' + e.message);
  }
}

/** Dump del registro. Non viene loggato, per non sporcare i dati con le tue visite. */
async function dumpLog(request, env, url) {
  const key = url.searchParams.get('key') || '';
  const expected = env.LOG_KEY || '';
  if (!expected || key.length !== expected.length || key !== expected) {
    return new Response('no\n', { status: 401, headers: { 'Content-Type': 'text/plain' } });
  }
  if (!env.DB) return new Response('nessun database collegato\n', { status: 500 });

  const botsOnly = url.searchParams.get('bot') === '1';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '2000', 10) || 2000, 10000);
  const where = [];
  if (botsOnly) where.push("family NOT IN ('browser','no-ua')");
  // ?source=cloudflare o ?source=vercel per guardare una superficie sola.
  const wanted = url.searchParams.get('source');
  if (wanted === 'cloudflare' || wanted === 'vercel') where.push("source = '" + wanted + "'");
  const sql =
    'SELECT ts, source, path, family, ua, ip, asn, as_org, country, verified_bot, signature_agent' +
    ' FROM visits' + (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ' ORDER BY id DESC LIMIT ?';
  const { results } = await env.DB.prepare(sql).bind(limit).all();

  if (url.searchParams.get('format') === 'csv') {
    const col = ['ts', 'source', 'path', 'family', 'ua', 'ip', 'asn', 'as_org', 'country', 'verified_bot', 'signature_agent'];
    const esc = (v) => '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"';
    const rows = [col.join(',')].concat(results.map((r) => col.map((c) => esc(r[c])).join(',')));
    return new Response(rows.join('\n') + '\n', {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="log.csv"' },
    });
  }
  return new Response(JSON.stringify({ rows: results.length, visits: results }, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
