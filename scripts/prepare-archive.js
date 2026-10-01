const fs = require('fs');
const path = require('path');
const fzstd = require('fzstd');

const root = path.join(__dirname, '..');
const dataDir = path.join(root, 'data');
const src = path.join(dataDir, 'nawafith_internal.sqlite3.zst');
const dest = path.join(dataDir, 'nawafith_internal.sqlite3');
const tmp = dest + '.tmp';
const archiveUrl = String(process.env.ARCHIVE_URL || '').trim();

async function main() {
  fs.mkdirSync(dataDir, { recursive: true });

  if (fs.existsSync(dest) && fs.statSync(dest).size > 100 * 1024 * 1024) {
    console.log('Archive database already prepared.');
    return;
  }

  if (!fs.existsSync(src) && archiveUrl) {
    console.log('Downloading archive database...');
    const res = await fetch(archiveUrl, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Archive download failed: HTTP ${res.status}`);
    const ab = await res.arrayBuffer();
    fs.writeFileSync(src, Buffer.from(ab));
  }

  if (!fs.existsSync(src)) {
    console.warn('Archive file is not present. Add data/nawafith_internal.sqlite3.zst or set ARCHIVE_URL.');
    return;
  }

  console.log('Decompressing archive database...');
  const compressed = fs.readFileSync(src);
  const decoded = fzstd.decompress(compressed);
  try { fs.unlinkSync(tmp); } catch (_) {}
  fs.writeFileSync(tmp, Buffer.from(decoded.buffer, decoded.byteOffset, decoded.byteLength));
  fs.renameSync(tmp, dest);
  console.log(`Archive prepared: ${dest} (${fs.statSync(dest).size} bytes)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
