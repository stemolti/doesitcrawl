const s = require('./_shared');

module.exports = async function handler(req, res) {
  if (!s.ready()) return s.notConfigured(res);
  await s.logVisit(req, '/');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.end(s.renderPage());
};
