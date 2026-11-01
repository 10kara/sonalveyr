import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Save, Trash2, Plus, Upload, RefreshCw, LogOut, Images, Pencil, Eye, EyeOff, Download, ArrowUp, ArrowDown,
  Undo2, Search, X, Orbit, RotateCcw, Link2, Unlink, GripVertical, ExternalLink,
} from 'lucide-react';
import { api, auth, hasApi, compressImage, normalizeGroup, layoutNodes, linkPair, samePair, GROUPS, groupMeta, RELATION_TYPES, relationLabels, store } from './lib.js';
import { Page, Frame, SafeImage, RelationTags, isEditable } from './ui.jsx';
import { NetworkMap } from './pages.jsx';

/* ============================================================
   ВХОД
   ============================================================ */
function Login({ onDone }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async e => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await api('/api/login', { method: 'POST', body: { username, password } });
      auth.set(r.token);
      onDone(r.user);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return <Page title="Служебный вход" lead="Редактирование архива доступно только хранителю записи.">
    {!hasApi && <p className="form-error">Сайт собран без адреса API (VITE_API_URL), поэтому вход недоступен. См. README.</p>}
    <form className="login" onSubmit={submit}>
      <Field label="Логин" value={username} onChange={setUsername} autoComplete="username" required autoFocus />
      <div className="field">
        <label htmlFor="pw">Пароль</label>
        <div className="input-with-btn">
          <input id="pw" type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
          <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
        </div>
      </div>
      <button className="btn" disabled={busy || !hasApi}>{busy ? 'Проверяем…' : 'Войти'}</button>
      {err && <p className="form-error" role="alert">{err}</p>}
    </form>
  </Page>;
}

export default function Admin({ archive }) {
  const [user, setUser] = useState(undefined);
  useEffect(() => {
    if (!auth.get()) { setUser(null); return; }
    api('/api/me').then(r => setUser(r.user)).catch(() => setUser(null));
  }, []);
  if (user === undefined) return <Page title="Служебный вход"><p className="muted">Проверяем сессию…</p></Page>;
  if (!user) return <Login onDone={u => { setUser(u); archive.reload(); }} />;
  return <Panel archive={archive} user={user} onLogout={() => { auth.set(''); setUser(null); archive.reload(); }} />;
}

/* ============================================================
   ПОЛЯ ФОРМ
   ============================================================ */
function Field({ label, value, onChange, type = 'text', hint, ...rest }) {
  const id = useId();
  return <div className="field">
    <label htmlFor={id}>{label}</label>
    <input id={id} type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} {...rest} />
    {hint && <small>{hint}</small>}
  </div>;
}
function Area({ label, value, onChange, rows = 5, hint }) {
  const id = useId();
  return <div className="field">
    <label htmlFor={id}>{label}</label>
    <textarea id={id} rows={rows} value={value ?? ''} onChange={e => onChange(e.target.value)} />
    {hint && <small>{hint}</small>}
  </div>;
}
function Check({ label, checked, onChange }) {
  return <label className="check"><input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} /> {label}</label>;
}

