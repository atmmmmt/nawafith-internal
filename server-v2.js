'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const partsDir = path.join(__dirname, 'v2parts');
const parts = [
  'part01.txt',
  'part02.txt',
  'part03.txt',
  'part04.txt',
  'part05.txt',
  'part06.txt'
];

const code = parts.map(name => {
  const file = path.join(partsDir, name);
  if (!fs.existsSync(file)) throw new Error(`Missing V2 source part: ${name}`);
  return fs.readFileSync(file, 'utf8');
}).join('');

if (code.length < 30000) {
  throw new Error(`Nawafith V2 source is incomplete (${code.length} chars)`);
}

const filename = path.join(__dirname, 'server-v2-runtime.js');
const runtime = new Module(filename, module);
runtime.filename = filename;
runtime.paths = module.paths;
runtime._compile(code, filename);
