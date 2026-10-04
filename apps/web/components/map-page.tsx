"use client";
import { useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Plus,
  MapPin,
  ArrowUpRight,
  Check,
  PenTool,
  X,
  Locate,
  History,
} from "lucide-react";
import { api, useApi, fmt } from "@/lib/api";
import { previewField } from "@/lib/field-preview";
import { selectField } from "@/lib/app-store";
import type { Field, Farm, Crop, Geometry, Weather, Soil } from "@/lib/types";
import { Button, ErrorBox, Loading, PageHead, SourceLabel } from "./ui";
const MapCanvas = dynamic(() => import("./map-canvas"), {
  ssr: false,
  loading: () => <div className="map-loading">Загрузка карты…</div>,
});
type PointInfo = {
  lat: number;
  lon: number;
  region: string;
  district: string;
  locality: string;
  weather?: Weather;
  soil?: Soil;
};
export function MapPage() {
  const fs = useApi<Field[]>("/fields"),
    farms = useApi<Farm[]>("/farms"),
    crops = useApi<Crop[]>("/crops");
  const [selected, setSelected] = useState(""),
    [editing, setEditing] = useState(false),
    [editField, setEditField] = useState<Field | null>(null),
    [geometry, setGeometry] = useState<Geometry | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [point, setPoint] = useState<PointInfo | null>(null),
    [pointBusy, setPointBusy] = useState(false),
    [radius, setRadius] = useState(20),
    [nearby, setNearby] = useState<{
      fields: Field[];
      listings: { id: string; title: string }[];
      area_ha: number;
    } | null>(null),
    [saved, setSaved] = useState("");
  const selectedField = fs.data?.find((f) => f.id === selected);
  const preview = useMemo(
    () => (geometry ? previewField(geometry) : null),
    [geometry],
  );
  const pointClick = useCallback(async (lat: number, lon: number) => {
    setSelected("");
    setPointBusy(true);
    setPoint(null);
    setNearby(null);
    setError("");
    try {
      setPoint(await api<PointInfo>(`/location?lat=${lat}&lon=${lon}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPointBusy(false);
    }
  }, []);
  function create() {
    setEditField(null);
    setGeometry(null);
    setEditing(true);
    setPoint(null);
    setSaved("");
  }
  function edit(f: Field) {
    setEditField(f);
    setGeometry(f.geometry);
    setEditing(true);
    setSaved("");
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!geometry) {
      setError("Сначала нарисуйте замкнутый контур поля");
      return;
    }
    setBusy(true);
    setError("");
    const d = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const body = {
        ...d,
        crop_id: d.crop_id || null,
        geometry,
        ...(editField ? { revision: editField.revision } : {}),
      };
      const f = await api<Field>(
        editField ? "/fields/" + editField.id : "/fields",
        { method: editField ? "PUT" : "POST", body: JSON.stringify(body) },
      );
      setEditing(false);
      setEditField(null);
      setSelected(f.id);
      setSaved(`«${f.name}» сохранено · ${fmt(f.area_ha)} га`);
      fs.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function details() {
    if (!point) return;
    setPointBusy(true);
    try {
      setPoint(
        await api<PointInfo>(
          `/location?lat=${point.lat}&lon=${point.lon}&details=true`,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPointBusy(false);
    }
  }
  async function searchRadius() {
    const p = point || selectedField;
    if (!p) return;
    setBusy(true);
    try {
      setNearby(
        await api(
          `/spatial/search?lat=${p.lat}&lon=${p.lon}&radius_km=${radius}`,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="map-page">
      <PageHead
        eyebrow="ВАША ЗЕМЛЯ НА КАРТЕ"
        title="Карта полей"
        description="От контура — к пониманию своей земли."
        action={
          !editing && (
            <Button onClick={create}>
              <Plus size={18} />
              Добавить поле
            </Button>
          )
        }
      />
      {fs.error && <ErrorBox message={fs.error} onRetry={fs.reload} />}
      <div className="map-layout">
        <div className="map-main">
          <MapCanvas
            fields={fs.data || []}
            selected={selected}
            onSelect={(id) => {
              setSelected(id);
              selectField(id);
              setPoint(null);
              setNearby(null);
            }}
            onPoint={pointClick}
            onStartDrawing={create}
            editing={editing}
            initialGeometry={editField?.geometry}
            onGeometry={setGeometry}
          />
          <div className="map-legend">
            <span>
              <i /> Мои поля
            </span>
            <span>
              <i className="ochre" /> Выбранное поле
            </span>
            <small>© OpenStreetMap · Границы: HDX / UNHCR 2023</small>
          </div>
        </div>
        <aside className="map-panel">
          {error && <ErrorBox message={error} />}{" "}
          {saved && (
            <div className="success" role="status">
              <Check size={18} />
              {saved}
            </div>
          )}
          {editing ? (
            <form onSubmit={save} className="stack">
              <div className="section-heading">
                <h2>{editField ? "Изменить поле" : "Новое поле"}</h2>
                <button
                  type="button"
                  aria-label="Отменить редактирование"
                  className="icon-button"
                  onClick={() => {
                    setEditing(false);
                    setEditField(null);
                    setError("");
                  }}
                >
                  <X size={18} />
                </button>
              </div>
              <p className="draw-help">
                <PenTool size={22} />
                Отметьте углы поля на карте. Нажмите первую точку, чтобы
                замкнуть контур. В режиме «Вершины» можно двигать контур и его
                точки.
              </p>
              {preview && (
                <div className="geometry-preview" role="status">
                  <strong>
                    ≈ {fmt(preview.areaHa)} га ·{" "}
                    {fmt(preview.perimeterM / 1000, 2)} км по контуру
                  </strong>
                  <small>
                    Предварительная оценка. Точная площадь появится после
                    сохранения.
                  </small>
                </div>
              )}
              <label>
                Название поля
                <input
                  key={editField?.id || "new"}
                  name="name"
                  placeholder="Например, Северное"
                  defaultValue={editField?.name}
                  minLength={2}
                  required
                />
              </label>
              <label>
                Хозяйство
                <select
                  name="farm_id"
                  defaultValue={editField?.farm_id}
                  disabled={!!editField}
                  required
                >
                  {farms.data
                    ?.filter((f) =>
                      ["owner", "admin", "agronomist"].includes(f.role),
                    )
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Культура
                <select name="crop_id" defaultValue={editField?.crop_id || ""}>
                  <option value="">Пока не определена</option>
                  {crops.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name_ru}
                    </option>
                  ))}
                </select>
              </label>
              <div className="note">
                Площадь, область и район рассчитаются при сохранении. Предыдущий
                контур останется в истории.
              </div>
              <Button busy={busy} type="submit" disabled={!geometry}>
                <Check size={18} />
                Сохранить поле
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setEditField(null);
                }}
              >
                Отменить
              </Button>
            </form>
          ) : point || pointBusy ? (
            <div className="stack">
              <div className="section-heading">
                <h2>Что здесь?</h2>
                <Locate size={20} />
              </div>
              {pointBusy && <Loading />}
              {point && (
                <>
                  <span className="coordinate-badge">
                    {point.lat.toFixed(5)}, {point.lon.toFixed(5)}
                  </span>
                  <h3>
                    {point.district || point.locality || "Название не найдено"}
                  </h3>
                  <p className="muted">
                    {point.region || "За пределами доступных границ"}
                  </p>
                  <Button
                    variant="secondary"
                    onClick={details}
                    busy={pointBusy}
                  >
                    Получить погоду и почву
                  </Button>
                  {point.weather && (
                    <>
                      <SourceLabel value={point.weather} />
                      <p>
                        {point.weather.current
                          ? `${point.weather.current.temperature_2m} °C · ветер ${point.weather.current.wind_speed_10m} км/ч`
                          : point.weather.message}
                      </p>
                    </>
                  )}
                  {point.soil && (
                    <>
                      <SourceLabel value={point.soil} />
                      <p>
                        pH {point.soil.topsoil?.phh2o ?? "—"} ·{" "}
                        {point.soil.texture || point.soil.message}
                      </p>
                    </>
                  )}
                </>
              )}
            </div>
          ) : selectedField ? (
            <div className="stack">
              <div className="eyebrow">{selectedField.farm_name}</div>
              <h2>{selectedField.name}</h2>
              <div className="field-area">
                {fmt(selectedField.area_ha)} <span>га</span>
              </div>
              <span className="tag">
                {selectedField.crop_name || "Культура не указана"}
              </span>
              <p>
                <MapPin size={16} /> {selectedField.region}
                <br />
                <span className="muted">{selectedField.district}</span>
              </p>
              <Link
                className="button primary"
                href={"/fields/" + selectedField.id}
              >
                Открыть профиль поля <ArrowUpRight size={18} />
              </Link>
              <Button variant="secondary" onClick={() => edit(selectedField)}>
                <PenTool size={17} />
                Редактировать контур
              </Button>
              <Link
                className="text-link"
                href={"/fields/" + selectedField.id + "#history"}
              >
                <History size={15} />
                История геометрии · v{selectedField.revision}
              </Link>
            </div>
          ) : (
            <>
              <div className="section-heading">
                <h2>Мои поля</h2>
                <span className="count">{fs.data?.length || 0}</span>
              </div>
              <p className="muted small">Выберите поле или нажмите на карту.</p>
              {fs.loading ? (
                <Loading />
              ) : fs.data?.length ? (
                fs.data.map((f) => (
                  <button
                    key={f.id}
                    className="field-list-item"
                    onClick={() => setSelected(f.id)}
                  >
                    <div className="field-mini">
                      <SproutShape />
                    </div>
                    <div>
                      <strong>{f.name}</strong>
                      <span>
                        {f.farm_name} · {f.crop_name || "Без культуры"}
                      </span>
                    </div>
                    <b>
                      {fmt(f.area_ha)}
                      <small>га</small>
                    </b>
                  </button>
                ))
              ) : (
                <div className="empty">
                  <MapPin />
                  <p>Добавьте первое поле, чтобы начать.</p>
                  <Button onClick={create}>Нарисовать поле</Button>
                </div>
              )}
            </>
          )}
          {!editing && (point || selectedField) && (
            <div className="radius-search">
              <h3>Рядом с этой точкой</h3>
              <div className="chips">
                {[5, 20, 50, 100].map((n) => (
                  <button
                    key={n}
                    onClick={() => setRadius(n)}
                    className={radius === n ? "active" : ""}
                  >
                    {n} км
                  </button>
                ))}
              </div>
              <label>
                Свой радиус, км
                <input
                  type="number"
                  value={radius}
                  min={0.1}
                  max={1000}
                  onChange={(e) => setRadius(Number(e.target.value))}
                />
              </label>
              <Button variant="secondary" onClick={searchRadius} busy={busy}>
                Найти рядом
              </Button>
              {nearby && (
                <div className="note">
                  Доступных полей: {nearby.fields.length} ·{" "}
                  {fmt(nearby.area_ha)} га. Объявлений: {nearby.listings.length}
                  .
                  {nearby.listings.slice(0, 4).map((l) => (
                    <Link
                      className="block-link"
                      key={l.id}
                      href={"/market/" + l.id}
                    >
                      {l.title} ↗
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
function SproutShape() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <path d="M8 9 32 6 35 30 12 35Z" />
      <path d="m11 12 20 15M12 20l17 12M17 10l16 9" />
    </svg>
  );
}
