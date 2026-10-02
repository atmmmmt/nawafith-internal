'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'v2parts');
const names = ['part01.txt','part02.txt','part03.txt','part04.txt','part05.txt','part06.txt'];
const code = names.map(name => fs.readFileSync(path.join(dir, name), 'utf8')).join('');

if (code.length < 30000) throw new Error(`V2 source incomplete: ${code.length} chars`);

new vm.Script(
  '(function(require,module,exports,__filename,__dirname){\n' + code + '\n})',
  { filename: 'server-v2-runtime.js' }
);

console.log(`Nawafith V2 syntax OK (${code.length} chars)`);
