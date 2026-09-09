#!/usr/bin/env node
/**
 * Controlla che la pagina esca e la sua copia di controllo servano la stessa pagina.
 *
 * La regola sta in apps/doesitcrawl-mirror/README.md: le due pagine devono essere
 * strutturalmente identiche, e le uniche differenze ammesse sono i tre token e l'URL
 * canonico. Ogni altra differenza trasforma il confronto fra due host in un confronto
 * fra due pagine, e il controllo smette di controllare. Il template pero' e' scritto
 * due volte, in due file che si distribuiscono da soli e con due sintassi di modulo
 * diverse, quindi puo' divergere senza che nessuno se ne accorga.
 *
 * Lo script estrae il template da tutti e due i sorgenti, riporta gli identificatori
 * del mirror (CFG.alpha) a quelli del Worker (env.TOKEN_ALPHA) e confronta il testo.
 * Poi rende le due pagine con valori finti e verifica le proprieta' che il test
 * richiede: alpha presente una volta sola, beta assente da ogni byte, gamma assente,
 * script /e.js presente, canonico presente, nessuna risorsa esterna.
 *
 *   node tools/page-parity.mjs                 # controlla, esce 1 se qualcosa non va
 *   node tools/page-parity.mjs --sync          # prima copia il template del Worker nel mirror
 *   node tools/page-parity.mjs --preview DIR   # scrive anche DIR/worker.html e DIR/mirror.html
 *
 * Il modo di lavorare e': si modifica solo worker.js, poi --sync, poi il controllo.
 * Nessuna dipendenza, nessun token vero: i marcatori usati qui sono finti e possono
 * stare in un file versionato. Nome e contatto sono quelli veri, che sono pubblici.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKER = join(root, 'apps/doesitcrawl/src/worker.js');
const MIRROR = join(root, 'apps/doesitcrawl-mirror/api/_shared.js');
const AVATAR_WORKER = join(root, 'apps/doesitcrawl/src/avatar.js');
const AVATAR_MIRROR = join(root, 'apps/doesitcrawl-mirror/api/avatar.js');

// [nome nel mirror, nome nel Worker]
const MAP = [
  ['CFG.site', 'env.SITE'],
  ['CFG.started', 'env.STARTED'],
  ['CFG.author', 'env.AUTHOR'],
  ['CFG.contact', 'env.CONTACT'],
  ['CFG.alpha', 'env.TOKEN_ALPHA'],
  ['CFG.beta', 'env.TOKEN_BETA'],
  ['CFG.gamma', 'env.TOKEN_GAMMA'],
];

// Marcatori finti, riconoscibili, che non somigliano a quelli veri.
const FAKE = {
  SITE: 'https://example.invalid',
  STARTED: '2026-09-07',
  AUTHOR: 'Stefano Agbodan',
  CONTACT: 'https://github.com/stemolti',
  TOKEN_ALPHA: 'fake-alpha-0000000000',
  TOKEN_BETA: 'fake-beta-1111111111',
  TOKEN_GAMMA: 'fake-gamma-2222222222',
};

const OPEN = 'return `<!doctype html>';
const CLOSE = '</html>`;';

function region(file) {
  const src = readFileSync(file, 'utf8');
  const start = src.indexOf(OPEN);
  const end = src.indexOf(CLOSE, start);
  if (start < 0 || end < 0) throw new Error('template non trovato in ' + file);
  return { src, start, end };
}

function extract(file) {
  const { src, start, end } = region(file);
  return src.slice(start + 'return `'.length, end + '</html>'.length).replace(/\r\n/g, '\n');
}

function toMirror(tpl) {
  let out = tpl;
  for (const [m, w] of MAP) out = out.split(w).join(m);
  return out;
}

function toWorker(tpl) {
  let out = tpl;
  for (const [m, w] of MAP) out = out.split(m).join(w);
  return out;
}

function readAvatar(file) {
  const m = readFileSync(file, 'utf8').match(/AVATAR\s*[=:]\s*'([^']*)'/);
  if (!m) throw new Error('AVATAR non trovato in ' + file);
  return m[1];
}

function obfuscate(token) {
  const key = 11 + Math.floor(Math.random() * 200);
  const numbers = [];
  for (let i = 0; i < token.length; i++) numbers.push(token.charCodeAt(i) ^ key);
  return { key, numbers };
}

function render(tpl, env, avatar) {
  // Il template e' un template literal: lo si valuta come tale, con gli stessi nomi
  // liberi che ha nel Worker (env, b e AVATAR).
  const fn = new Function('env', 'b', 'AVATAR', 'return `' + tpl + '`;');
  return fn(env, obfuscate(env.TOKEN_BETA), avatar);
}

function count(hay, needle) {
  return hay.split(needle).length - 1;
}

if (process.argv.includes('--sync')) {
  const worker = extract(WORKER);
  const { src, start, end } = region(MIRROR);
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const body = toMirror(worker).split('\n').join(eol);
  writeFileSync(MIRROR, src.slice(0, start) + 'return `' + body + '`;' + src.slice(end + CLOSE.length));
  console.log('template del Worker copiato nel mirror');
}

const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); console.log((ok ? 'ok  ' : 'NO  ') + msg); };

const w = extract(WORKER);
const m = toWorker(extract(MIRROR));
check(w === m, 'i due template sono identici a meno degli identificatori');
if (w !== m) {
  const a = w.split('\n'), b = m.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      console.log('    prima differenza alla riga ' + (i + 1));
      console.log('    worker: ' + JSON.stringify(a[i]));
      console.log('    mirror: ' + JSON.stringify(b[i]));
      break;
    }
  }
}

const avatars = { worker: readAvatar(AVATAR_WORKER), mirror: readAvatar(AVATAR_MIRROR) };
check(avatars.worker === avatars.mirror, 'la foto dell\'autore e\' la stessa nei due moduli');
check(avatars.worker === '' || avatars.worker.startsWith('data:image/'), 'la foto e\' un data URI, non un file esterno');
if (avatars.worker === '') console.log('    (nessuna foto: la riga dell\'autore esce senza immagine, vedi tools/build-avatar.py)');

const pages = { worker: render(w, FAKE, avatars.worker), mirror: render(m, FAKE, avatars.mirror) };
const allowed = /^https?:\/\/(example\.invalid|github\.com\/stemolti)/;
for (const [name, html] of Object.entries(pages)) {
  check(count(html, FAKE.TOKEN_ALPHA) === 1, name + ': alpha presente una volta sola');
  check(count(html, FAKE.TOKEN_BETA) === 0, name + ': beta assente da ogni byte servito');
  check(count(html, FAKE.TOKEN_GAMMA) === 0, name + ': gamma assente dalla pagina');
  check(html.includes('<script src="/e.js"></script>'), name + ': script /e.js presente');
  check(html.includes('<link rel="canonical" href="' + FAKE.SITE + '/">'), name + ': canonico presente');
  check(html.includes('id="beta"'), name + ': contenitore del beta presente');
  check(html.includes('id="theme"'), name + ': interruttore del tema presente');
  check(html.includes(FAKE.AUTHOR), name + ': riga dell\'autore presente');
  const urls = html.match(/https?:\/\/[^"'\s<)]+/g) || [];
  check(urls.every((u) => allowed.test(u)), name + ': nessuna risorsa esterna' + (urls.some((u) => !allowed.test(u)) ? ' (' + urls.filter((u) => !allowed.test(u)).join(', ') + ')' : ''));
}

const i = process.argv.indexOf('--preview');
if (i > 0 && process.argv[i + 1]) {
  const dir = process.argv[i + 1];
  mkdirSync(dir, { recursive: true });
  for (const [name, html] of Object.entries(pages)) writeFileSync(join(dir, name + '.html'), html);
  console.log('anteprime scritte in ' + dir);
}

if (problems.length) {
  console.log('\n' + problems.length + ' problema/i');
  process.exit(1);
}