// Редактор списков «название — описание» (черты, формы, меч, взгляды).
function Pairs({ label, value, onChange, titleLabel = 'Название', textLabel = 'Описание' }) {
  const list = Array.isArray(value) ? value : [];
  const set = (i, k, v) => onChange(list.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; const n = [...list]; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
  return <fieldset className="pairs-editor">
    <legend>{label}</legend>
    {list.map((x, i) => <div className="pair-row" key={i}>
      <input aria-label={`${titleLabel} ${i + 1}`} placeholder={titleLabel} value={x.title || ''} onChange={e => set(i, 'title', e.target.value)} />
      <input aria-label={`${textLabel} ${i + 1}`} placeholder={textLabel} value={x.text || ''} onChange={e => set(i, 'text', e.target.value)} />
      <span className="pair-tools">
        <button type="button" className="icon-btn" onClick={() => move(i, -1)} aria-label="Выше"><ArrowUp size={14} /></button>
        <button type="button" className="icon-btn" onClick={() => move(i, 1)} aria-label="Ниже"><ArrowDown size={14} /></button>
        <button type="button" className="icon-btn danger" onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label="Удалить строку"><X size={14} /></button>
      </span>
    </div>)}
    <button type="button" className="btn btn-small btn-quiet" onClick={() => onChange([...list, { title: '', text: '' }])}><Plus size={14} /> Добавить строку</button>
  </fieldset>;
}

/* ---------- изображения ---------- */
async function uploadImage(file, folder) {
  const blob = await compressImage(file);
  const r = await api(`/api/upload?folder=${folder}`, { method: 'PUT', body: blob, timeout: 60000 });
  return r.url;
}

function Picker({ folder, onPick, onClose }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api(`/api/uploads?folder=${folder}`).then(setItems).catch(e => setErr(e.message)); }, [folder]);
  useEffect(() => { const h = e => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  return createPortal(<div className="modal" onMouseDown={onClose}>
    <div className="modal-box" role="dialog" aria-modal="true" aria-label="Загруженные изображения" onMouseDown={e => e.stopPropagation()}>
      <header><h2>Загруженные изображения</h2><button className="icon-btn" onClick={onClose} aria-label="Закрыть"><X size={18} /></button></header>
      {err && <p className="form-error">{err}</p>}
      {!items && !err && <p className="muted">Загружаем список…</p>}
      {items && !items.length && <p className="muted">В этой папке пока ничего нет.</p>}
      <div className="picker-grid">{items?.map(x => <button key={x.name} onClick={() => { onPick(x.url); onClose(); }}><SafeImage src={x.url} alt={x.name} loading="lazy" /></button>)}</div>
    </div>
  </div>, document.body);
}

function ImageField({ label, value, onChange, folder, holo, onHolo, notify }) {
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const id = useId();
  const take = async file => {
    if (!file) return;
    setBusy(true);
    try { onChange(await uploadImage(file, folder)); notify('Изображение загружено. Сохраните запись, чтобы применить его.'); }
    catch (e) { notify(e.message, 'err'); } finally { setBusy(false); }
  };
  return <div className={`field image-field ${drag ? 'is-drag' : ''}`}
    onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
    onDrop={e => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files?.[0]); }}
    onPaste={e => { const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith('image/')); if (f) { e.preventDefault(); take(f); } }}>
    <label htmlFor={id}>{label}</label>
    <div className="image-field-row">
      <input id={id} value={value || ''} onChange={e => onChange(e.target.value)} placeholder="Ссылка или загруженный файл" />
      <label className="btn btn-small btn-quiet"><Upload size={14} /> {busy ? 'Загрузка…' : 'Загрузить'}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={e => { take(e.target.files?.[0]); e.target.value = ''; }} /></label>
      <button type="button" className="btn btn-small btn-quiet" onClick={() => setPick(true)}><Images size={14} /> Выбрать</button>
    </div>
    <small>Можно перетащить файл или вставить из буфера. Перед загрузкой снимок сжимается в WebP.</small>
    {value && <div className="image-preview"><Frame holo={holo !== false}><SafeImage src={value} alt="Предпросмотр" /></Frame>
      <div>{onHolo && <Check label="Эффект голопроекции" checked={holo !== false} onChange={onHolo} />}<button type="button" className="link-btn danger" onClick={() => onChange('')}>Убрать изображение</button></div></div>}
    {pick && <Picker folder={folder} onPick={onChange} onClose={() => setPick(false)} />}
  </div>;
}

/* ============================================================
   ЧЕРНОВИКИ И ГРЯЗНЫЕ ФОРМЫ
   ============================================================ */
