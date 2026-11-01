import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useArchive } from './lib.js';
import { Layout, Page } from './ui.jsx';
import { Home, Dossier, History, Relationships, Gallery, NotFound } from './pages.jsx';
import './styles.css';

// Админ-панель — отдельный чанк: обычные посетители её не скачивают.
const Admin = lazy(() => import('./admin.jsx'));

function App() {
  const a = useArchive();
  const loading = <Page title="Архив"><p className="muted">Открываем запись…</p></Page>;
  return <Layout error={a.error} onRetry={a.reload} character={a.character}>
    {!a.ready ? loading : <Routes>
      <Route path="/" element={<Home c={a.character} chapters={a.chapters} relationships={a.relationships} gallery={a.gallery} />} />
      <Route path="/dossier" element={<Dossier c={a.character} />} />
      <Route path="/character" element={<Navigate to="/dossier" replace />} />
      <Route path="/history" element={<History chapters={a.chapters} />} />
      <Route path="/relationships" element={<Relationships c={a.character} relationships={a.relationships} links={a.links} />} />
      <Route path="/gallery" element={<Gallery c={a.character} gallery={a.gallery} />} />
      <Route path="/admin/*" element={<Suspense fallback={loading}><Admin archive={a} /></Suspense>} />
      <Route path="*" element={<NotFound />} />
    </Routes>}
  </Layout>;
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}><App /></BrowserRouter>,
);
