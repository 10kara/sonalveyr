import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, X, ChevronLeft, ChevronRight, ImageOff, RefreshCw } from 'lucide-react';
import { mediaUrl, richBlocks, relationLabels, relationTone, store, ARCHIVE_ID } from './lib.js';

export const isEditable = t => !!t?.closest?.('input,textarea,select,[contenteditable="true"]');

/* ---------- картинки ---------- */
export function SafeImage({ src, alt = '', className = '', ...props }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  if (!src || bad) return <div className="img-missing" role="img" aria-label="Изображение недоступно"><ImageOff size={18} /><span>Изображение недоступно</span></div>;
  return <img className={className} src={mediaUrl(src)} alt={alt} decoding="async" onError={() => setBad(true)} {...props} />;
}

// holo=true — лёгкая голопроекция поверх снимка, false — обычное фото.
export function Frame({ holo = true, className = '', children, ...props }) {
  return <div className={`frame ${holo ? 'is-holo' : ''} ${className}`} {...props}>{children}</div>;
}

/* ---------- текст из админки ---------- */
export function Rich({ text, empty = 'Запись пока пуста.' }) {
  const blocks = richBlocks(text);
  if (!blocks.length) return <p className="muted">{empty}</p>;
  return blocks.map((b, i) => (b.type === 'ul'
    ? <ul key={i} className="rich-list">{b.items.map((x, j) => <li key={j}>{x}</li>)}</ul>
    : <p key={i}>{b.text}</p>));
}

export function RelationTags({ value }) {
  const labels = relationLabels(value);
  if (!labels.length) return null;
  return <div className="tags">{labels.map(l => <span key={l} className={`tag tone-${relationTone(l)}`}>{l}</span>)}</div>;
}

/* ---------- световой клинок (фирменный элемент) ---------- */
export function Blade({ className = '' }) {
  return <span className={`blade ${className}`} aria-hidden="true"><i className="blade-hilt" /><i className="blade-beam" /></span>;
}

/* ---------- лайтбокс ---------- */
export function Lightbox({ items, index, onClose, onStep }) {
  const item = items[index];
  const touch = useRef(null);
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); else if (e.key === 'ArrowRight') onStep(1); else if (e.key === 'ArrowLeft') onStep(-1); };
    window.addEventListener('keydown', h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = prev; };
  }, [onClose, onStep]);
  if (!item) return null;
  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Просмотр изображения" onClick={onClose}
      onTouchStart={e => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={e => { if (touch.current == null) return; const d = e.changedTouches[0].clientX - touch.current; if (Math.abs(d) > 45) onStep(d < 0 ? 1 : -1); touch.current = null; }}>
      <button className="lb-btn lb-close" aria-label="Закрыть" onClick={onClose}><X size={20} /></button>
      {items.length > 1 && <button className="lb-btn lb-prev" aria-label="Предыдущее" onClick={e => { e.stopPropagation(); onStep(-1); }}><ChevronLeft size={24} /></button>}
      <figure onClick={e => e.stopPropagation()}>
        <SafeImage src={item.src} alt={item.alt || ''} />
        <figcaption><span>{item.caption}</span>{items.length > 1 && <span className="muted">{index + 1} из {items.length}</span>}</figcaption>
      </figure>
      {items.length > 1 && <button className="lb-btn lb-next" aria-label="Следующее" onClick={e => { e.stopPropagation(); onStep(1); }}><ChevronRight size={24} /></button>}
    </div>, document.body);
}

/* ---------- курсор-огонёк ----------
   Только на устройствах с мышью. Ведётся через transform + rAF,
   рендерится порталом в body, чтобы position:fixed считался от окна. */
