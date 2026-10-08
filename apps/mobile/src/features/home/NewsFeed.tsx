import { useState } from 'react';
import { useNews } from '../../entities/news/feed';
import { Icon } from '../../shared/ui/Icon';
const formatDate = (date: string) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'Asia/Almaty' }).format(new Date(date));

export function NewsFeed() {
  const { data, loading, error, refresh } = useNews();
  const [filter, setFilter] = useState('Все'), [expanded, setExpanded] = useState(false);
  const categories = ['Все', ...new Set(data?.items.map(item => item.category) || [])];
  const selected = categories.includes(filter) ? filter : 'Все';
  const items = (data?.items || []).filter(item => selected === 'Все' || item.category === selected);
  return <section className="news-section" aria-labelledby="news-title">
    <div className="section-head"><h2 id="news-title">Новости</h2><a className="news-edition" href="https://eldala.kz/" target="_blank" rel="noopener noreferrer">ElDala.kz <Icon name="arrow" size={13} /></a></div>
    {data && <div className="news-filters" role="group" aria-label="Темы новостей">{categories.map(tag => <button key={tag} aria-pressed={selected === tag} onClick={() => { setFilter(tag); setExpanded(false); }}>{tag}</button>)}</div>}
    {data?.stale && <div className="news-status" role="status"><span>Сохранённая лента · {formatDate(data.updatedAt)}</span><button onClick={refresh} disabled={loading}>{loading ? 'Обновляем…' : 'Обновить'}</button></div>}
    {!data && <div className="news-empty" role="status"><Icon name="journal" size={26} /><p>{loading ? 'Загружаем новости ElDala…' : 'Не удалось загрузить новости. Попробуйте ещё раз, когда появится связь.'}</p>{error && !loading && <button className="secondary-button" onClick={refresh}>Повторить</button>}</div>}
    <div className="news-list">{(expanded ? items : items.slice(0, 4)).map(item => <a className="news-item" key={item.id} href={item.url} target="_blank" rel="noopener noreferrer">
      {item.image && <img className="news-photo" src={item.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />}
      <div className="news-content"><div className="news-meta"><span>{item.category}</span><time dateTime={item.date}>{formatDate(item.date)}</time></div><div className="news-title-row"><h3>{item.title}</h3></div><div className="news-source"><span>ElDala.kz</span><span>Читать на ElDala<Icon name="arrow" size={15} /></span></div></div>
    </a>)}</div>
    {items.length > 4 && <button className="news-more secondary-button" onClick={() => setExpanded(!expanded)}>{expanded ? 'Свернуть новости' : `Ещё новости · ${items.length - 4}`}</button>}
  </section>;
}
