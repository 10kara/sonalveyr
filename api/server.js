// ============================================================
//  Архив Солана Вейра — API-сервер
//  Node.js 18+, одна зависимость (mysql2). Работает рядом с MySQL
//  из Pterodactyl на VDS и отдаёт данные статическому сайту на
//  GitHub Pages. Изображения хранятся на диске VDS (UPLOAD_DIR).
// ============================================================
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

/* ---------- .env без внешних зависимостей ---------- */
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadEnv(path.join(ROOT, '.env'));
const env = process.env;

const cfg = {
  host: env.HOST || '127.0.0.1',
  port: Number(env.PORT || env.SERVER_PORT || 8787),
  db: {
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  },
  origins: (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean),
  adminUser: (env.ADMIN_USER || 'admin').trim(),
  adminHash: env.ADMIN_PASSWORD_HASH || '',
  secret: env.TOKEN_SECRET || '',
  uploadDir: path.resolve(ROOT, env.UPLOAD_DIR || 'uploads'),
  maxUpload: Number(env.MAX_UPLOAD_MB || 8) * 1024 * 1024,
  trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',
  tokenTtl: Number(env.TOKEN_TTL_DAYS || 7) * 86400,
};

const missing = ['DB_USER', 'DB_NAME', 'ADMIN_PASSWORD_HASH', 'TOKEN_SECRET'].filter(k => !env[k]);
if (missing.length) {
  console.error(`[api] В .env не заданы: ${missing.join(', ')}. См. api/.env.example`);
  process.exit(1);
}
if (cfg.secret.length < 32) {
  console.error('[api] TOKEN_SECRET должен быть длиной не менее 32 символов.');
  process.exit(1);
}

const pool = mysql.createPool({
  ...cfg.db,
  waitForConnections: true,
  connectionLimit: 5,
  charset: 'utf8mb4',
  dateStrings: true,
});

/* ============================================================
   СХЕМА
   resource -> таблица MySQL + разрешённые колонки и их типы.
   Только эти колонки принимаются от клиента.
   ============================================================ */
const RES = {
  character: {
    table: 'characters',
    text: ['name', 'name_latin', 'former_name', 'species', 'gender', 'homeworld', 'affiliation', 'rank_title', 'specialization', 'alignment', 'eye_color', 'saber_color', 'callsign', 'epigraph', 'summary', 'appearance', 'personality', 'flaw', 'combat_style', 'image_url'],
    num: ['age'],
    bool: ['holo_effect'],
    json: ['traits', 'forms', 'saber', 'details'],
  },
  chapters: {
    table: 'chapters',
    text: ['title', 'content', 'cover_image'],
    num: ['chapter_number'],
    bool: ['published', 'holo_effect'],
    json: [],
  },
  relationships: {
    table: 'relationships',
    text: ['name', 'role', 'relation', 'quote', 'image_url', 'group_tag'],
    num: ['pos_x', 'pos_y'],
    bool: ['holo_effect'],
    json: [],
  },
  gallery: {
    table: 'gallery',
    text: ['title', 'caption', 'image_url', 'category'],
    num: ['sort_order'],
    bool: ['holo_effect'],
    json: [],
  },
  character_links: {
    table: 'character_links',
    text: ['link_type', 'note'],
    num: ['from_id', 'to_id'],
    bool: [],
    json: [],
  },
};
for (const r of Object.values(RES)) r.cols = [...r.text, ...r.num, ...r.bool, ...r.json];

const SCHEMA = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8')
  .split(/;\s*$/m).map(s => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean);

async function migrate() {
  for (const stmt of SCHEMA) await pool.query(stmt);
  await seedIfEmpty();
}

async function seedIfEmpty() {
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM `characters`');
  if (n > 0) return;
  const seed = JSON.parse(await fsp.readFile(path.join(ROOT, 'seed.json'), 'utf8'));
  await upsertRow('character', seed.character);
  const [[{ c }]] = await pool.query('SELECT COUNT(*) AS c FROM `chapters`');
  if (c === 0) for (const ch of seed.chapters) await upsertRow('chapters', ch);
  console.log('[api] База была пустой — записан персонаж Солан Вейр и главы биографии.');
}

