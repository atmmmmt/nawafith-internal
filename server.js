require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieSession = require('cookie-session');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const mysql = require('mysql2/promise');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const ARCHIVE_DB = process.env.NAWAFITH_ARCHIVE_DB || path.join(ROOT, 'data', 'nawafith_internal.sqlite3');
const LOCAL_STATE_DB = process.env.LOCAL_STATE_DB || path.join(ROOT, 'state', 'local_state.sqlite3');
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

app.use(cookieSession({
  name: 'nawafith_session',
  keys: [SESSION_SECRET],
  maxAge: 8 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production'
}));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
const ROLE_RANK = { viewer: 1, researcher: 2, admin: 3, owner: 4 };
const ROLE_AR = { viewer: 'مشاهد', researcher: 'باحث', admin: 'مدير بيانات', owner: 'مالك النظام' };
const ROUTE_AR = {
  decrees: 'القرارات والمراسيم', companies: 'الشركات', csos: 'منظمات المجتمع المدني',
  persons: 'الأشخاص', founders: 'المؤسسون', gazette: 'الجريدة الرسمية', investment: 'الاستثمارات',
  'international-associations': 'جهات دولية', ministry: 'الوزارات', committees: 'اللجان',
  governorates: 'المحافظات', register: 'السجل', corpus: 'المتن'
};

if (!fs.existsSync(ARCHIVE_DB)) {
  console.error(`Archive database not found: ${ARCHIVE_DB}`);
  console.error('Run npm run prepare-archive or provide NAWAFITH_ARCHIVE_DB.');
  process.exit(1);
}

const archive = new Database(ARCHIVE_DB, { readonly: true, fileMustExist: true });
archive.pragma('query_only = ON');
archive.pragma('busy_timeout = 10000');

const CSS = `
:root{font-family:Tahoma,Arial,sans-serif;color:#171717;background:#f5f5f3}*{box-sizing:border-box}body{margin:0}a{color:inherit;text-decoration:none}.top{background:#101010;color:#fff;padding:14px 24px;display:flex;align-items:center;gap:20px;position:sticky;top:0;z-index:5}.brand{font-weight:800;font-size:20px}.top nav{display:flex;gap:14px;margin-inline-start:auto;align-items:center;flex-wrap:wrap}.top a{color:#ddd}.top a:hover{color:#fff}.wrap{max-width:1280px;margin:auto;padding:24px}.card{background:#fff;border:1px solid #e5e5e5;border-radius:14px;padding:20px;box-shadow:0 2px 12px #00000008}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}.stat b{font-size:28px;display:block}.muted{color:#6c6c6c}.searchbar{display:grid;grid-template-columns:1fr 190px 145px auto;gap:10px;margin:16px 0}.searchbar input,.searchbar select,input,select,button{padding:11px 12px;border:1px solid #d8d8d8;border-radius:9px;background:#fff;font:inherit}button,.btn{background:#171717;color:#fff;border:0;padding:11px 16px;border-radius:9px;cursor:pointer;display:inline-block}.btn.secondary{background:#eee;color:#171717}.danger{background:#8f1d1d}.results{display:grid;gap:10px}.result{background:#fff;border:1px solid #e4e4e4;border-radius:12px;padding:15px}.result h3{margin:0 0 7px;font-size:17px}.badge{display:inline-block;background:#f0f0ef;border-radius:999px;padding:4px 9px;font-size:12px;margin-inline-end:5px}.snippet{line-height:1.8;color:#444}.pager{display:flex;gap:8px;justify-content:center;margin:20px}.pager a{padding:8px 12px;background:#fff;border:1px solid #ddd;border-radius:8px}.doc{white-space:pre-wrap;line-height:2;font-size:15px;background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:22px;max-height:72vh;overflow:auto}.login{max-width:430px;margin:9vh auto}.login input{width:100%;margin:6px 0 14px}.alert{padding:11px 14px;border-radius:9px;margin-bottom:12px;background:#fff2d8;border:1px solid #efd18b}.ok{background:#eaf7ed;border-color:#b8dfc1}.tablewrap{overflow:auto}.table{width:100%;border-collapse:collapse;background:#fff}.table th,.table td{padding:11px;border-bottom:1px solid #eee;text-align:right;vertical-align:top}.meta{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 18px}.small{font-size:12px}@media(max-width:760px){.searchbar{grid-template-columns:1fr}.top{padding:12px}.wrap{padding:14px}}
`;