const HOT = 'a,button,label,summary,[role=button],.zoomable,.g-item';
const TEXT = 'input,textarea,select';
function Cursor() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current, root = document.documentElement;
    const fine = window.matchMedia?.('(hover:hover) and (pointer:fine)');
    if (!el || !fine) return;
    let on = false, raf = 0, x = -50, y = -50;
    const paint = () => { raf = 0; el.style.transform = `translate3d(${x}px,${y}px,0)`; };
    const move = e => { x = e.clientX; y = e.clientY; if (!on) return; el.classList.add('is-live'); if (!raf) raf = requestAnimationFrame(paint); };
    const over = e => { if (!on || !e.target.closest) return; const t = !!e.target.closest(TEXT); el.classList.toggle('is-text', t); el.classList.toggle('is-hot', !t && !!e.target.closest(HOT)); };
    const down = () => on && el.classList.add('is-down');
    const up = () => el.classList.remove('is-down');
    const leave = () => el.classList.remove('is-live');
    const sync = () => { on = fine.matches; root.classList.toggle('cursor-custom', on); if (!on) el.classList.remove('is-live'); };
    sync();
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerover', over, { passive: true });
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    document.addEventListener('mouseleave', leave);
    fine.addEventListener?.('change', sync);
    return () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerover', over);
      window.removeEventListener('pointerdown', down); window.removeEventListener('pointerup', up);
      document.removeEventListener('mouseleave', leave); fine.removeEventListener?.('change', sync);
      root.classList.remove('cursor-custom'); if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return createPortal(<div className="cursor" ref={ref} aria-hidden="true" />, document.body);
}

/* ---------- оболочка ---------- */
const NAV = [['/', 'Главная'], ['/dossier', 'Досье'], ['/history', 'История'], ['/relationships', 'Связи'], ['/gallery', 'Галерея']];
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight'];

export function Layout({ error, onRetry, character, children }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const [theme, setTheme] = useState(() => store.get('sv-theme', 'temple'));

  useEffect(() => { window.scrollTo(0, 0); setOpen(false); }, [pathname]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    store.set('sv-theme', theme);
  }, [theme]);
  useEffect(() => {
    const keys = [];
    const onKey = e => {
      if (isEditable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      // T — «Нар-Шаддаа»: неоновая тема родного мира.
      if (e.key === 't' || e.key === 'T' || e.key === 'е' || e.key === 'Е') { setTheme(t => (t === 'temple' ? 'narshaddaa' : 'temple')); return; }
      if (!KONAMI.includes(e.key)) { keys.length = 0; return; }
      keys.push(e.key);
      if (keys.slice(-KONAMI.length).join() === KONAMI.join()) { document.documentElement.classList.toggle('force-sense'); keys.length = 0; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return <div className="shell">
    <div className="sky" aria-hidden="true" />
    <Cursor />
    <a className="skip" href="#content">Перейти к содержанию</a>
    <header className="topbar">
      <Link className="brand" to="/" aria-label="Главная">
        <Blade className="brand-blade" />
        <span>{character?.name || 'Солан Вейр'}</span>
      </Link>
      <button className="menu-btn" aria-label={open ? 'Закрыть меню' : 'Открыть меню'} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={20} /> : <Menu size={20} />}</button>
      <nav className={open ? 'open' : ''} aria-label="Разделы">{NAV.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}</nav>
    </header>
    {error && <div className="notice" role="status"><span>Сервер архива недоступен, показана сохранённая копия. {error}</span>{onRetry && <button className="link-btn" onClick={onRetry}><RefreshCw size={14} /> Повторить</button>}</div>}
    <main id="content">{children}</main>
    <footer className="footer">
      <span>Архив Ордена джедаев, запись {ARCHIVE_ID}</span>
      <span className="footer-hint">Клавиша T — Нар-Шаддаа</span>
      <Link to="/admin">Служебный вход</Link>
    </footer>
  </div>;
}

export function Page({ title, lead, children, wide = false }) {
  useEffect(() => { document.title = `${title} — Солан Вейр`; }, [title]);
  return <section className={`page ${wide ? 'page-wide' : ''}`}>
    <header className="page-head">
      <h1>{title}</h1>
      {lead && <p className="page-lead">{lead}</p>}
    </header>
    {children}
  </section>;
}

export function Empty({ icon, children, action }) {
  return <div className="empty">{icon}<div>{children}</div>{action}</div>;
}
