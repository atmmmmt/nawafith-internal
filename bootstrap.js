'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = Number(process.env.PORT || 3000);
const FILE = 'nawafith_internal.sqlite3';

function candidates() {
  const out = [];
  const seen = new Set();
  const add = p => { if (p && !seen.has(p)) { seen.add(p); out.push(p); } };

  for (const start of [__dirname, process.cwd()]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 10; i++) {
      add(path.join(dir, 'public_html', 'nawafith-data', FILE));
      add(path.join(dir, 'nawafith-data', FILE));
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  const home = process.env.HOME;
  if (home) {
    add(path.join(home, 'public_html', 'nawafith-data', FILE));
    const domains = path.join(home, 'domains');
    try {
      for (const name of fs.readdirSync(domains)) {
        add(path.join(domains, name, 'public_html', 'nawafith-data', FILE));
      }
    } catch (_) {}
  }

  if (process.env.NAWAFITH_ARCHIVE_DB) add(process.env.NAWAFITH_ARCHIVE_DB);
  add(path.join(__dirname, 'data', FILE));
  return out;
}

const checked = candidates().map(p => {
  try {
    return { path: p, exists: fs.existsSync(p), size: fs.existsSync(p) ? fs.statSync(p).size : 0 };
  } catch (e) {
    return { path: p, exists: false, size: 0, error: e.message };
  }
});
const found = checked.find(x => x.exists && x.size > 100 * 1024 * 1024);

function diagnostic(reason) {
  const payload = {
    ok: false,
    bootstrap: true,
    node: process.version,
    cwd: process.cwd(),
    dirname: __dirname,
    reason,
    checked
  };
  const server = http.createServer((req, res) => {
    res.statusCode = req.url === '/health' ? 200 : 503;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload, null, 2));
  });
  server.listen(PORT, '0.0.0.0', () => console.error('Diagnostic server listening on', PORT, reason));
}

if (!found) {
  diagnostic('Archive SQLite file not found. Extract nawafith_internal.sqlite3 under public_html/nawafith-data.');
} else {
  process.env.NAWAFITH_ARCHIVE_DB = found.path;
  if (!process.env.LOCAL_STATE_DB) {
    process.env.LOCAL_STATE_DB = path.join(path.dirname(found.path), 'nawafith_state.sqlite3');
  }
  console.log('Bootstrap archive:', found.path, found.size);
  console.log('Bootstrap state:', process.env.LOCAL_STATE_DB);
  try {
    require('./server.js');
  } catch (err) {
    console.error('Server bootstrap failed:', err);
    diagnostic(`Server bootstrap failed: ${err && err.message ? err.message : String(err)}`);
  }
}
