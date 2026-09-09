/**
 * Copia di controllo della pagina esca, fuori da Cloudflare.
 *
 * Perche' esiste. Un blocco di Cloudflare avviene prima del Worker: il crawler
 * bloccato non lascia traccia nel registro, e un registro vuoto e' indistinguibile
 * da un crawler che non e' mai passato. Questa copia gira su Vercel, registra dalla
 * sua parte e manda le visite allo stesso database D1 con source = 'vercel'. Il
 * confronto fra le due colonne separa tre cose che altrimenti collassano in una:
 *
 *   niente su cloudflare, visite su vercel -> Cloudflare blocca, e sai il giorno
 *   niente su nessuna delle due            -> problema di scoperta
 *   visite su entrambe, beta mai sui motori -> non renderizzano: la risposta cercata
 *
 * REGOLA: la pagina servita qui dev'essere strutturalmente identica a quella del
 * Worker. Le uniche differenze ammesse sono i tre token e l'URL canonico, che deve
 * puntare a questa copia e non all'originale: se puntasse la' i motori la
 * tratterebbero come duplicato e il controllo sparirebbe. Ogni altra differenza
 * trasforma il confronto fra due host in un confronto fra due pagine.
 */

const { AVATAR } = require('./avatar.js');

const CFG = {
  site: process.env.SITE || '',
  started: process.env.STARTED || '',
  author: process.env.AUTHOR || '',
  contact: process.env.CONTACT || '',
  alpha: process.env.TOKEN_ALPHA || '',
  beta: process.env.TOKEN_BETA || '',
  gamma: process.env.TOKEN_GAMMA || '',
  ingest: process.env.INGEST_URL || '',
  logKey: process.env.LOG_KEY || '',
  supabaseUrl: (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
  supabaseKey: process.env.SUPABASE_KEY || '',
};

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
  for (let i = 0; i < FAMILIES.length; i++) if (FAMILIES[i][1].test(s)) return FAMILIES[i][0];
  if (/bot|crawler|spider|slurp|scrape/i.test(s)) return 'other-bot';
  if (!s) return 'no-ua';
  return 'browser';
}

/** XOR con chiave nuova a ogni richiesta: il token in chiaro non viaggia mai. */
function obfuscate(token) {
  const key = 11 + Math.floor(Math.random() * 200);
  const numbers = [];
  for (let i = 0; i < token.length; i++) numbers.push(token.charCodeAt(i) ^ key);
  return { key: key, numbers: numbers };
}

/**
 * Senza i tre token e l'URL non c'e' esperimento: meglio un 503 esplicito che una
 * pagina servita con i marcatori vuoti, che sembrerebbe funzionante e non lo e'.
 */
function ready() {
  return Boolean(CFG.site && CFG.alpha && CFG.beta && CFG.gamma);
}

function notConfigured(res) {
  res.statusCode = 503;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end('not configured: SITE, TOKEN_ALPHA, TOKEN_BETA, TOKEN_GAMMA\n');
}

function visitRow(req, path) {
  const h = req.headers || {};
  const fwd = String(h['x-forwarded-for'] || '');
  const ua = h['user-agent'] || '';
  return {
    source: 'vercel',
    path: path,
    method: req.method || 'GET',
    ua: ua,
    ip: fwd.split(',')[0].trim() || h['x-real-ip'] || '',
    country: h['x-vercel-ip-country'] || '',
    signature_agent: h['signature-agent'] || '',
    referer: h['referer'] || '',
    accept: h['accept'] || '',
    family: family(ua),
  };
}

async function postJson(url, headers, body, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(function () { ctrl.abort(); }, ms);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!r.ok) console.log('registro ' + url + ' ha risposto ' + r.status);
    return r.ok;
  } catch (e) {
    console.log('registro ' + url + ' fallito: ' + e.message);
    return false;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Registra la visita in due posti, e sono due perche' uno solo non basta.
 *
 * Su Supabase, che e' il registro indipendente: e' l'unico che sopravvive se
 * Cloudflare blocca o si guasta, cioe' esattamente il caso per cui questa copia
 * esiste. Un mirror che riferisse solo attraverso il Worker su doesitcrawl.com
 * riferirebbe attraverso la cosa che sta controllando.
 *
 * E al Worker, che tiene il registro comodo su D1 con le due superfici insieme.
 *
 * Le due scritture sono indipendenti: se una fallisce l'altra parte lo stesso, e
 * un disaccordo fra le due copie e' a sua volta un dato. La risposta al crawler
 * non fallisce mai per colpa del registro.
 */
async function logVisit(req, path) {
  const row = visitRow(req, path);
  const jobs = [];
  if (CFG.supabaseUrl && CFG.supabaseKey) {
    jobs.push(postJson(CFG.supabaseUrl + '/rest/v1/visits', {
      apikey: CFG.supabaseKey,
      Authorization: 'Bearer ' + CFG.supabaseKey,
      Prefer: 'return=minimal',
    }, row, 2500));
  }
  if (CFG.ingest && CFG.logKey) {
    jobs.push(postJson(CFG.ingest, { 'X-Log-Key': CFG.logKey }, row, 2000));
  }
  await Promise.allSettled(jobs);
}

function renderPage() {
  const b = obfuscate(CFG.beta);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Do AI crawlers execute JavaScript? A public canary, 2026</title>
<meta name="description" content="An open, continuously running test of whether GPTBot, ClaudeBot and PerplexityBot execute JavaScript before indexing a page.">
<link rel="canonical" href="${CFG.site}/">
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
<span class="right"><span class="status"><span class="dot"></span>Running since ${CFG.started}</span><button class="theme" id="theme" type="button" aria-label="Toggle light mode" aria-pressed="false"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.75v12.5A6.25 6.25 0 0 0 8 1.75Z" fill="currentColor"/></svg></button></span>
</header>

<section class="hero">
<p class="kicker">An open, continuously running test &middot; 2026</p>
<h1>Do AI crawlers execute JavaScript?</h1>
<div class="byline">${AVATAR ? '<img class="avatar" src="' + AVATAR + '" alt="" width="40" height="40">' : ''}<div><b>${CFG.author}</b>${/^https?:\/\//.test(CFG.contact) ? '<a href="' + CFG.contact + '">' + CFG.contact.replace(/^https?:\/\//, '') + '</a>' : CFG.contact}</div></div>
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
<code class="val">${CFG.alpha}</code>
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
<div><b>Started</b>${CFG.started}</div>
<div><b>Terms</b>Independent, non-commercial, no tracking, no cookies.</div>
<div><b>Contact</b>${/^https?:\/\//.test(CFG.contact) ? '<a href="' + CFG.contact + '">' + CFG.contact.replace(/^https?:\/\//, '') + '</a>' : CFG.contact}</div>
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

module.exports = { CFG, family, obfuscate, ready, notConfigured, logVisit, renderPage };
