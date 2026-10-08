import { useEffect, useState } from 'react';

export interface NewsItem { id: string; title: string; category: string; date: string; image: string | null; url: string; source: string }
export interface NewsFeedData { items: NewsItem[]; updatedAt: string; stale: boolean }
const CACHE = 'egin.news.eldala.v1';
function valid(data: unknown): data is NewsFeedData {
  const d = data as NewsFeedData;
  return !!d && Number.isFinite(Date.parse(d.updatedAt)) && Array.isArray(d.items) && d.items.length > 0 && d.items.length <= 12 && d.items.every(item => typeof item.id === 'string' && typeof item.title === 'string' && typeof item.category === 'string' && Number.isFinite(Date.parse(item.date)) && /^https:\/\/eldala\.kz\/novosti\/[^/]+\/\d+-/.test(item.url) && (!item.image || /^https:\/\/eldala\.kz\/uploads\//.test(item.image)));
}
function readCache(): NewsFeedData | null {
  try { const data = JSON.parse(localStorage.getItem(CACHE) || 'null'); return valid(data) ? { ...data, stale: true } : null; } catch { return null; }
}
export function useNews() {
  const [data, setData] = useState(readCache), [loading, setLoading] = useState(true), [error, setError] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    const timer = window.setInterval(refresh, 15 * 60_000);
    window.addEventListener('online', refresh);
    return () => { clearInterval(timer); window.removeEventListener('online', refresh); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 18_000);
    let active = true;
    setLoading(true);
    fetch('/api/news', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('News unavailable');
      const next: unknown = await response.json();
      if (!valid(next)) throw new Error('Invalid news');
      if (!active) return;
      setData(next); setError(false);
      try { localStorage.setItem(CACHE, JSON.stringify(next)); } catch { /* Current feed remains usable when storage is full. */ }
    }).catch(() => { if (active) { setError(true); setData(previous => previous ? { ...previous, stale: true } : null); } }).finally(() => { clearTimeout(timer); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [revision]);
  return { data, loading, error, refresh: () => setRevision(value => value + 1) };
}
