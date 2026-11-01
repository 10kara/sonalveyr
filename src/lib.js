// ============================================================
//  API-клиент, данные и общие хелперы
// ============================================================
import { useEffect, useState, useCallback, useRef } from 'react';
import seed from '../api/seed.json';

export const API_URL = String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export const hasApi = !!API_URL;
export const ARCHIVE_ID = 'SV-031';

/* ---------- безопасный localStorage ---------- */
export const store = {
  get(key, fallback = null) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); } catch {} },
  keys(prefix) { try { return Object.keys(localStorage).filter(k => k.startsWith(prefix)); } catch { return []; } },
};

/* ---------- токен админа ---------- */
const TOKEN_KEY = 'sv-admin-token';
export const auth = {
  get: () => store.get(TOKEN_KEY, ''),
  set: t => store.set(TOKEN_KEY, t || null),
};

/* ---------- запросы к API ---------- */
export async function api(path, { method = 'GET', body, timeout = 15000, headers = {} } = {}) {
  if (!hasApi) throw new Error('Адрес API не задан (VITE_API_URL).');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const h = { ...headers };
  const token = auth.get();
  if (token) h.Authorization = `Bearer ${token}`;
  let payload = body;
  if (body !== undefined && !(body instanceof Blob)) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  try {
    const res = await fetch(API_URL + path, { method, headers: h, body: payload, signal: ctrl.signal });
    if (res.status === 204 || res.status === 304) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 401) auth.set('');
      const err = new Error(data?.error || `Сервер ответил ошибкой ${res.status}.`);
      err.status = res.status;
      throw err;
    }
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`Сервер архива не ответил за ${Math.round(timeout / 1000)} с.`);
    if (e instanceof TypeError) throw new Error('Не удалось подключиться к серверу архива. Проверьте, что API запущен.');
    throw e;
  } finally { clearTimeout(timer); }
}

// В базе хранятся относительные пути /uploads/..., чтобы смена домена API
// не ломала картинки. Внешние ссылки (https://…) остаются как есть.
export const mediaUrl = u => (u && u.startsWith('/uploads/') ? API_URL + u : u || '');

/* ---------- загрузка архива ---------- */
const CACHE_KEY = 'sv-archive-cache-v1';
const FALLBACK = {
  character: seed.character,
  chapters: seed.chapters,
  relationships: seed.relationships,
  gallery: seed.gallery,
  links: seed.character_links,
};