function esc(v = '') {
  return String(v).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}
function tokens(q = '') {
  return (q.match(/[\p{L}\p{N}_]+/gu) || []).filter(x => x.length > 1).slice(0, 12).map(x => `"${x.replace(/"/g, '')}"`).join(' AND ');
}
function excerpt(text = '', q = '', limit = 430) {
  text = String(text || '').replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const ts = q.match(/[\p{L}\p{N}_]+/gu) || [];
  let pos = -1;
  for (const t of ts) { pos = text.toLowerCase().indexOf(t.toLowerCase()); if (pos >= 0) break; }
  if (pos < 0) return text.slice(0, limit) + '…';
  const start = Math.max(0, pos - Math.floor(limit / 3));
  return (start ? '…' : '') + text.slice(start, start + limit) + '…';
}
function csv(v) { return `"${String(v ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""')}"`; }
function csrf(req) { if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('base64url'); return req.session.csrf; }
function verifyCsrf(req, res, next) {
  const a = Buffer.from(String(req.body.csrf || ''));
  const b = Buffer.from(String(req.session.csrf || ''));
  if (!a.length || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(400).send('Bad CSRF token');
  next();
}
function htmlPage(req, title, body) {
  const u = req.user;
  const nav = u ? `<header class="top"><a class="brand" href="/">أرشيف نوافذ</a><nav><a href="/search">البحث</a>${ROLE_RANK[u.role] >= 3 ? '<a href="/users">المستخدمون</a><a href="/audit">السجل</a>' : ''}<span class="muted">${esc(u.username)}</span><a href="/logout">خروج</a></nav></header>` : '';
  const flash = req.session.flash ? `<div class="alert ${req.session.flash.ok ? 'ok' : ''}">${esc(req.session.flash.text)}</div>` : '';
  delete req.session.flash;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>${esc(title)} · أرشيف نوافذ الداخلي</title><style>${CSS}</style></head><body>${nav}<main class="wrap">${flash}${body}</main></body></html>`;
}

let mysqlPool = null;
let localState = null;
const mysqlEnabled = Boolean(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME);

function initLocalState() {
  fs.mkdirSync(path.dirname(LOCAL_STATE_DB), { recursive: true });
  localState = new Database(LOCAL_STATE_DB);
  localState.pragma('journal_mode = WAL');
  localState.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,action TEXT NOT NULL,detail TEXT,ip TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
}
async function initState() {
  if (mysqlEnabled) {
    mysqlPool = mysql.createPool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME, connectionLimit: 8, charset: 'utf8mb4' });
    await mysqlPool.query(`CREATE TABLE IF NOT EXISTS users(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,username VARCHAR(120) NOT NULL UNIQUE,password_hash VARCHAR(255) NOT NULL,role VARCHAR(20) NOT NULL,active TINYINT(1) NOT NULL DEFAULT 1,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await mysqlPool.query(`CREATE TABLE IF NOT EXISTS audit_log(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,user_id BIGINT UNSIGNED NULL,action VARCHAR(120) NOT NULL,detail TEXT NULL,ip VARCHAR(120) NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,INDEX idx_created(created_at),INDEX idx_user(user_id)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } else initLocalState();
  await bootstrapOwner();
}
async function one(sql, params = []) { if (mysqlPool) { const [r] = await mysqlPool.execute(sql, params); return r[0] || null; } return localState.prepare(sql.replace(/`/g, '')).get(...params) || null; }
async function all(sql, params = []) { if (mysqlPool) { const [r] = await mysqlPool.execute(sql, params); return r; } return localState.prepare(sql.replace(/`/g, '')).all(...params); }
async function run(sql, params = []) { if (mysqlPool) { const [r] = await mysqlPool.execute(sql, params); return r; } return localState.prepare(sql.replace(/`/g, '')).run(...params); }
async function bootstrapOwner() {
  const count = await one('SELECT COUNT(*) n FROM users');
  if (Number(count?.n || 0) > 0) return;
  const username = String(process.env.ADMIN_USERNAME || '').trim();
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!username || password.length < 10) { console.warn('Owner not created: set ADMIN_USERNAME and ADMIN_PASSWORD (10+ chars).'); return; }
  await run('INSERT INTO users(username,password_hash,role,active) VALUES(?,?,?,1)', [username, await bcrypt.hash(password, 12), 'owner']);
  console.log(`Owner account created: ${username}`);
}
async function audit(req, action, detail = '') {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim().slice(0, 120);
  await run('INSERT INTO audit_log(user_id,action,detail,ip) VALUES(?,?,?,?)', [req.user?.id || null, action, String(detail).slice(0, 4000), ip]);
}

