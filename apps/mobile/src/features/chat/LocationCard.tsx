import { useEffect, useRef, useState } from 'react';
import { ChatIcon } from './components';
import { locationLinks, locationTiles, validLocation, type ChatLocation } from './location-utils';
import './materials.css';

export function LocationCard({ location }: { location: ChatLocation }) {
  const preview = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(280), [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!preview.current) return;
    const observer = new ResizeObserver(entries => setWidth(Math.round(entries[0].contentRect.width)));
    observer.observe(preview.current); return () => observer.disconnect();
  }, []);
  useEffect(() => setFailed(false), [location.latitude, location.longitude]);
  if (!validLocation(location)) return <p className="chat-muted">Геопозиция недоступна</p>;
  const links = locationLinks(location);
  return <section className="chat-location-preview" aria-label="Геопозиция">
    <div className="chat-map-thumbnail" ref={preview}>
      <a href={links.map} target="_blank" rel="noopener noreferrer" aria-label="Открыть геопозицию на карте">
        {!failed && locationTiles(location, width).map(tile => <img key={tile.key} src={tile.url} alt="" loading="lazy" width="256" height="256" style={{ left: tile.left, top: tile.top }} onError={() => setFailed(true)} />)}
        <span className="chat-map-marker"><ChatIcon name="location" size={28} /></span>
        {failed && <span className="chat-map-unavailable">Открыть карту ↗</span>}
      </a>
      <a className="chat-map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a>
    </div>
    <div className="chat-location-description"><strong>{location.label || 'Отправленная геопозиция'}</strong><small>{location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}{location.accuracy !== undefined && Number.isFinite(location.accuracy) ? ` · точность ±${Math.round(location.accuracy)} м` : ''}</small></div>
    <div className="chat-location-actions"><a href={links.map} target="_blank" rel="noopener noreferrer">Открыть карту ↗</a><a href={links.directions} target="_blank" rel="noopener noreferrer">Маршрут ↗</a></div>
  </section>;
}
