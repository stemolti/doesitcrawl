const s = require('./_shared');

module.exports = async function handler(req, res) {
  await s.logVisit(req, '/robots.txt');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  // La copia di controllo dev'essere crawlabile quanto l'originale, altrimenti
  // non controlla niente: stesso robots.txt del Worker, sitemap propria.
  res.end('User-agent: *\nAllow: /\n\nSitemap: ' + s.CFG.site + '/sitemap.xml\n');
};