app.use(async (req, _res, next) => {
  try { req.user = req.session.uid ? await one('SELECT id,username,role,active FROM users WHERE id=?', [req.session.uid]) : null; if (req.user && !Number(req.user.active)) { req.session = null; req.user = null; } next(); }
  catch (e) { next(e); }
});
function loginRequired(req, res, next) { if (!req.user) return res.redirect('/login'); next(); }
function roleRequired(role) { return (req, res, next) => { if (!req.user) return res.redirect('/login'); if ((ROLE_RANK[req.user.role] || 0) < ROLE_RANK[role]) return res.status(403).send('Forbidden'); next(); }; }

app.get('/health', (_req, res) => {
  try { const documents = archive.prepare('SELECT COUNT(*) n FROM documents').get().n; res.json({ ok: true, archive: true, documents, state: mysqlPool ? 'mysql' : 'local-sqlite' }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.send(htmlPage(req, 'تسجيل الدخول', `<section class="card login"><h1>أرشيف نوافذ الداخلي</h1><p class="muted">دخول أعضاء الفريق فقط</p><form method="post"><input type="hidden" name="csrf" value="${esc(csrf(req))}"><label>اسم المستخدم</label><input name="username" autocomplete="username" required><label>كلمة المرور</label><input name="password" type="password" autocomplete="current-password" required><button style="width:100%">دخول</button></form></section>`));
});
app.post('/login', loginLimiter, verifyCsrf, async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim().slice(0, 120);
    const password = String(req.body.password || '');
    const u = await one('SELECT * FROM users WHERE username=? AND active=1', [username]);
    if (u && await bcrypt.compare(password, u.password_hash)) {
      req.session.uid = u.id; req.session.username = u.username; req.session.role = u.role; req.session.csrf = crypto.randomBytes(24).toString('base64url'); req.user = u;
      await audit(req, 'login', 'successful login');
      return res.redirect('/');
    }
    req.session.flash = { ok: false, text: 'بيانات الدخول غير صحيحة' };
    res.redirect('/login');
  } catch (e) { next(e); }
});
app.get('/logout', async (req, res) => { try { if (req.user) await audit(req, 'logout'); } catch (_) {} req.session = null; res.redirect('/login'); });

