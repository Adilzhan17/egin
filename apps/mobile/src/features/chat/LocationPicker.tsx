import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ChatIcon, ChatSheet, ErrorNotice } from './components';
import { validLocation, type ChatLocation } from './location-utils';
import './materials.css';

export function LocationPicker({ initialLocation, onSelect, onClose }: { initialLocation?: ChatLocation; onSelect: (location: ChatLocation) => void; onClose: () => void }) {
  const [point, setPoint] = useState<ChatLocation | null>(initialLocation && validLocation(initialLocation) ? initialLocation : null);
  const [label, setLabel] = useState(initialLocation?.label || ''), [locating, setLocating] = useState(false), [error, setError] = useState(''), [tilesFailed, setTilesFailed] = useState(false);
  const [latitude, setLatitude] = useState(initialLocation?.latitude.toString() || ''), [longitude, setLongitude] = useState(initialLocation?.longitude.toString() || '');
  const element = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null), marker = useRef<L.CircleMarker | null>(null), alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const initial = initialLocation && validLocation(initialLocation) ? initialLocation : null;
    const instance = L.map(element.current!, { zoomControl: false }).setView(initial ? [initial.latitude, initial.longitude] : [48.3, 67.1], initial ? 15 : 5);
    map.current = instance;
    L.control.zoom({ position: 'topright' }).addTo(instance);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>' }).addTo(instance);
    tiles.on('tileerror', () => { if (alive.current) setTilesFailed(true); });
    instance.on('click', (event: L.LeafletMouseEvent) => {
      const next = { latitude: event.latlng.lat, longitude: event.latlng.wrap().lng };
      if (!validLocation(next)) return;
      setPoint(next); setLatitude(next.latitude.toFixed(6)); setLongitude(next.longitude.toFixed(6)); setError('');
    });
    const observer = new ResizeObserver(() => instance.invalidateSize()); observer.observe(element.current!);
    return () => { alive.current = false; observer.disconnect(); instance.remove(); map.current = null; marker.current = null; };
  }, []);
  useEffect(() => {
    if (!point || !map.current) return;
    const coords: L.LatLngExpression = [point.latitude, point.longitude];
    if (marker.current) marker.current.setLatLng(coords);
    else marker.current = L.circleMarker(coords, { radius: 10, color: '#fff', weight: 3, fillColor: '#24513c', fillOpacity: 1 }).addTo(map.current);
  }, [point]);
  function selectCoordinates() {
    const next = { latitude: Number(latitude.replace(',', '.')), longitude: Number(longitude.replace(',', '.')) };
    if (!latitude.trim() || !longitude.trim() || !validLocation(next)) { setError('Введите широту от −90 до 90 и долготу от −180 до 180.'); return; }
    setPoint(next); setError(''); map.current?.setView([next.latitude, next.longitude], 16);
  }
  function locate() {
    if (!navigator.geolocation) { setError('Браузер не поддерживает геолокацию. Выберите точку на карте.'); return; }
    setError(''); setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      if (!alive.current) return;
      const next = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy };
      setLocating(false); setPoint(next); setLatitude(next.latitude.toFixed(6)); setLongitude(next.longitude.toFixed(6)); map.current?.setView([next.latitude, next.longitude], 16);
    }, () => { if (alive.current) { setLocating(false); setError('Не удалось получить местоположение. Разрешите геолокацию в браузере или выберите точку вручную.'); } }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  }
  return <ChatSheet title="Отправить геопозицию" onClose={onClose}><div className="chat-location-picker">
    <p>Коснитесь карты, чтобы выбрать точку. Местоположение отправится только после подтверждения.</p>
    <div className="chat-location-map" ref={element} role="region" aria-label="Карта выбора геопозиции" />
    {tilesFailed && <p className="chat-muted">Подложка карты недоступна. Можно указать координаты или своё местоположение.</p>}
    <button className="chat-action-row" type="button" disabled={locating} onClick={locate}><ChatIcon name="location" />{locating ? 'Определяем местоположение…' : 'Моё текущее местоположение'}</button>
    <details><summary>Указать координаты</summary><form className="chat-coordinate-form" onSubmit={event => { event.preventDefault(); selectCoordinates(); }}><label>Широта<input value={latitude} inputMode="decimal" maxLength={20} onChange={event => setLatitude(event.target.value)} placeholder="51.1694" /></label><label>Долгота<input value={longitude} inputMode="decimal" maxLength={20} onChange={event => setLongitude(event.target.value)} placeholder="71.4491" /></label><button type="submit" className="chat-primary">Показать</button></form></details>
    <label className="chat-location-label">Название места · необязательно<input value={label} maxLength={160} onChange={event => setLabel(event.target.value)} placeholder="Например, въезд на участок" /></label>
    <ErrorNotice message={error} />
    {point && <small className="chat-selected-coordinates">{point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}{point.accuracy !== undefined ? ` · точность ±${Math.round(point.accuracy)} м` : ''}</small>}
    <button type="button" className="chat-primary chat-location-submit" disabled={!point || locating} onClick={() => { if (point) onSelect({ ...point, label: label.trim() || undefined }); }}>Прикрепить геопозицию</button>
  </div></ChatSheet>;
}
