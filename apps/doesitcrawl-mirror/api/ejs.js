const s = require('./_shared');

module.exports = async function handler(req, res) {
  if (!s.ready()) return s.notConfigured(res);
  await s.logVisit(req, '/e.js');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  // Il token gamma sta qui in chiaro: e' proprio quello che vogliamo misurare.
  res.end('/* canary marker, javascript source only */\nwindow.__canary_gamma = "' + s.CFG.gamma + '";\n');
};