app.get('/', loginRequired, (req, res) => {
  const meta = Object.fromEntries(archive.prepare('SELECT key,value FROM metadata').all().map(r => [r.key, r.value]));
  const routes = archive.prepare("SELECT route,COUNT(*) n FROM documents WHERE lang='ar' GROUP BY route ORDER BY n DESC LIMIT 12").all();
  const opts = routes.map(r => `<option value="${esc(r.route || '')}">${esc(ROUTE_AR[r.route] || r.route || 'أخرى')} (${Number(r.n).toLocaleString('en-US')})</option>`).join('');
  res.send(htmlPage(req, 'الرئيسية', `<h1>الأرشيف الداخلي</h1><p class="muted">نسخة مستقلة للبحث في بيانات نوافذ.</p><section class="grid"><div class="card stat"><b>${esc(meta.documents || '—')}</b><span>صفحة محفوظة</span></div><div class="card stat"><b>${esc(meta.register_records || '—')}</b><span>سجل منظم</span></div><div class="card stat"><b>4</b><span>مستويات صلاحيات</span></div></section><section class="card" style="margin-top:16px"><h2>بحث سريع</h2><form class="searchbar" action="/search"><input name="q" placeholder="اسم شخص، شركة، رقم قرار، كلمة من النص…" autofocus><select name="route"><option value="">كل الأقسام</option>${opts}</select><select name="lang"><option value="ar">العربية</option><option value="en">English</option><option value="">الكل</option></select><button>بحث</button></form></section>`));
});

app.get('/search', loginRequired, async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 300);
    const route = String(req.query.route || '').trim().slice(0, 60);
    const lang = String(req.query.lang ?? 'ar').trim().slice(0, 10);
    const p = Math.max(1, Math.min(Number(req.query.page || 1), 10000));
    const per = 30, off = (p - 1) * per;
    let rows = [];
    if (q) {
      const match = tokens(q);
      if (match) {
        let sql = `SELECT d.id,d.url,d.lang,d.route,d.record_type,d.slug,d.title,d.h1,d.body_text,bm25(documents_fts,4.0,3.0,1.0) score FROM documents_fts JOIN documents d ON d.id=documents_fts.rowid WHERE documents_fts MATCH ?`;
        const params = [match];
        if (route) { sql += ' AND d.route=?'; params.push(route); }
        if (lang) { sql += ' AND d.lang=?'; params.push(lang); }
        sql += ' ORDER BY score LIMIT ? OFFSET ?'; params.push(per + 1, off);
        rows = archive.prepare(sql).all(...params);
      }
      await audit(req, 'search', `q=${q}; route=${route}; lang=${lang}; page=${p}`);
    }
    const hasNext = rows.length > per; rows = rows.slice(0, per);
    const routeRows = archive.prepare("SELECT route,COUNT(*) n FROM documents WHERE lang='ar' GROUP BY route ORDER BY n DESC").all();
    const options = ['<option value="">كل الأقسام</option>', ...routeRows.map(r => `<option value="${esc(r.route || '')}" ${route === r.route ? 'selected' : ''}>${esc(ROUTE_AR[r.route] || r.route || 'أخرى')} (${Number(r.n).toLocaleString('en-US')})</option>`)].join('');
    const cards = rows.map(r => `<article class="result"><h3><a href="/document/${r.id}">${esc(r.title || r.h1 || r.slug || r.url)}</a></h3><div><span class="badge">${esc(ROUTE_AR[r.route] || r.route || r.record_type || 'صفحة')}</span><span class="badge">${esc(r.lang)}</span></div><p class="snippet">${esc(excerpt(r.body_text, q))}</p></article>`).join('') || (q ? '<div class="card">لا توجد نتائج مطابقة.</div>' : '<div class="card">اكتب كلمة للبحث في الأرشيف.</div>');
    const base = `/search?q=${encodeURIComponent(q)}&route=${encodeURIComponent(route)}&lang=${encodeURIComponent(lang)}`;
    const pager = `<div class="pager">${p > 1 ? `<a href="${base}&page=${p - 1}">السابق</a>` : ''}<span class="badge">صفحة ${p}</span>${hasNext ? `<a href="${base}&page=${p + 1}">التالي</a>` : ''}</div>`;
    const exportBtn = ROLE_RANK[req.user.role] >= 2 && q ? `<a class="btn secondary" href="/export.csv?q=${encodeURIComponent(q)}&route=${encodeURIComponent(route)}&lang=${encodeURIComponent(lang)}">تصدير CSV</a>` : '';
    res.send(htmlPage(req, 'البحث', `<h1>البحث</h1><form class="searchbar"><input name="q" value="${esc(q)}" placeholder="ابحث في النص الكامل"><select name="route">${options}</select><select name="lang"><option value="ar" ${lang === 'ar' ? 'selected' : ''}>العربية</option><option value="en" ${lang === 'en' ? 'selected' : ''}>English</option><option value="" ${!lang ? 'selected' : ''}>الكل</option></select><button>بحث</button></form>${exportBtn}<div class="results" style="margin-top:14px">${cards}</div>${pager}`));
  } catch (e) { next(e); }
});

