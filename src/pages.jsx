import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BookOpen, Users, Images, Expand } from 'lucide-react';
import { ageText, splitName, layoutNodes, groupMeta, GROUPS, countText } from './lib.js';
import { Page, Frame, SafeImage, Rich, RelationTags, Blade, Lightbox, Empty } from './ui.jsx';

const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7 };
// «III — Соресу» → { numeral: 'III', name: 'Соресу' }
const splitForm = title => {
  const m = /^\s*([IVX]+)\s*[—–-]\s*(.+)$/.exec(String(title || ''));
  return m && ROMAN[m[1]] ? { numeral: m[1], name: m[2] } : { numeral: '', name: title };
};

function Portrait({ c, onOpen, className = '' }) {
  const [first, last] = splitName(c.name);
  return <Frame holo={c.holo_effect !== false} className={`portrait ${c.image_url ? 'zoomable' : ''} ${className}`} onClick={c.image_url ? onOpen : undefined}>
    {c.image_url
      ? <SafeImage src={c.image_url} alt={`Портрет: ${c.name}`} />
      : <div className="portrait-empty"><span>{first[0]}{last[0]}</span><small>Портрет ещё не загружен</small></div>}
    <i className="portrait-veil" aria-hidden="true" />
    {c.image_url && <span className="zoom-hint"><Expand size={14} /> Открыть</span>}
  </Frame>;
}

function NoRecord() {
  return <Page title="Запись не найдена" lead="В базе пока нет персонажа. Добавьте его в админ-панели.">
    <Empty action={<Link className="btn" to="/admin">Открыть админ-панель</Link>} />
  </Page>;
}

/* ============================================================
   ГЛАВНАЯ
   ============================================================ */
export function Home({ c, chapters = [], relationships = [], gallery = [] }) {
  const [lb, setLb] = useState(false);
  useEffect(() => { document.title = c ? `${c.name} — архив Ордена джедаев` : 'Архив Ордена джедаев'; }, [c]);
  if (!c) return <NoRecord />;
  const [first, last] = splitName(c.name);
  const published = chapters.filter(x => x.published !== false);
  const facts = [['Раса', c.species], ['Возраст', ageText(c.age)], ['Родная планета', c.homeworld], ['Специализация', c.specialization], ['Световой меч', c.saber_color], ['Позывной у клонов', c.callsign]].filter(([, v]) => v);

  return <>
    <section className="hero">
      <div className="hero-text">
        <Blade className="hero-blade" />
        <p className="hero-rank">{[c.rank_title, c.affiliation].filter(Boolean).join(', ')}</p>
        <h1 className="hero-name"><span>{first}</span>{last && <span>{last}</span>}</h1>
        {(c.name_latin || c.former_name) && <p className="hero-alias">
          {c.name_latin && <span lang="en">{c.name_latin}</span>}
          {c.former_name && <span>прежде <s>{c.former_name}</s></span>}
        </p>}
        {c.summary && <p className="hero-lead">{c.summary}</p>}
        <dl className="facts">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        <div className="actions">
          <Link className="btn" to="/dossier">Открыть досье</Link>
          {published.length > 0 && <Link className="btn btn-quiet" to="/history">Читать историю</Link>}
        </div>
      </div>
      <Portrait c={c} className="hero-portrait" onOpen={() => setLb(true)} />
    </section>

    {c.epigraph && <blockquote className="epigraph"><p>{c.epigraph}</p></blockquote>}

    <section className="home-grid">
      {published.length > 0 && <div className="home-block">
        <h2>История</h2>
        <ol className="chapter-index">{published.slice(0, 6).map((x, i) => <li key={x.id}>
          <Link to={`/history?chapter=${x.id}`}><b>{x.chapter_number ?? i + 1}</b><span>{x.title}</span></Link>
        </li>)}</ol>
      </div>}
      {Array.isArray(c.forms) && c.forms.length > 0 && <div className="home-block">
        <h2>Стиль боя</h2>
        <ul className="form-list">{c.forms.map(f => { const s = splitForm(f.title); return <li key={f.title}><b>{s.numeral}</b><span><strong>{s.name}</strong>{f.text}</span></li>; })}</ul>
        <Link className="text-link" to="/dossier#combat">Подробнее о технике</Link>
      </div>}
    </section>

    <nav className="home-links" aria-label="Другие разделы">
      <Link to="/relationships"><Users size={18} /><span><b>Связи</b><small>{relationships.length ? countText(relationships.length, ['запись', 'записи', 'записей']) : 'Пока без записей'}</small></span></Link>
      <Link to="/gallery"><Images size={18} /><span><b>Галерея</b><small>{gallery.length ? countText(gallery.length, ['снимок', 'снимка', 'снимков']) : 'Пока без снимков'}</small></span></Link>
      <Link to="/history"><BookOpen size={18} /><span><b>Хроника</b><small>{countText(published.length, ['глава', 'главы', 'глав'])}</small></span></Link>
    </nav>
    {lb && <Lightbox items={[{ src: c.image_url, alt: c.name, caption: c.name }]} index={0} onClose={() => setLb(false)} onStep={() => {}} />}
  </>;
}