/* ---------- преобразование данных ---------- */
function toDb(resource, data, { partial = true } = {}) {
  const r = RES[resource];
  const out = {};
  for (const k of r.cols) {
    if (!(k in data)) { if (partial) continue; }
    let v = data[k];
    if (r.text.includes(k)) v = v == null ? '' : String(v).slice(0, k === 'content' ? 200000 : 20000);
    else if (r.num.includes(k)) v = v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v);
    else if (r.bool.includes(k)) v = v === undefined ? 1 : (v === false || v === 0 || v === '0' || v === 'false' ? 0 : 1);
    else if (r.json.includes(k)) v = JSON.stringify(Array.isArray(v) ? v.filter(x => x && (x.title || x.text)).map(x => ({ title: String(x.title || ''), text: String(x.text || '') })) : []);
    out[k] = v;
  }
  if (resource === 'relationships') {
    for (const k of ['pos_x', 'pos_y']) if (out[k] != null) out[k] = Math.max(0, Math.min(100, out[k]));
    if ('group_tag' in out) out.group_tag = ['jedi', 'clones', 'family', 'ally', 'sith', 'other'].includes(out.group_tag) ? out.group_tag : 'other';
  }
  if (resource === 'character_links' && 'link_type' in out && !out.link_type) out.link_type = 'connection';
  if (resource === 'gallery' && 'category' in out) out.category = ['portrait', 'archive', 'field'].includes(out.category) ? out.category : 'archive';
  return out;
}

function fromDb(resource, row) {
  if (!row) return row;
  const r = RES[resource];
  const out = { ...row };
  for (const k of r.bool) out[k] = !!row[k];
  for (const k of r.json) { try { out[k] = JSON.parse(row[k] || '[]'); } catch { out[k] = []; } }
  return out;
}