app.get('/document/:id', loginRequired, (req, res) => {
  const d = archive.prepare('SELECT * FROM documents WHERE id=?').get(Number(req.params.id));
  if (!d) return res.status(404).send('Not found');
  res.send(htmlPage(req, d.title || d.h1 || 'سجل', `<a class="btn secondary" href="javascript:history.back()">رجوع</a><h1>${esc(d.title || d.h1 || d.slug || 'سجل')}</h1><div class="meta"><span class="badge">${esc(ROUTE_AR[d.route] || d.route || d.record_type || 'صفحة')}</span><span class="badge">${esc(d.lang)}</span><span class="badge">#${d.id}</span></div><div class="doc">${esc(d.body_text || '')}</div><p class="small muted" style="margin-top:16px">المصدر الأصلي: ${esc(d.url)}</p>`));
});

app.get('/export.csv', roleRequired('researcher'), async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 300), route = String(req.query.route || '').trim().slice(0, 60), lang = String(req.query.lang ?? 'ar').trim().slice(0, 10), match = tokens(q);
    if (!match) return res.status(400).send('Missing query');
    let sql = `SELECT d.id,d.url,d.lang,d.route,d.record_type,d.title,d.h1,d.body_text FROM documents_fts JOIN documents d ON d.id=documents_fts.rowid WHERE documents_fts MATCH ?`;
    const params = [match];
    if (route) { sql += ' AND d.route=?'; params.push(route); }
    if (lang) { sql += ' AND d.lang=?'; params.push(lang); }
    sql += ' LIMIT 5000';
    const rows = archive.prepare(sql).all(...params);
    const lines = [['id','lang','route','record_type','title','url','text'].map(csv).join(',')];
    for (const r of rows) lines.push([r.id,r.lang,r.route,r.record_type,r.title || r.h1 || '',r.url,r.body_text || ''].map(csv).join(','));
    await audit(req, 'export_csv', `q=${q}; rows=${rows.length}`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="nawafith-export.csv"'); res.send('\uFEFF' + lines.join('\n'));
  } catch (e) { next(e); }
});