/* ============================================================
   ДОСЬЕ
   ============================================================ */
function PairGrid({ items = [], className = '' }) {
  if (!items.length) return null;
  return <dl className={`pairs ${className}`}>{items.map((x, i) => <div key={i}><dt>{x.title}</dt><dd>{x.text}</dd></div>)}</dl>;
}

export function Dossier({ c }) {
  const [lb, setLb] = useState(false);
  if (!c) return <NoRecord />;
  const rows = [
    ['Полное имя', c.name_latin ? `${c.name} (${c.name_latin})` : c.name], ['Прежнее имя', c.former_name], ['Раса', c.species], ['Пол', c.gender],
    ['Возраст', ageText(c.age)], ['Родная планета', c.homeworld], ['Принадлежность', c.affiliation], ['Звание', c.rank_title],
    ['Специализация', c.specialization], ['Мировоззрение', c.alignment], ['Цвет глаз', c.eye_color], ['Цвет светового меча', c.saber_color],
    ['Прозвище среди клонов', c.callsign],
  ].filter(([, v]) => v);
  const sections = [['appearance', 'Внешность'], ['character', 'Характер'], ['combat', 'Боевой стиль'], ['details', 'Взгляды и привычки']];

  return <Page title="Досье" lead={c.summary} wide>
    <div className="dossier">
      <aside className="dossier-side">
        <Portrait c={c} onOpen={() => setLb(true)} />
        <dl className="record">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      </aside>
      <article className="dossier-body">
        <nav className="toc" aria-label="Разделы досье">{sections.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>

        <section id="appearance" className="d-section">
          <h2>Внешность</h2>
          <Rich text={c.appearance} />
        </section>

        <section id="character" className="d-section">
          <h2>Характер</h2>
          <Rich text={c.personality} empty="" />
          <PairGrid items={c.traits} className="traits" />
          {c.flaw && <div className="flaw"><h3>Главный недостаток</h3><p>{c.flaw}</p></div>}
        </section>

        <section id="combat" className="d-section">
          <h2>Боевой стиль</h2>
          <Rich text={c.combat_style} empty="" />
          {Array.isArray(c.forms) && c.forms.length > 0 && <ol className="forms">{c.forms.map(f => { const s = splitForm(f.title); return <li key={f.title}>
            <span className="form-num" aria-hidden="true">{s.numeral}</span>
            <div><h3>{s.numeral ? `Форма ${s.numeral}. ${s.name}` : s.name}</h3><p>{f.text}</p></div>
          </li>; })}</ol>}
          {Array.isArray(c.saber) && c.saber.length > 0 && <div className="saber-card">
            <Blade className="saber-card-blade" />
            <div><h3>Световой меч</h3><PairGrid items={c.saber} className="saber-spec" /></div>
          </div>}
        </section>

        {Array.isArray(c.details) && c.details.length > 0 && <section id="details" className="d-section">
          <h2>Взгляды и привычки</h2>
          <PairGrid items={c.details} className="details" />
        </section>}
      </article>
    </div>
    {lb && c.image_url && <Lightbox items={[{ src: c.image_url, alt: c.name, caption: c.name }]} index={0} onClose={() => setLb(false)} onStep={() => {}} />}
  </Page>;
}

/* ============================================================
   ИСТОРИЯ
   ============================================================ */
export function History({ chapters = [] }) {
  const location = useLocation();
  const [lb, setLb] = useState(-1);
  const list = useMemo(() => chapters.filter(x => x.published !== false).sort((a, b) => (a.chapter_number ?? 0) - (b.chapter_number ?? 0)), [chapters]);
  const covers = list.filter(x => x.cover_image);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('chapter');
    if (id) requestAnimationFrame(() => document.getElementById(`chapter-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [location.search, list.length]);

  return <Page title="История" lead="Хроника жизни Солана: от улиц Нар-Шаддаа до полей Войн клонов.">
    {!list.length
      ? <Empty icon={<BookOpen />}>Опубликованных глав пока нет.</Empty>
      : <div className="chronicle">
        {list.map((x, i) => <article id={`chapter-${x.id}`} className="chronicle-item" key={x.id}>
          <span className="chronicle-num" aria-hidden="true">{x.chapter_number ?? i + 1}</span>
          <div className="chronicle-body">
            <p className="chronicle-label">Глава {x.chapter_number ?? i + 1}</p>
            <h2>{x.title}</h2>
            {x.cover_image && <Frame holo={x.holo_effect !== false} className="cover zoomable" onClick={() => setLb(covers.findIndex(cv => cv.id === x.id))}>
              <SafeImage src={x.cover_image} alt={x.title} loading="lazy" />
            </Frame>}
            <div className="prose"><Rich text={x.content} /></div>
          </div>
        </article>)}
      </div>}
    {lb >= 0 && <Lightbox items={covers.map(x => ({ src: x.cover_image, alt: x.title, caption: `Глава ${x.chapter_number}. ${x.title}` }))} index={lb} onClose={() => setLb(-1)} onStep={d => setLb(i => (i + d + covers.length) % covers.length)} />}
  </Page>;
}

/* ============================================================
   СВЯЗИ
   ============================================================ */
export function NetworkMap({ nodes, links, centerName, children, stageRef, onNodePointerDown, dimmed }) {
  const byId = new Map(nodes.map(n => [String(n.id), n]));
  return <div className="map-stage" ref={stageRef}>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <circle cx="50" cy="50" r="38" className="map-ring" />
      <circle cx="50" cy="50" r="22" className="map-ring faint" />
      {nodes.map(n => <line key={`c${n.id}`} x1="50" y1="50" x2={n.x} y2={n.y} className="map-link core" />)}
      {links.map(l => { const a = byId.get(String(l.from_id)), b = byId.get(String(l.to_id)); return a && b ? <line key={`l${l.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`map-link peer ${dimmed?.(a, b) ? 'is-dim' : ''}`} /> : null; })}
    </svg>
    <div className="map-center"><Blade className="map-blade" /><b>{splitName(centerName)[0] || 'Солан'}</b></div>
    {nodes.map(n => <div key={n.id} className={`map-node ${onNodePointerDown ? 'is-draggable' : ''}`} style={{ left: `${n.x}%`, top: `${n.y}%`, '--g': groupMeta(n.group)[2] }}
      onPointerDown={onNodePointerDown ? e => onNodePointerDown(e, n.id) : undefined}>
      <span>{String(n.name || '?')[0]}</span><b>{n.name}</b>
    </div>)}
    {children}
  </div>;
}

