// Tiny local server for the render page: static files plus POST /save?name=file.
const http = require('http'), fs = require('fs'), path = require('path');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/save') {
    const name = path.basename(url.searchParams.get('name') || 'out.png');
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => { fs.writeFileSync(path.join(__dirname, 'out', name), Buffer.concat(chunks)); res.end('ok'); });
    return;
  }
  const file = path.join(__dirname, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!file.startsWith(__dirname) || !fs.existsSync(file)) { res.statusCode = 404; return res.end('nope'); }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(file).pipe(res);
}).listen(3122, '127.0.0.1');
