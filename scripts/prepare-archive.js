const fs = require('fs');
const path = require('path');
const fzstd = require('fzstd');

const root = path.join(__dirname, '..');
const dataDir = path.join(root, 'data');
const src = path.join(dataDir, 'nawafith_internal.sqlite3.zst');
const dest = path.join(dataDir, 'nawafith_internal.sqlite3');
const tmp = dest + '.tmp';
const archiveUrl = String(process.env.ARCHIVE_URL || '').trim();
const explicitArchivePath = String(process.env.ARCHIVE_ZST_PATH || '').trim();

function findHostingerPersistentArchive(startDir) {
  let cur = path.resolve(startDir);
  for (let i = 0; i < 10; i++) {
    if (path.basename(cur) === 'hbuilds') {
      const domainRoot = path.dirname(cur);
      return path.join(domainRoot, 'public_html', 'nawafith-data', 'nawafith_internal.sqlite3.zst');
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

async function main() {
  fs.mkdirSync(dataDir, { recursive: true });

  if (fs.existsSync(dest) && fs.statSync(dest).size > 100 * 1024 * 1024) {
    console.log(`Archive database already prepared: ${dest}`);
    return;
  }

  const hostingerPersistentArchive = findHostingerPersistentArchive(root);
  let sourceFile = null;

  if (fs.existsSync(src)) {
    sourceFile = src;
    console.log(`Using bundled archive: ${src}`);
  } else if (explicitArchivePath && fs.existsSync(explicitArchivePath)) {
    sourceFile = explicitArchivePath;
    console.log(`Using ARCHIVE_ZST_PATH: ${explicitArchivePath}`);
  } else if (hostingerPersistentArchive && fs.existsSync(hostingerPersistentArchive)) {
    sourceFile = hostingerPersistentArchive;
    console.log(`Using Hostinger persistent archive: ${hostingerPersistentArchive}`);
  }

  if (!sourceFile && archiveUrl) {
    console.log('Downloading archive database...');
    const res = await fetch(archiveUrl, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Archive download failed: HTTP ${res.status}`);
    const ab = await res.arrayBuffer();
    fs.writeFileSync(src, Buffer.from(ab));
    sourceFile = src;
  }

  if (!sourceFile) {
    console.error('Archive file was not found.');
    console.error(`Runtime root: ${root}`);
    console.error(`Checked bundled: ${src}`);
    console.error(`Checked Hostinger persistent: ${hostingerPersistentArchive || 'not detected'}`);
    console.error('You can also set ARCHIVE_ZST_PATH or ARCHIVE_URL.');
    process.exit(2);
  }

  console.log(`Decompressing archive database from: ${sourceFile}`);
  const compressed = fs.readFileSync(sourceFile);
  const decoded = fzstd.decompress(compressed);
  try { fs.unlinkSync(tmp); } catch (_) {}
  fs.writeFileSync(tmp, Buffer.from(decoded.buffer, decoded.byteOffset, decoded.byteLength));
  fs.renameSync(tmp, dest);
  console.log(`Archive prepared: ${dest} (${fs.statSync(dest).size} bytes)`);
}

main().catch(err => {
  console.error('Archive preparation failed:', err);
  process.exit(1);
});
