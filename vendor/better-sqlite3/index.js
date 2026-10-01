'use strict';

const { DatabaseSync } = require('node:sqlite');

class StatementCompat {
  constructor(stmt) {
    this.stmt = stmt;
  }
  get(...params) {
    return this.stmt.get(...params);
  }
  all(...params) {
    return this.stmt.all(...params);
  }
  run(...params) {
    return this.stmt.run(...params);
  }
}

class DatabaseCompat {
  constructor(filename, options = {}) {
    this.db = new DatabaseSync(filename, {
      open: true,
      readOnly: Boolean(options.readonly),
      timeout: Number(options.timeout || 10000),
      enableForeignKeyConstraints: true,
      enableDoubleQuotedStringLiterals: true
    });
  }
  prepare(sql) {
    return new StatementCompat(this.db.prepare(sql));
  }
  exec(sql) {
    return this.db.exec(sql);
  }
  pragma(source) {
    return this.db.exec(`PRAGMA ${String(source).replace(/;\s*$/, '')}`);
  }
  close() {
    return this.db.close();
  }
}

module.exports = DatabaseCompat;