const draftKey = (res, id) => `sv-draft:${res}:${id || 'new'}`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function useDraft(res, form, base, active) {
  const key = draftKey(res, form.id);
  const dirty = !same(form, base);
  const [found, setFound] = useState(null);
  useEffect(() => {
    const d = store.get(key);
    setFound(d && !same(d.data, base) ? d : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (!active || !dirty) return;
    const t = setTimeout(() => store.set(key, { savedAt: Date.now(), data: form }), 800);
    return () => clearTimeout(t);
  }, [form, dirty, active, key]);
  const clear = () => { store.set(key, null); setFound(null); };
  return { dirty, found, clear, dismiss: () => setFound(null) };
}

function DraftNote({ draft, onRestore }) {
  if (!draft.found) return null;
  return <div className="draft" role="status">
    <span>Есть несохранённый черновик от {new Date(draft.found.savedAt).toLocaleString('ru-RU')}.</span>
    <button type="button" className="link-btn" onClick={() => { onRestore(draft.found.data); draft.dismiss(); }}>Восстановить</button>
    <button type="button" className="link-btn" onClick={draft.clear}>Удалить</button>
  </div>;
}

/* ============================================================
   ПАНЕЛЬ
   ============================================================ */
const TABS = [['character', 'Персонаж'], ['chapters', 'Главы'], ['relationships', 'Связи'], ['network', 'Карта связей'], ['gallery', 'Галерея']];

function Panel({ archive, user, onLogout }) {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'character';
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const dirtyRef = useRef({});
  const nav = useNavigate();

  useEffect(() => { archive.reload(); /* подтянуть скрытые главы */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (toast && toast.kind !== 'err') { const t = setTimeout(() => setToast(null), toast.undo ? 8000 : 4000); return () => clearTimeout(t); } }, [toast]);
  useEffect(() => {
    const h = e => { if (Object.values(dirtyRef.current).some(Boolean)) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  const notify = useCallback((text, kind = 'ok', undo) => setToast({ text, kind, undo, at: Date.now() }), []);
  const run = useCallback(async (fn, ok) => {
    setBusy(true);
    try { const r = await fn(); if (ok) notify(ok); await archive.reload(); return r ?? true; }
    catch (e) { if (e.status === 401) { notify('Сессия истекла. Войдите снова.', 'err'); onLogout(); } else notify(e.message, 'err'); return false; }
    finally { setBusy(false); }
  }, [archive, notify, onLogout]);

  const switchTab = next => {
    if (next === tab) return;
    if (dirtyRef.current[tab] && !window.confirm('В форме есть несохранённые изменения. Черновик останется, но перейти?')) return;
    setParams({ tab: next }, { replace: true });
  };

  const exportData = () => {
    const { character, chapters, relationships, gallery, links } = archive;
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), character, chapters, relationships, gallery, links }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `solan-veyr-archive-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    notify('Резервная копия скачана.');
  };
  const importData = async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch { return notify('Файл не похож на JSON-копию архива.', 'err'); }
    if (!window.confirm('Импорт перезапишет записи с теми же id. Продолжить?')) return;
    const r = await run(() => api('/api/import', { method: 'POST', body: data, timeout: 60000 }));
    if (r) notify(`Импортировано записей: ${r.count}.`);
  };

  const shared = { archive, run, notify, busy, dirtyRef };
  const counts = { chapters: archive.chapters?.length, relationships: archive.relationships?.length, network: archive.links?.length, gallery: archive.gallery?.length };

  return <Page title="Админ-панель" wide>
    <div className="admin-bar">
      <span className="muted">Вы вошли как {user}</span>
      <div className="admin-bar-actions">
        <button className="btn btn-small btn-quiet" onClick={() => archive.reload()}><RefreshCw size={14} /> Обновить</button>
        <button className="btn btn-small btn-quiet" onClick={exportData}><Download size={14} /> Скачать копию</button>
        <label className="btn btn-small btn-quiet"><Upload size={14} /> Импорт<input type="file" accept="application/json" hidden onChange={importData} /></label>
        <button className="btn btn-small btn-quiet" onClick={() => { onLogout(); nav('/admin'); }}><LogOut size={14} /> Выйти</button>
      </div>
    </div>
    <div className="tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-active' : ''} onClick={() => switchTab(k)}>{l}{counts[k] != null && <i>{counts[k]}</i>}</button>)}</div>

    {tab === 'character' && <CharacterTab {...shared} />}
    {tab === 'chapters' && <Collection {...shared} resource="chapters" config={CHAPTERS} />}
    {tab === 'relationships' && <Collection {...shared} resource="relationships" config={RELATIONS} />}
    {tab === 'network' && <NetworkTab {...shared} />}
    {tab === 'gallery' && <Collection {...shared} resource="gallery" config={GALLERY} />}

    <p className="admin-foot muted">Черновики сохраняются в браузере автоматически. Ctrl+S — сохранить, Esc — отменить правку.</p>

    {toast && <div className={`toast ${toast.kind}`} role={toast.kind === 'err' ? 'alert' : 'status'}>
      <span>{toast.text}</span>
      {toast.undo && <button className="link-btn" onClick={() => { toast.undo(); setToast(null); }}><Undo2 size={14} /> Отменить</button>}
      <button className="icon-btn" aria-label="Закрыть" onClick={() => setToast(null)}><X size={14} /></button>
    </div>}
  </Page>;
}

// Общие горячие клавиши формы.
function useFormKeys(formRef, onCancel, dirty) {
  useEffect(() => {
    const h = e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); formRef.current?.requestSubmit(); }
      if (e.key === 'Escape' && dirty && !isEditable(e.target) && !document.querySelector('.modal')) onCancel();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [formRef, onCancel, dirty]);
}

/* ============================================================
   ПЕРСОНАЖ
   ============================================================ */
const CHAR_FIELDS = ['name', 'name_latin', 'former_name', 'species', 'gender', 'age', 'homeworld', 'affiliation', 'rank_title', 'specialization', 'alignment', 'eye_color', 'saber_color', 'callsign', 'epigraph', 'summary', 'appearance', 'personality', 'flaw', 'combat_style', 'traits', 'forms', 'saber', 'details', 'image_url', 'holo_effect'];
const pickChar = c => Object.fromEntries(CHAR_FIELDS.map(k => [k, c?.[k] ?? (k === 'holo_effect' ? true : ['traits', 'forms', 'saber', 'details'].includes(k) ? [] : '')]));

function CharacterTab({ archive, run, notify, busy, dirtyRef }) {
  const base = useMemo(() => pickChar(archive.character), [archive.character]);
  const [form, setForm] = useState(base);
  const draft = useDraft('character', form, base, true);
  const formRef = useRef(null);
  const touched = useRef(false);
  // Если запись обновилась на сервере, а форму ещё не трогали — подхватываем.
  useEffect(() => { if (!touched.current) setForm(base); }, [base]);
  dirtyRef.current.character = draft.dirty;
  const set = k => v => { touched.current = true; setForm(f => ({ ...f, [k]: v })); };
  const cancel = useCallback(() => { touched.current = false; setForm(base); draft.clear(); }, [base, draft]);
  useFormKeys(formRef, cancel, draft.dirty);

  const save = async e => {
    e.preventDefault();
    const ok = await run(() => api('/api/character', { method: 'PUT', body: { ...form, age: form.age === '' ? null : Number(form.age) } }), 'Персонаж сохранён.');
    if (ok) { touched.current = false; draft.clear(); }
  };
  return <form className="editor" ref={formRef} onSubmit={save}>
    <DraftNote draft={draft} onRestore={d => { touched.current = true; setForm({ ...base, ...d }); }} />
    <fieldset className="form-section"><legend>Основное</legend>
      <div className="grid-2">
        <Field label="Полное имя" value={form.name} onChange={set('name')} required />
        <Field label="Имя латиницей" value={form.name_latin} onChange={set('name_latin')} />
        <Field label="Прежнее имя" value={form.former_name} onChange={set('former_name')} />
        <Field label="Раса" value={form.species} onChange={set('species')} />
        <Field label="Пол" value={form.gender} onChange={set('gender')} />
        <Field label="Возраст" type="number" min="0" value={form.age} onChange={set('age')} />
        <Field label="Родная планета" value={form.homeworld} onChange={set('homeworld')} />
        <Field label="Принадлежность" value={form.affiliation} onChange={set('affiliation')} />
        <Field label="Звание" value={form.rank_title} onChange={set('rank_title')} />
        <Field label="Специализация" value={form.specialization} onChange={set('specialization')} />
        <Field label="Мировоззрение" value={form.alignment} onChange={set('alignment')} />
        <Field label="Цвет глаз" value={form.eye_color} onChange={set('eye_color')} />
        <Field label="Цвет светового меча" value={form.saber_color} onChange={set('saber_color')} />
        <Field label="Прозвище среди клонов" value={form.callsign} onChange={set('callsign')} />
      </div>
      <Field label="Цитата на главной" value={form.epigraph} onChange={set('epigraph')} />
      <Area label="Краткое описание" rows={3} value={form.summary} onChange={set('summary')} />
      <ImageField label="Портрет" value={form.image_url} onChange={set('image_url')} folder="character" holo={form.holo_effect} onHolo={set('holo_effect')} notify={notify} />
    </fieldset>
    <fieldset className="form-section"><legend>Внешность и характер</legend>
      <Area label="Внешность" rows={8} value={form.appearance} onChange={set('appearance')} hint="Строки, начинающиеся с «- », показываются списком." />
      <Area label="Характер — вступление" rows={3} value={form.personality} onChange={set('personality')} />
      <Pairs label="Черты характера" value={form.traits} onChange={set('traits')} titleLabel="Черта" />
      <Area label="Главный недостаток" rows={3} value={form.flaw} onChange={set('flaw')} />
    </fieldset>
    <fieldset className="form-section"><legend>Бой</legend>
      <Area label="Боевой стиль" rows={4} value={form.combat_style} onChange={set('combat_style')} />
      <Pairs label="Формы владения мечом" value={form.forms} onChange={set('forms')} titleLabel="Форма, например «III — Соресу»" textLabel="Применение" />
      <Pairs label="Световой меч" value={form.saber} onChange={set('saber')} titleLabel="Параметр" textLabel="Значение" />
    </fieldset>
    <fieldset className="form-section"><legend>Взгляды и привычки</legend>
      <Pairs label="Детали" value={form.details} onChange={set('details')} />
    </fieldset>
    <div className="form-actions sticky">
      <span className={`save-state ${draft.dirty ? 'is-dirty' : ''}`}>{draft.dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены'}</span>
      {draft.dirty && <button type="button" className="btn btn-quiet" onClick={cancel}>Отменить</button>}
      <button className="btn" disabled={busy || !draft.dirty}><Save size={16} /> Сохранить персонажа</button>
    </div>
  </form>;
}

/* ============================================================
   КОЛЛЕКЦИИ: главы, связи, галерея
   ============================================================ */
function RelationPicker({ value, onChange }) {
  const sel = relationLabels(value).map(x => x.toLowerCase());
  const toggle = l => { const next = sel.includes(l.toLowerCase()) ? sel.filter(x => x !== l.toLowerCase()) : [...sel, l.toLowerCase()]; onChange(RELATION_TYPES.filter(([n]) => next.includes(n.toLowerCase())).map(([n]) => n).join(', ')); };
  return <fieldset className="pairs-editor"><legend>Характер связи</legend>
    <div className="chips">{RELATION_TYPES.map(([l, tone]) => <label key={l} className={`chip tone-${tone} ${sel.includes(l.toLowerCase()) ? 'is-on' : ''}`}><input type="checkbox" checked={sel.includes(l.toLowerCase())} onChange={() => toggle(l)} />{l}</label>)}</div>
  </fieldset>;
}

const CHAPTERS = {
  label: 'главу', labelNew: 'Новая глава', labelEdit: 'Правка главы', save: 'Сохранить главу', add: 'Добавить главу', folder: 'chapters',
  empty: { id: null, chapter_number: '', title: '', content: '', cover_image: '', published: true, holo_effect: true },
  fields: ['chapter_number', 'title', 'content', 'cover_image', 'published', 'holo_effect'],
  sort: (a, b) => (a.chapter_number ?? 0) - (b.chapter_number ?? 0),
  search: x => `${x.chapter_number} ${x.title} ${x.content}`,
  prepare: (f, list) => ({ ...f, chapter_number: Number(f.chapter_number) || Math.max(0, ...list.map(x => Number(x.chapter_number) || 0)) + 1 }),
  image: x => x.cover_image,
  form: (f, set, ctx) => <>
    <div className="grid-2 grid-narrow-first">
      <Field label="Номер" type="number" min="0" value={f.chapter_number} onChange={set('chapter_number')} placeholder={String(Math.max(0, ...ctx.list.map(x => Number(x.chapter_number) || 0)) + 1)} />
      <Field label="Название" value={f.title} onChange={set('title')} required />
    </div>
    <Area label="Текст главы" rows={14} value={f.content} onChange={set('content')} hint={`${String(f.content || '').length} знаков. Каждая строка — отдельный абзац.`} />
    <ImageField label="Обложка" value={f.cover_image} onChange={set('cover_image')} folder="chapters" holo={f.holo_effect} onHolo={set('holo_effect')} notify={ctx.notify} />
    <Check label="Опубликована на сайте" checked={f.published} onChange={set('published')} />
  </>,
  item: (x, ctx) => <>
    <span className="item-num">{x.chapter_number ?? '—'}</span>
    <div className="item-text"><b>{x.title || 'Без названия'}</b><small className={x.published === false ? 'st-off' : 'st-on'}>{x.published === false ? 'Скрыта' : 'Опубликована'}</small></div>
    <Link className="icon-btn" to={`/history?chapter=${x.id}`} title="Открыть на сайте" aria-label="Открыть на сайте"><ExternalLink size={15} /></Link>
    <button className="icon-btn" title={x.published === false ? 'Опубликовать' : 'Скрыть'} aria-label={x.published === false ? 'Опубликовать' : 'Скрыть'}
      onClick={() => ctx.run(() => api(`/api/chapters/${x.id}`, { method: 'PATCH', body: { published: x.published === false } }), x.published === false ? 'Глава опубликована.' : 'Глава скрыта.')}>{x.published === false ? <EyeOff size={15} /> : <Eye size={15} />}</button>
  </>,
};

const RELATIONS = {
  label: 'связь', labelNew: 'Новая связь', labelEdit: 'Правка связи', save: 'Сохранить связь', add: 'Добавить связь', folder: 'relationships',
  empty: { id: null, name: '', role: '', relation: '', quote: '', image_url: '', holo_effect: true, group_tag: 'clones', pos_x: null, pos_y: null },
  fields: ['name', 'role', 'relation', 'quote', 'image_url', 'holo_effect', 'group_tag', 'pos_x', 'pos_y'],
  sort: (a, b) => a.id - b.id,
  search: x => `${x.name} ${x.role} ${x.relation}`,
  prepare: f => ({ ...f, group_tag: normalizeGroup(f.group_tag) }),
  image: x => x.image_url,
  form: (f, set, ctx) => <>
    <div className="grid-2">
      <Field label="Имя" value={f.name} onChange={set('name')} required />
      <Field label="Кто это для Солана" value={f.role} onChange={set('role')} placeholder="Например: сержант 212-го батальона" />
    </div>
    <div className="field"><label htmlFor="grp">Группа на карте</label>
      <select id="grp" value={normalizeGroup(f.group_tag)} onChange={e => set('group_tag')(e.target.value)}>{GROUPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
    <RelationPicker value={f.relation} onChange={set('relation')} />
    <Area label="Цитата" rows={3} value={f.quote} onChange={set('quote')} />
    <ImageField label="Фотография" value={f.image_url} onChange={set('image_url')} folder="relationships" holo={f.holo_effect} onHolo={set('holo_effect')} notify={ctx.notify} />
    <small className="muted">Положение на карте задаётся перетаскиванием во вкладке «Карта связей».</small>
  </>,
  item: x => <>
    {x.image_url ? <Frame holo={false} className="item-thumb"><SafeImage src={x.image_url} alt="" /></Frame> : <span className="item-num">{String(x.name || '?')[0]}</span>}
    <div className="item-text"><b>{x.name}</b><small>{[x.role, groupMeta(x.group_tag)[1]].filter(Boolean).join(', ')}</small><RelationTags value={x.relation} /></div>
  </>,
};

const GALLERY = {
  label: 'снимок', labelNew: 'Новый снимок', labelEdit: 'Правка снимка', save: 'Сохранить снимок', add: 'Добавить снимок', folder: 'gallery',
  empty: { id: null, title: '', caption: '', image_url: '', category: 'archive', sort_order: 0, holo_effect: true },
  fields: ['title', 'caption', 'image_url', 'category', 'sort_order', 'holo_effect'],
  sort: (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || b.id - a.id,
  search: x => `${x.title} ${x.caption}`,
  prepare: (f, list) => ({ ...f, sort_order: f.id ? Number(f.sort_order) || 0 : Math.min(0, ...list.map(x => x.sort_order ?? 0)) - 1 }),
  validate: f => (!f.image_url ? 'Загрузите изображение или вставьте ссылку.' : ''),
  image: x => x.image_url,
  reorder: true,
  form: (f, set, ctx) => <>
    <ImageField label="Изображение" value={f.image_url} onChange={set('image_url')} folder="gallery" holo={f.holo_effect} onHolo={set('holo_effect')} notify={ctx.notify} />
    <div className="grid-2">
      <Field label="Название" value={f.title} onChange={set('title')} />
      <div className="field"><label htmlFor="cat">Раздел</label>
        <select id="cat" value={f.category || 'archive'} onChange={e => set('category')(e.target.value)}><option value="portrait">Портреты</option><option value="field">С заданий</option><option value="archive">Архив</option></select></div>
    </div>
    <Field label="Подпись" value={f.caption} onChange={set('caption')} />
  </>,
  item: x => <>
    <Frame holo={false} className="item-thumb"><SafeImage src={x.image_url} alt="" loading="lazy" /></Frame>
    <div className="item-text"><b>{x.title || 'Без названия'}</b><small>{x.caption}</small></div>
  </>,
};

function Collection({ archive, run, notify, busy, dirtyRef, resource, config }) {
  const list = useMemo(() => [...(archive[resource] || [])].sort(config.sort), [archive, resource, config]);
  const pick = x => Object.fromEntries(['id', ...config.fields].map(k => [k, x?.[k] ?? config.empty[k]]));
  const [form, setForm] = useState(config.empty);
  const [query, setQuery] = useState('');
  const [dragId, setDragId] = useState(null);
  const base = useMemo(() => (form.id ? pick(list.find(x => x.id === form.id)) : config.empty), [form.id, list]); // eslint-disable-line react-hooks/exhaustive-deps
  const draft = useDraft(resource, form, base, true);
  dirtyRef.current[resource] = draft.dirty;
  const formRef = useRef(null);
  const set = k => v => setForm(f => ({ ...f, [k]: v }));
  const reset = useCallback(() => { draft.clear(); setForm(config.empty); }, [draft, config]);
  useFormKeys(formRef, reset, draft.dirty);

  const edit = x => {
    if (draft.dirty && !window.confirm('Текущие правки не сохранены. Открыть другую запись?')) return;
    setForm(pick(x));
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const save = async e => {
    e.preventDefault();
    const err = config.validate?.(form);
    if (err) return notify(err, 'err');
    const { id, ...body } = config.prepare ? config.prepare(form, list) : form;
    const r = await run(() => api(id ? `/api/${resource}/${id}` : `/api/${resource}`, { method: id ? 'PATCH' : 'POST', body }), id ? 'Изменения сохранены.' : 'Запись добавлена.');
    if (r) { draft.clear(); setForm(id ? pick(r) : config.empty); }
  };
  const remove = x => {
    if (!window.confirm(`Удалить ${config.label} «${x.title || x.name || x.id}»?`)) return;
    run(() => api(`/api/${resource}/${x.id}`, { method: 'DELETE' })).then(deleted => {
      if (!deleted) return;
      if (form.id === x.id) setForm(config.empty);
      notify('Запись удалена.', 'ok', () => run(() => api(`/api/${resource}?restore=1`, { method: 'POST', body: deleted }), 'Запись восстановлена.'));
    });
  };
  const reorder = async (fromId, toId) => {
    const ids = list.map(x => x.id);
    const from = ids.indexOf(fromId), to = ids.indexOf(toId);
    if (from < 0 || to < 0 || from === to) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    await run(() => api('/api/batch', { method: 'POST', body: { ops: ids.map((id, i) => ({ table: resource, id, data: { sort_order: i } })) } }), 'Порядок сохранён.');
  };
  const move = (x, d) => { const i = list.indexOf(x), j = i + d; if (j >= 0 && j < list.length) reorder(x.id, list[j].id); };

  const shown = query ? list.filter(x => config.search(x).toLowerCase().includes(query.toLowerCase())) : list;
  const ctx = { list, notify, run };
  return <div className="admin-columns">
    <form className="editor" ref={formRef} onSubmit={save}>
      <h2>{form.id ? config.labelEdit : config.labelNew}</h2>
      <DraftNote draft={draft} onRestore={d => setForm({ ...config.empty, ...d })} />
      {config.form(form, set, ctx)}
      <div className="form-actions">
        {(form.id || draft.dirty) && <button type="button" className="btn btn-quiet" onClick={reset}>{form.id ? 'Закрыть' : 'Очистить'}</button>}
        <button className="btn" disabled={busy || (!!form.id && !draft.dirty)}>{form.id ? <><Save size={16} /> {config.save}</> : <><Plus size={16} /> {config.add}</>}</button>
      </div>
    </form>
    <div className="admin-list">
      <div className="search"><Search size={15} /><input type="search" placeholder="Поиск" aria-label="Поиск по списку" value={query} onChange={e => setQuery(e.target.value)} /></div>
      {!shown.length && <p className="muted">{list.length ? 'Ничего не найдено.' : 'Пока пусто — заполните форму слева.'}</p>}
      <ul>{shown.map(x => <li key={x.id} className={`item ${form.id === x.id ? 'is-editing' : ''} ${dragId === x.id ? 'is-dragging' : ''}`}
        draggable={config.reorder && !query} onDragStart={() => setDragId(x.id)} onDragEnd={() => setDragId(null)}
        onDragOver={e => config.reorder && e.preventDefault()} onDrop={() => { if (dragId && dragId !== x.id) reorder(dragId, x.id); setDragId(null); }}>
        {config.reorder && !query && <GripVertical size={14} className="grip" aria-hidden="true" />}
        {config.item(x, ctx)}
        <span className="item-tools">
          {config.reorder && !query && <><button className="icon-btn" aria-label="Выше" onClick={() => move(x, -1)}><ArrowUp size={15} /></button><button className="icon-btn" aria-label="Ниже" onClick={() => move(x, 1)}><ArrowDown size={15} /></button></>}
          <button className="icon-btn" aria-label="Редактировать" title="Редактировать" onClick={() => edit(x)}><Pencil size={15} /></button>
          <button className="icon-btn danger" aria-label="Удалить" title="Удалить" onClick={() => remove(x)}><Trash2 size={15} /></button>
        </span>
      </li>)}</ul>
    </div>
  </div>;
}

/* ============================================================
   КАРТА СВЯЗЕЙ
   ============================================================ */
function NetworkTab({ archive, run, busy }) {
  const relationships = archive.relationships || [];
  const links = archive.links || [];
  const [filter, setFilter] = useState('all');
  const [drag, setDrag] = useState(null);
  const stageRef = useRef(null);
  const nodes = useMemo(() => {
    const laid = layoutNodes(relationships);
    return drag ? laid.map(n => (String(n.id) === String(drag.id) ? { ...n, x: drag.x, y: drag.y } : n)) : laid;
  }, [relationships, drag]);
  const shown = filter === 'all' ? nodes : nodes.filter(n => n.group === filter);
  const shownIds = new Set(shown.map(n => String(n.id)));

  const point = e => {
    const r = stageRef.current.getBoundingClientRect();
    return { x: +Math.max(2, Math.min(98, ((e.clientX - r.left) / r.width) * 100)).toFixed(2), y: +Math.max(3, Math.min(97, ((e.clientY - r.top) / r.height) * 100)).toFixed(2) };
  };
  const start = (e, id) => {
    if (e.button !== 0 || busy) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ id, ...point(e), moved: false });
  };
  useEffect(() => {
    if (!drag) return;
    const move = e => setDrag(d => d && { ...d, ...point(e), moved: true });
    const up = () => setDrag(d => {
      if (d?.moved) {
        archive.patch(a => ({ relationships: a.relationships.map(r => (String(r.id) === String(d.id) ? { ...r, pos_x: d.x, pos_y: d.y } : r)) }));
        run(() => api(`/api/relationships/${d.id}`, { method: 'PATCH', body: { pos_x: d.x, pos_y: d.y } }));
      }
      return null;
    });
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, [drag?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const target = filter === 'all' ? relationships : relationships.filter(x => normalizeGroup(x.group_tag) === filter);
  const circle = () => run(() => api('/api/batch', { method: 'POST', body: { ops: target.map((x, i) => { const a = (-90 + (360 / target.length) * i) * Math.PI / 180; return { table: 'relationships', id: x.id, data: { pos_x: +(50 + 38 * Math.cos(a)).toFixed(2), pos_y: +(50 + 38 * Math.sin(a)).toFixed(2) } }; }) } }), 'Узлы расставлены по кругу.');
  const auto = () => run(() => api('/api/batch', { method: 'POST', body: { ops: target.map(x => ({ table: 'relationships', id: x.id, data: { pos_x: null, pos_y: null } })) } }), 'Включена автоматическая раскладка по группам.');
  const linked = (a, b) => links.find(l => samePair(l, a, b));
  const toggle = (a, b) => {
    const l = linked(a, b);
    const [from_id, to_id] = linkPair(a, b);
    run(() => (l ? api(`/api/character_links/${l.id}`, { method: 'DELETE' }) : api('/api/character_links', { method: 'POST', body: { from_id, to_id } })), l ? 'Связь убрана.' : 'Связь добавлена.');
  };

  if (relationships.length === 0) return <p className="muted">Сначала добавьте записи во вкладке «Связи».</p>;
  return <>
    <section className="editor">
      <div className="editor-head">
        <h2>Расположение</h2>
        <div className="row-actions">
          <button className="btn btn-small btn-quiet" disabled={busy || !target.length} onClick={circle}><Orbit size={14} /> По кругу</button>
          <button className="btn btn-small btn-quiet" disabled={busy || !target.length} onClick={auto}><RotateCcw size={14} /> По группам</button>
        </div>
      </div>
      <p className="muted">Перетащите узел, чтобы поставить его вручную. Линии от центра к каждому персонажу рисуются автоматически, а связи между персонажами отмечаются в таблице ниже.</p>
      <NetworkMap nodes={shown} links={links} centerName={archive.character?.name} stageRef={stageRef} onNodePointerDown={start} dimmed={(a, b) => !shownIds.has(String(a.id)) || !shownIds.has(String(b.id))} />
    </section>
    <section className="editor">
      <div className="editor-head"><h2>Кто с кем связан</h2>
        <div className="filters" role="group" aria-label="Группа">
          <button className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>Все</button>
          {GROUPS.filter(([k]) => nodes.some(n => n.group === k)).map(([k, l]) => <button key={k} className={filter === k ? 'is-active' : ''} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
      </div>
      {shown.length < 2 ? <p className="muted">В этой группе меньше двух персонажей.</p>
        : <div className="matrix-wrap"><table className="matrix">
          <thead><tr><th /> {shown.map(n => <th key={n.id} scope="col"><span title={n.name}>{n.name}</span></th>)}</tr></thead>
          <tbody>{shown.map((a, i) => <tr key={a.id}><th scope="row">{a.name}</th>{shown.map((b, j) => {
            if (j <= i) return <td key={b.id} className="off" />;
            const on = !!linked(a.id, b.id);
            return <td key={b.id}><button className={`cell ${on ? 'is-on' : ''}`} disabled={busy} aria-pressed={on} aria-label={`${a.name} и ${b.name}`} onClick={() => toggle(a.id, b.id)}>{on ? <Link2 size={13} /> : <Unlink size={13} />}</button></td>;
          })}</tr>)}</tbody>
        </table></div>}
    </section>
  </>;
}

