const s = require('./_shared');

module.exports = async function handler(req, res) {
  await s.logVisit(req, '/sitemap.xml');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.end(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    '<url><loc>' + s.CFG.site + '/</loc><changefreq>daily</changefreq></url>\n' +
    '</urlset>\n'
  );
};