app.get('/users', roleRequired('admin'), async (req, res, next) => {
  try {
    const rows = await all('SELECT id,username,role,active,created_at FROM users ORDER BY id');
    const body = rows.map(u => `<tr><td>${u.id}</td><td>${esc(u.username)}</td><td>${esc(ROLE_AR[u.role] || u.role)}</td><td>${Number(u.active) ? 'فعال' : 'موقوف'}</td><td>${esc(u.created_at)}</td><td>${u.id !== req.user.id && !(u.role === 'owner' && req.user.role !== 'owner') ? `<form method="post" action="/users/${u.id}/toggle"><input type="hidden" name="csrf" value="${esc(csrf(req))}"><button class="${Number(u.active) ? 'danger' : ''}">${Number(u.active) ? 'إيقاف' : 'تفعيل'}</button></form>` : ''}</td></tr>`).join('');
    const allowed = req.user.role === 'owner' ? ['admin','researcher','viewer'] : ['researcher','viewer'];
    res.send(htmlPage(req, 'المستخدمون', `<h1>المستخدمون والصلاحيات</h1><section class="card"><h2>إضافة مستخدم</h2><form method="post" action="/users" class="searchbar"><input type="hidden" name="csrf" value="${esc(csrf(req))}"><input name="username" placeholder="اسم المستخدم" required><input name="password" type="password" placeholder="كلمة المرور" minlength="10" required><select name="role">${allowed.map(r => `<option value="${r}">${ROLE_AR[r]}</option>`).join('')}</select><button>إضافة</button></form></section><section class="card" style="margin-top:16px"><div class="tablewrap"><table class="table"><thead><tr><th>#</th><th>المستخدم</th><th>الصلاحية</th><th>الحالة</th><th>أنشئ</th><th></th></tr></thead><tbody>${body}</tbody></table></div></section>`));
  } catch (e) { next(e); }
});
app.post('/users', roleRequired('admin'), verifyCsrf, async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim().slice(0, 120), password = String(req.body.password || ''), role = String(req.body.role || 'viewer');
    const allowed = req.user.role === 'owner' ? ['admin','researcher','viewer'] : ['researcher','viewer'];
    if (!username || password.length < 10 || !allowed.includes(role)) return res.status(400).send('Invalid user data');
    await run('INSERT INTO users(username,password_hash,role,active) VALUES(?,?,?,1)', [username, await bcrypt.hash(password, 12), role]);
    await audit(req, 'create_user', `username=${username}; role=${role}`); req.session.flash = { ok: true, text: 'تم إنشاء المستخدم' }; res.redirect('/users');
  } catch (e) { if (/unique|duplicate/i.test(e.message)) { req.session.flash = { ok: false, text: 'اسم المستخدم موجود مسبقاً' }; return res.redirect('/users'); } next(e); }
});
app.post('/users/:id/toggle', roleRequired('admin'), verifyCsrf, async (req, res, next) => {
  try {
    const id = Number(req.params.id); if (!id || id === Number(req.user.id)) return res.status(400).send('Cannot modify self');
    const target = await one('SELECT id,username,role,active FROM users WHERE id=?', [id]); if (!target) return res.status(404).send('Not found');
    if (target.role === 'owner' && req.user.role !== 'owner') return res.status(403).send('Forbidden');
    await run('UPDATE users SET active=? WHERE id=?', [Number(target.active) ? 0 : 1, id]); await audit(req, 'toggle_user', `target=${target.username}`); res.redirect('/users');
  } catch (e) { next(e); }
});

app.get('/audit', roleRequired('admin'), async (req, res, next) => {
  try {
    const rows = await all('SELECT a.id,a.action,a.detail,a.ip,a.created_at,u.username FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 500');
    const body = rows.map(r => `<tr><td>${r.id}</td><td>${esc(r.username || '—')}</td><td>${esc(r.action)}</td><td>${esc(r.detail || '')}</td><td>${esc(r.ip || '')}</td><td>${esc(r.created_at)}</td></tr>`).join('');
    res.send(htmlPage(req, 'سجل التدقيق', `<h1>سجل التدقيق</h1><section class="card"><div class="tablewrap"><table class="table"><thead><tr><th>#</th><th>المستخدم</th><th>العملية</th><th>التفاصيل</th><th>IP</th><th>الوقت</th></tr></thead><tbody>${body}</tbody></table></div></section>`));
  } catch (e) { next(e); }
});

app.use((req, res) => res.status(404).send(htmlPage(req, 'غير موجود', '<section class="card"><h1>404</h1><p>الصفحة غير موجودة.</p></section>')));
app.use((err, req, res, _next) => { console.error(err); res.status(500).send(htmlPage(req, 'خطأ', '<section class="card"><h1>حدث خطأ</h1><p class="muted">راجع Runtime Logs.</p></section>')); });

initState().then(() => {
  const documents = archive.prepare('SELECT COUNT(*) n FROM documents').get().n;
  const registerRecords = archive.prepare('SELECT COUNT(*) n FROM register_records').get().n;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Nawafith Internal listening on port ${PORT}`);
    console.log(`Archive: documents=${documents}, register_records=${registerRecords}`);
    console.log(`State backend: ${mysqlPool ? 'mysql' : 'local-sqlite'}`);
  });
}).catch(err => { console.error('Startup failed:', err); process.exit(1); });

process.on('SIGTERM', async () => {
  try { archive.close(); } catch (_) {}
  try { localState?.close(); } catch (_) {}
  try { await mysqlPool?.end(); } catch (_) {}
  process.exit(0);
});