export function useArchive() {
  // Сначала показываем последнюю сохранённую копию (или встроенные данные),
  // затем тихо обновляем с сервера — первая отрисовка без ожидания сети.
  const [data, setData] = useState(() => (hasApi ? store.get(CACHE_KEY, null) : FALLBACK));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(hasApi);
  const last = useRef(0);

  const load = useCallback(async () => {
    if (!hasApi) return;
    last.current = Date.now();
    setLoading(true);
    try {
      const next = await api('/api/archive');
      if (next) {
        setData(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
        if (!auth.get()) store.set(CACHE_KEY, next);
      }
      setError('');
    } catch (e) {
      setError(e.message);
      setData(prev => prev || FALLBACK);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    if (!hasApi) return;
    const refresh = () => { if (document.visibilityState === 'visible' && Date.now() - last.current > 30000) load(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [load]);

  const patch = useCallback(fn => setData(d => ({ ...d, ...fn(d) })), []);
  return { ...(data || {}), ready: !!data, loading, error, reload: load, patch };
}

/* ---------- текст ---------- */
export const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 10, b = Math.abs(n) % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
};
export const ageText = v => {
  const n = Number(v);
  return v === '' || v == null || !Number.isFinite(n) ? '' : `${n} ${plural(n, 'год', 'года', 'лет')}`;
};
export const countText = (n, forms) => `${n} ${plural(n, ...forms)}`;

// Текст из админки → блоки: строки «- …» собираются в список, остальные — абзацы.
export function richBlocks(text) {
  const blocks = [];
  for (const raw of String(text || '').split(/\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const item = /^[-•–]\s+(.*)$/.exec(line);
    if (item) {
      const prev = blocks[blocks.length - 1];
      if (prev?.type === 'ul') prev.items.push(item[1]); else blocks.push({ type: 'ul', items: [item[1]] });
    } else blocks.push({ type: 'p', text: line });
  }
  return blocks;
}

export const splitName = name => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return [parts[0] || '', parts.slice(1).join(' ')];
};

/* ---------- изображения ---------- */
export async function compressImage(file, max = 1800, quality = 0.84) {
  if (!file?.type?.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise(r => canvas.toBlob(r, 'image/webp', quality));
    return blob && blob.size < file.size ? blob : file;
  } catch { return file; }
}

/* ---------- связи ---------- */
export const RELATION_TYPES = [
  ['Семья', 'warm'], ['Доверие', 'blade'], ['Уважение', 'blade'], ['Боевое братство', 'blade'], ['Дружба', 'blade'],
  ['Благодарность', 'blade'], ['Наставник', 'moon'], ['Ученик', 'moon'], ['Интерес', 'moon'], ['Неопределённость', 'moon'],
  ['Настороженность', 'cloth'], ['Недоверие', 'cloth'], ['Разногласия', 'cloth'], ['Соперничество', 'cloth'],
  ['Неприязнь', 'red'], ['Враг', 'red'], ['Погиб', 'lost'],
];
export const relationLabels = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
export const relationTone = label => RELATION_TYPES.find(([n]) => n.toLowerCase() === String(label).toLowerCase())?.[1] || 'moon';

export const GROUPS = [
  ['jedi', 'Орден джедаев', '#a9dcff'],
  ['clones', 'Клоны', '#cfd6de'],
  ['family', 'Близкие', '#d8b48a'],
  ['ally', 'Союзники', '#9fd3b4'],
  ['sith', 'Враги', '#e58a8a'],
  ['other', 'Прочие', '#8c97a4'],
];
export const normalizeGroup = g => {
  const k = String(g || '').trim().toLowerCase();
  if (k === 'allied' || k === 'allies') return 'ally';
  return GROUPS.some(([x]) => x === k) ? k : 'other';
};
export const groupMeta = g => GROUPS.find(([k]) => k === normalizeGroup(g)) || GROUPS[5];

// Секторы круговой раскладки (градусы) для узлов без ручных координат.
const SECTORS = { jedi: [-140, 70], clones: [-50, 80], ally: [40, 60], family: [110, 40], sith: [160, 40], other: [210, 40] };
export function layoutNodes(list = []) {
  const byGroup = {};
  list.forEach(x => { (byGroup[normalizeGroup(x.group_tag)] ||= []).push(x); });
  const out = [];
  for (const [g, items] of Object.entries(byGroup)) {
    const [start, span] = SECTORS[g] || SECTORS.other;
    items.forEach((x, i) => {
      const px = Number(x.pos_x), py = Number(x.pos_y);
      if (x.pos_x != null && x.pos_y != null && x.pos_x !== '' && Number.isFinite(px) && Number.isFinite(py)) {
        out.push({ ...x, group: g, x: px, y: py });
        return;
      }
      const a = (start + (items.length === 1 ? span / 2 : (span / (items.length - 1)) * i)) * Math.PI / 180;
      out.push({ ...x, group: g, x: 50 + 38 * Math.cos(a), y: 50 + 38 * Math.sin(a) });
    });
  }
  return out;
}

export const linkPair = (a, b) => { const x = Number(a), y = Number(b); return x < y ? [x, y] : [y, x]; };
export const samePair = (l, a, b) => { const [x, y] = linkPair(a, b); const [p, q] = linkPair(l.from_id, l.to_id); return x === p && y === q; };
