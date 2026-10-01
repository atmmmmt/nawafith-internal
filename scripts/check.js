const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.NAWAFITH_ARCHIVE_DB || path.join(__dirname, '..', 'data', 'nawafith_internal.sqlite3');
if (!fs.existsSync(dbPath)) {
  const message = `Archive database not found: ${dbPath}`;
  if (process.env.STRICT_ARCHIVE_CHECK === '1') throw new Error(message);
  console.warn(message);
  process.exit(0);
}

const db = new Database(dbPath, { readonly: true, fileMustExist: true });
const documents = db.prepare('SELECT COUNT(*) n FROM documents').get().n;
const registerRecords = db.prepare('SELECT COUNT(*) n FROM register_records').get().n;
const arabicDocuments = db.prepare("SELECT COUNT(*) n FROM documents WHERE lang='ar'").get().n;
const ministryHits = db.prepare("SELECT COUNT(*) n FROM documents_fts WHERE documents_fts MATCH '\"وزارة\"'").get().n;
db.close();

console.log(JSON.stringify({ ok: true, documents, register_records: registerRecords, arabic_documents: arabicDocuments, ministry_hits: ministryHits }, null, 2));