export function Relationships({ c, relationships = [], links = [] }) {
  const nodes = useMemo(() => layoutNodes(relationships), [relationships]);
  const groups = GROUPS.filter(([k]) => nodes.some(n => n.group === k));
  return <Page title="Связи" lead="Люди, с которыми Солан делил задания, Храм и поле боя." wide>
    {!relationships.length
      ? <Empty icon={<Users />}>Записей о связях пока нет. Их можно добавить в админ-панели.</Empty>
      : <>
        <div className="map-wrap">
          <NetworkMap nodes={nodes} links={links} centerName={c?.name} />
          <ul className="map-legend">{groups.map(([k, label, col]) => <li key={k} style={{ '--g': col }}>{label}</li>)}{links.length > 0 && <li className="legend-peer">Связи между персонажами</li>}</ul>
        </div>
        {groups.map(([k, label]) => <section key={k} className="rel-group">
          <h2>{label}</h2>
          <div className="rel-list">{relationships.filter(x => groupMeta(x.group_tag)[0] === k).map(x => <article className="rel" key={x.id}>
            {x.image_url
              ? <Frame holo={x.holo_effect !== false} className="rel-photo"><SafeImage src={x.image_url} alt={x.name} loading="lazy" /></Frame>
              : <span className="rel-initial" aria-hidden="true">{String(x.name || '?')[0]}</span>}
            <div>
              <h3>{x.name}</h3>
              {x.role && <p className="rel-role">{x.role}</p>}
              <RelationTags value={x.relation} />
              {x.quote && <blockquote>«{x.quote}»</blockquote>}
            </div>
          </article>)}</div>
        </section>)}
      </>}
  </Page>;
}