const q = (s) => '`' + s.replace(/`/g, '') + '`';

async function getRow(resource, id, conn = pool) {
  const [rows] = await conn.query(`SELECT * FROM ${q(RES[resource].table)} WHERE id = ?`, [id]);
  return fromDb(resource, rows[0]);
}

async function insertRow(resource, data, conn = pool) {
  const row = toDb(resource, data, { partial: false });
  const keys = Object.keys(row);
  const [res] = await conn.query(
    `INSERT INTO ${q(RES[resource].table)} (${keys.map(q).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
    keys.map(k => row[k]),
  );
  return getRow(resource, res.insertId, conn);
}

async function updateRow(resource, id, data, conn = pool) {
  const row = toDb(resource, data);
  const keys = Object.keys(row);
  if (!keys.length) return getRow(resource, id, conn);
  await conn.query(
    `UPDATE ${q(RES[resource].table)} SET ${keys.map(k => `${q(k)} = ?`).join(', ')} WHERE id = ?`,
    [...keys.map(k => row[k]), id],
  );
  return getRow(resource, id, conn);
}

// Вставка с сохранением id (импорт, сид, отмена удаления).
async function upsertRow(resource, data, conn = pool) {
  const row = toDb(resource, data, { partial: false });
  const id = Number(data.id);
  const keys = Object.keys(row);
  if (Number.isInteger(id) && id > 0) {
    keys.unshift('id');
    row.id = id;
  }
  await conn.query(
    `INSERT INTO ${q(RES[resource].table)} (${keys.map(q).join(',')}) VALUES (${keys.map(() => '?').join(',')})
     ON DUPLICATE KEY UPDATE ${keys.filter(k => k !== 'id').map(k => `${q(k)} = VALUES(${q(k)})`).join(', ')}`,
    keys.map(k => row[k]),
  );
}

/* ============================================================
   АВТОРИЗАЦИЯ — scrypt-хеш пароля в .env, подписанный токен
   ============================================================ */
function verifyPassword(password, stored) {
  const [algo, salt, hash] = String(stored).split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = crypto.scryptSync(String(password), Buffer.from(salt, 'base64'), expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function signToken(user) {
  const body = Buffer.from(JSON.stringify({ u: user, exp: Math.floor(Date.now() / 1000) + cfg.tokenTtl })).toString('base64url');
  const sig = crypto.createHmac('sha256', cfg.secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function readToken(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  const [body, sig] = h.slice(7).split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', cfg.secret).update(body).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() / 1000 ? p : null;
  } catch { return null; }
}

const attempts = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || a.reset < now) { attempts.set(ip, { n: 1, reset: now + 10 * 60 * 1000 }); return false; }
  a.n++;
  return a.n > 8;
}

/* ============================================================
   HTTP-УТИЛИТЫ
   ============================================================ */
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

function clientIp(req) {
  if (cfg.trustProxy && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || '';
}

function cors(req, res) {
  const origin = (req.headers.origin || '').replace(/\/$/, '');
  if (origin && (cfg.origins.includes(origin) || cfg.origins.includes('*'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,If-None-Match');
    res.setHeader('Access-Control-Expose-Headers', 'ETag');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
}

function send(res, status, data, headers = {}) {
  const body = data === undefined ? '' : JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, `Файл больше ${Math.round(limit / 1048576)} МБ.`)); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req, 4 * 1024 * 1024);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); } catch { throw new HttpError(400, 'Некорректный JSON.'); }
}

/* ---------- изображения ---------- */
const IMAGE_TYPES = {
  jpg: { mime: 'image/jpeg', test: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  png: { mime: 'image/png', test: b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  gif: { mime: 'image/gif', test: b => b.subarray(0, 4).toString('ascii') === 'GIF8' },
  webp: { mime: 'image/webp', test: b => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
};
const FOLDERS = ['character', 'chapters', 'relationships', 'gallery'];
const safeFolder = f => (FOLDERS.includes(f) ? f : null);

function uploadPathFromUrl(url) {
  const m = /\/uploads\/([a-z]+)\/([a-zA-Z0-9._-]+)$/.exec(String(url || '').split('?')[0]);
  if (!m || !safeFolder(m[1])) return null;
  return path.join(cfg.uploadDir, m[1], m[2]);
}

async function serveUpload(req, res, rel) {
  const parts = rel.split('/');
  if (parts.length !== 2 || !safeFolder(parts[0]) || !/^[a-zA-Z0-9._-]+$/.test(parts[1])) throw new HttpError(404, 'Нет файла.');
  const file = path.join(cfg.uploadDir, parts[0], parts[1]);
  const ext = path.extname(file).slice(1).toLowerCase();
  const type = IMAGE_TYPES[ext === 'jpeg' ? 'jpg' : ext];
  if (!type) throw new HttpError(404, 'Нет файла.');
  let stat;
  try { stat = await fsp.stat(file); } catch { throw new HttpError(404, 'Нет файла.'); }
  res.writeHead(200, {
    'Content-Type': type.mime,
    'Content-Length': stat.size,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

/* ============================================================
   МАРШРУТЫ
   ============================================================ */
const WRITABLE = ['chapters', 'relationships', 'gallery', 'character_links'];

async function archive(admin) {
  const [[ch], [chapters], [rel], [gal], [links]] = await Promise.all([
    pool.query('SELECT * FROM `characters` ORDER BY id LIMIT 1'),
    pool.query(`SELECT * FROM \`chapters\` ${admin ? '' : 'WHERE published = 1'} ORDER BY chapter_number, id`),
    pool.query('SELECT * FROM `relationships` ORDER BY id'),
    pool.query('SELECT * FROM `gallery` ORDER BY sort_order, id DESC'),
    pool.query('SELECT * FROM `character_links` ORDER BY id'),
  ]);
  return {
    character: ch[0] ? fromDb('character', ch[0]) : null,
    chapters: chapters.map(x => fromDb('chapters', x)),
    relationships: rel.map(x => fromDb('relationships', x)),
    gallery: gal.map(x => fromDb('gallery', x)),
    links: links.map(x => fromDb('character_links', x)),
  };
}

