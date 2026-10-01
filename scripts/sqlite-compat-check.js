'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nawafith-sqlite-'));
const file = path.join(dir, 'test.sqlite3');
try {
  const db = new Database(file);
  db.exec('CREATE TABLE t(id INTEGER PRIMARY KEY, value TEXT);');
  db.prepare('INSERT INTO t(value) VALUES(?)').run('وزارة المالية');
  const row = db.prepare('SELECT id,value FROM t WHERE id=?').get(1);
  if (!row || row.value !== 'وزارة المالية') throw new Error('Basic SQLite query failed');

  db.exec("CREATE VIRTUAL TABLE docs_fts USING fts5(title, body); INSERT INTO docs_fts(title,body) VALUES('قرار','وزارة المالية السورية');");
  const hit = db.prepare("SELECT rowid,bm25(docs_fts) score FROM docs_fts WHERE docs_fts MATCH ?").get('وزارة');
  if (!hit || hit.rowid !== 1) throw new Error('FTS5/bm25 query failed');
  db.close();
  console.log('node:sqlite compatibility OK');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