/* ============================================================
   ГАЛЕРЕЯ
   ============================================================ */
const CATEGORIES = [['all', 'Все'], ['portrait', 'Портреты'], ['field', 'С заданий'], ['archive', 'Архив']];
export function Gallery({ c, gallery = [] }) {
  const [lb, setLb] = useState(-1);
  const [filter, setFilter] = useState('all');
  const raw = gallery.length ? gallery : (c?.image_url ? [{ id: 'main', image_url: c.image_url, title: 'Портрет', category: 'portrait', holo_effect: c.holo_effect }] : []);
  const present = CATEGORIES.filter(([k]) => k === 'all' || raw.some(x => (x.category || 'archive') === k));
  const items = filter === 'all' ? raw : raw.filter(x => (x.category || 'archive') === filter);
  return <Page title="Галерея" wide>
    {!raw.length
      ? <Empty icon={<Images />}>Снимков пока нет. Загрузите их в админ-панели.</Empty>
      : <>
        {present.length > 2 && <div className="filters" role="group" aria-label="Фильтр">{present.map(([k, l]) => <button key={k} className={filter === k ? 'is-active' : ''} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}</div>}
        <div className="gallery">{items.map((x, i) => <figure key={x.id} className="g-item" onClick={() => setLb(i)}>
          <Frame holo={x.holo_effect !== false}><SafeImage src={x.image_url} alt={x.caption || x.title || 'Снимок'} loading="lazy" /></Frame>
          {(x.title || x.caption) && <figcaption>{x.title && <b>{x.title}</b>}{x.caption && <span>{x.caption}</span>}</figcaption>}
        </figure>)}</div>
      </>}
    {lb >= 0 && <Lightbox items={items.map(x => ({ src: x.image_url, alt: x.caption || x.title, caption: [x.title, x.caption].filter(Boolean).join('. ') }))} index={lb} onClose={() => setLb(-1)} onStep={d => setLb(i => (i + d + items.length) % items.length)} />}
  </Page>;
}

export function NotFound() {
  return <Page title="Страница не найдена" lead="Такого раздела в архиве нет — возможно, ссылка устарела.">
    <Empty action={<Link className="btn" to="/">На главную</Link>} />
  </Page>;
}