async function handle(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, 'http://local');
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const user = readToken(req);
  const needAdmin = () => { if (!user) throw new HttpError(401, 'Требуется вход в админ-панель.'); };

  if (p.startsWith('/uploads/') && (req.method === 'GET' || req.method === 'HEAD')) return serveUpload(req, res, p.slice(9));

  if (p === '/api/health') {
    let db = false;
    try { await pool.query('SELECT 1'); db = true; } catch {}
    return send(res, db ? 200 : 503, { ok: db, db });
  }

  if (p === '/api/archive' && req.method === 'GET') {
    const data = await archive(!!user);
    const body = JSON.stringify(data);
    const etag = `"${crypto.createHash('sha1').update(body).digest('base64url')}${user ? '-a' : ''}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag }); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ETag: etag, 'Cache-Control': 'no-cache' });
    return res.end(body);
  }

  if (p === '/api/login' && req.method === 'POST') {
    const ip = clientIp(req);
    if (rateLimited(ip)) throw new HttpError(429, 'Слишком много попыток. Подождите 10 минут.');
    const { username = '', password = '' } = await readJson(req);
    const okUser = String(username).trim().toLowerCase() === cfg.adminUser.toLowerCase();
    const okPass = verifyPassword(password, cfg.adminHash);
    if (!okUser || !okPass) throw new HttpError(401, 'Неверный логин или пароль.');
    attempts.delete(ip);
    return send(res, 200, { token: signToken(cfg.adminUser), user: cfg.adminUser });
  }

  if (p === '/api/me' && req.method === 'GET') { needAdmin(); return send(res, 200, { user: user.u }); }

  // --- персонаж (одна запись) ---
  if (p === '/api/character' && req.method === 'PUT') {
    needAdmin();
    const data = await readJson(req);
    const [[row]] = await pool.query('SELECT id FROM `characters` ORDER BY id LIMIT 1');
    const saved = row ? await updateRow('character', row.id, data) : await insertRow('character', data);
    return send(res, 200, saved);
  }

  // --- пакетное обновление (порядок галереи, раскладка узлов) ---
  if (p === '/api/batch' && req.method === 'POST') {
    needAdmin();
    const { ops = [] } = await readJson(req);
    if (!Array.isArray(ops) || ops.length > 500) throw new HttpError(400, 'Некорректный пакет.');
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const op of ops) {
        if (!WRITABLE.includes(op.table)) throw new HttpError(400, `Таблица ${op.table} недоступна.`);
        await updateRow(op.table, Number(op.id), op.data || {}, conn);
      }
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    return send(res, 200, { ok: true, count: ops.length });
  }

  // --- импорт JSON-копии ---
  if (p === '/api/import' && req.method === 'POST') {
    needAdmin();
    const data = await readJson(req);
    const conn = await pool.getConnection();
    let count = 0;
    try {
      await conn.beginTransaction();
      const character = Array.isArray(data.character) ? data.character[0] : data.character;
      if (character) {
        const [[row]] = await conn.query('SELECT id FROM `characters` ORDER BY id LIMIT 1');
        if (row) await updateRow('character', row.id, character, conn); else await insertRow('character', character, conn);
        count++;
      }
      for (const [key, resource] of [['chapters', 'chapters'], ['relationships', 'relationships'], ['gallery', 'gallery'], ['links', 'character_links'], ['character_links', 'character_links']]) {
        for (const row of Array.isArray(data[key]) ? data[key] : []) {
          if (resource === 'character_links') {
            const a = Number(row.from_id), b = Number(row.to_id);
            if (!a || !b || a === b) continue;
            row.from_id = Math.min(a, b); row.to_id = Math.max(a, b);
          }
          await upsertRow(resource, row, conn);
          count++;
        }
      }
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    return send(res, 200, { ok: true, count });
  }

  // --- изображения ---
  if (p === '/api/upload' && req.method === 'PUT') {
    needAdmin();
    const folder = safeFolder(url.searchParams.get('folder'));
    if (!folder) throw new HttpError(400, 'Неизвестная папка.');
    const buf = await readBody(req, cfg.maxUpload);
    const ext = Object.keys(IMAGE_TYPES).find(k => IMAGE_TYPES[k].test(buf));
    if (!ext) throw new HttpError(415, 'Поддерживаются только JPG, PNG, GIF и WebP.');
    const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    await fsp.mkdir(path.join(cfg.uploadDir, folder), { recursive: true });
    await fsp.writeFile(path.join(cfg.uploadDir, folder, name), buf);
    return send(res, 201, { url: `/uploads/${folder}/${name}` });
  }

  if (p === '/api/uploads' && req.method === 'GET') {
    needAdmin();
    const folder = safeFolder(url.searchParams.get('folder'));
    if (!folder) throw new HttpError(400, 'Неизвестная папка.');
    const dir = path.join(cfg.uploadDir, folder);
    let names = [];
    try { names = await fsp.readdir(dir); } catch {}
    const files = await Promise.all(names.filter(n => /\.(jpe?g|png|gif|webp)$/i.test(n)).map(async n => ({ name: n, url: `/uploads/${folder}/${n}`, mtime: (await fsp.stat(path.join(dir, n))).mtimeMs })));
    return send(res, 200, files.sort((a, b) => b.mtime - a.mtime).slice(0, 200));
  }

  if (p === '/api/uploads' && req.method === 'DELETE') {
    needAdmin();
    const file = uploadPathFromUrl(url.searchParams.get('url'));
    if (!file) throw new HttpError(400, 'Некорректный адрес файла.');
    await fsp.unlink(file).catch(() => {});
    return send(res, 204);
  }

  // --- CRUD: /api/<table> и /api/<table>/<id> ---
  const m = /^\/api\/([a-z_]+)(?:\/(\d+))?$/.exec(p);
  if (m && WRITABLE.includes(m[1])) {
    needAdmin();
    const [, resource, idRaw] = m;
    const id = idRaw ? Number(idRaw) : null;

    if (req.method === 'POST' && !id) {
      const data = await readJson(req);
      if (resource === 'character_links') {
        const a = Number(data.from_id), b = Number(data.to_id);
        if (!a || !b || a === b) throw new HttpError(400, 'Нужны два разных персонажа.');
        data.from_id = Math.min(a, b); data.to_id = Math.max(a, b);
        const [[ex]] = await pool.query('SELECT id FROM `character_links` WHERE from_id = ? AND to_id = ?', [data.from_id, data.to_id]);
        if (ex) return send(res, 200, await getRow(resource, ex.id));
      }
      // Восстановление после «Отменить»: запись возвращается со старым id.
      if (data.id && url.searchParams.get('restore') === '1') {
        await upsertRow(resource, data);
        return send(res, 201, await getRow(resource, Number(data.id)));
      }
      return send(res, 201, await insertRow(resource, data));
    }
    if (req.method === 'PATCH' && id) {
      const row = await updateRow(resource, id, await readJson(req));
      if (!row) throw new HttpError(404, 'Запись не найдена.');
      return send(res, 200, row);
    }
    if (req.method === 'DELETE' && id) {
      const row = await getRow(resource, id);
      if (!row) throw new HttpError(404, 'Запись не найдена.');
      await pool.query(`DELETE FROM ${q(RES[resource].table)} WHERE id = ?`, [id]);
      return send(res, 200, row);
    }
  }

  throw new HttpError(404, 'Маршрут не найден.');
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(e => {
    const status = e.status || 500;
    if (status >= 500) console.error('[api]', req.method, req.url, e);
    if (!res.headersSent) send(res, status, { error: status >= 500 ? 'Внутренняя ошибка сервера.' : e.message });
    else res.end();
  });
});

migrate()
  .then(() => server.listen(cfg.port, cfg.host, () => console.log(`[api] Архив слушает http://${cfg.host}:${cfg.port}`)))
  .catch(e => { console.error('[api] Не удалось подготовить базу:', e.message); process.exit(1); });

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(); pool.end().finally(() => process.exit(0)); });
