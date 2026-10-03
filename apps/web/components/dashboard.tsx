"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import {
  ArrowUpRight,
  Plus,
  MapPinned,
  Sparkles,
  ArrowRight,
  Tractor,
  Bell,
} from "lucide-react";
import { useApi, fmt, cropNames, date } from "@/lib/api";
import type {
  Dashboard as Data,
  User,
  Field,
  Weather,
  Listing,
} from "@/lib/types";
import { Loading, ErrorBox, PageHead } from "./ui";
import { WeatherCard } from "./weather";
import { Tasks } from "./activity";
import { ListingVisual } from "./market";
const MapCanvas = dynamic(() => import("./map-canvas"), { ssr: false });
export function Dashboard({ user }: { user: User }) {
  const d = useApi<Data>("/dashboard"),
    fields = useApi<Field[]>("/fields"),
    market = useApi<Listing[]>("/listings");
  const [selected, setSelected] = useState("");
  useEffect(() => {
    setSelected(localStorage.getItem("egin-current-field") || "");
  }, []);
  const field = fields.data?.find((f) => f.id === selected) || fields.data?.[0];
  const weather = useApi<Weather>(
    field ? "/fields/" + field.id + "/weather" : null,
  );
  const analysis = d.data?.analyses.find((a) => a.field_id === field?.id);
  const warnings = analysis?.result.risk.flags || [];
  if (d.loading && !d.data) return <Loading />;
  if (d.error) return <ErrorBox message={d.error} onRetry={d.reload} />;
  if (!d.data) return null;
  return (
    <div className="farm-home">
      <PageHead
        eyebrow="ВАШ СЕЗОН ПОД КОНТРОЛЕМ"
        title={`Сәлем, ${user.name.split(" ")[0]}`}
        description="Что происходит на вашей земле сегодня."
        action={
          <Link
            href="/map"
            aria-label="Добавить поле"
            className="button secondary"
          >
            <Plus size={17} />
            <span>Добавить поле</span>
          </Link>
        }
      />
      <div className="home-top-grid">
        <section className="field-hero">
          <div className="hero-map">
            {field ? (
              <MapCanvas fields={[field]} selected={field.id} compact />
            ) : (
              <div className="empty">
                <MapPinned size={44} />
              </div>
            )}
          </div>
          <div className="hero-field-top">
            <span className="map-badge">
              <span className="status-dot" />
              Мои поля
            </span>
            <Link
              href="/map"
              className="round-link"
              aria-label="Открыть карту полей"
            >
              <ArrowUpRight size={23} />
            </Link>
          </div>
          <div className="hero-field-caption">
            <label htmlFor="current-field">ТЕКУЩЕЕ ПОЛЕ</label>
            <select
              id="current-field"
              value={field?.id || ""}
              onChange={(e) => {
                setSelected(e.target.value);
                localStorage.setItem("egin-current-field", e.target.value);
              }}
            >
              {fields.data?.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <p>
              {field
                ? `${fmt(field.area_ha)} га · ${field.crop_name || "Культура не указана"}`
                : "Добавьте первое поле на карте"}
            </p>
            {field && (
              <Link href={"/fields/" + field.id}>
                Профиль поля <ArrowRight size={17} />
              </Link>
            )}
          </div>
        </section>
        <div className="home-current">
          {weather.loading ? (
            <div className="panel">
              <Loading />
            </div>
          ) : weather.error ? (
            <ErrorBox message={weather.error} onRetry={weather.reload} />
          ) : (
            weather.data && (
              <WeatherCard
                key={field?.id}
                value={weather.data}
                fieldName={field?.name}
                compact
              />
            )
          )}
          <Link
            className="ai-insight"
            href={"/assistant" + (field ? "?field=" + field.id : "")}
          >
            <span className="insight-icon">
              <Sparkles size={23} />
            </span>
            <div>
              <span className="eyebrow">EGIN AI · ВАШЕ ПОЛЕ</span>
              <h2>
                {warnings.length
                  ? "На что обратить внимание"
                  : "Какие решения нужны сегодня?"}
              </h2>
              <p>
                {warnings[0]?.text ||
                  "Погода, почва и подходящие культуры — спросите помощника о выбранном поле."}
              </p>
            </div>
            <ArrowUpRight size={22} />
          </Link>
        </div>
      </div>
      <div className="home-summary">
        <span>
          <strong>{d.data.fields_count}</strong>полей
        </span>
        <span>
          <strong>{fmt(d.data.area_ha)}</strong>га в хозяйстве
        </span>
        <Link href="/community">
          <strong>{d.data.unread_messages}</strong>новых сообщений
        </Link>
      </div>
      <div className="home-work-grid">
        <section className="panel home-fields">
          <div className="section-heading">
            <h2>Ваши поля</h2>
            <Link className="text-link" href="/map">
              Все на карте <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="field-card-grid">
            {fields.data?.slice(0, 6).map((f, i) => (
              <Link href={"/fields/" + f.id} className="field-card" key={f.id}>
                <div className={"field-card-visual tone-" + (i % 3)}>
                  <FieldShape field={f} />
                  <span>{fmt(f.area_ha)} га</span>
                </div>
                <div className="field-card-title">
                  <div>
                    <strong>{f.name}</strong>
                    <small>
                      {f.crop_name || f.region || "Культура не указана"}
                    </small>
                  </div>
                  <span className="field-card-arrow">
                    <ArrowUpRight size={19} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
          {!fields.data?.length && (
            <div className="empty">
              <MapPinned />
              <h3>Добавьте первое поле</h3>
              <Link href="/map" className="button primary">
                Нарисовать контур
              </Link>
            </div>
          )}
        </section>
        <Tasks fieldId={field?.id} />
      </div>
      <div className="two-columns">
        <section className="panel">
          <div className="section-heading">
            <h2>
              <Sparkles size={20} />
              Подходящие культуры
            </h2>
            {field && (
              <Link href={"/fields/" + field.id} className="text-link">
                Анализ <ArrowUpRight size={16} />
              </Link>
            )}
          </div>
          {analysis?.result.recommendation.candidates?.length ? (
            <>
              <p className="muted small">
                Экспериментальная ML-рекомендация · {field?.name}
              </p>
              {analysis.result.recommendation.candidates
                .slice(0, 3)
                .map((c) => (
                  <div className="home-crop" key={c.crop}>
                    <span>{cropNames[c.crop] || c.crop}</span>
                    <div className="chart-track">
                      <i style={{ width: c.score * 100 + "%" }} />
                    </div>
                    <strong>{fmt(c.score * 100, 0)}%</strong>
                  </div>
                ))}
              <p className="footnote">
                Баллы модели, не вероятность урожая. {date(analysis.created_at)}
              </p>
            </>
          ) : (
            <p className="muted">
              Запустите анализ в профиле поля, чтобы сопоставить почву и климат
              с культурами.
            </p>
          )}
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>
              <Bell size={20} />
              Сигналы поля
            </h2>
          </div>
          {warnings.length ? (
            warnings.map((w, i) => (
              <div className="season-warning" key={i}>
                <span className={"signal-dot " + w.level} />
                <p>{w.text}</p>
              </div>
            ))
          ) : (
            <p className="muted">
              {analysis
                ? "В последнем анализе погодные пороги не превышены."
                : "Предупреждения появятся после расчёта анализа поля."}
            </p>
          )}
          <Link
            className="text-link"
            href={"/assistant" + (field ? "?field=" + field.id : "")}
          >
            Обсудить с AI <ArrowRight size={16} />
          </Link>
        </section>
      </div>
      <section className="home-market">
        <div className="section-heading">
          <h2>
            <Tractor size={22} />
            Для вашего хозяйства
          </h2>
          <Link href="/market" className="text-link">
            На рынок <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="market-preview-grid">
          {market.data?.slice(0, 3).map((l) => (
            <Link
              className="market-preview"
              href={"/market/" + l.id}
              key={l.id}
            >
              <div className="preview-image">
                <ListingVisual item={l} />
              </div>
              <div>
                {l.is_demo && (
                  <small className="demo-tag">Демо-объявление</small>
                )}
                <h3>{l.title}</h3>
                <p>{l.region}</p>
                <strong>
                  {fmt(l.price, 0)} <small>{l.unit}</small>
                </strong>
              </div>
              <ArrowUpRight size={18} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
export function FieldShape({ field }: { field: Field }) {
  const coords =
    field.geometry.type === "Polygon"
      ? field.geometry.coordinates[0]
      : field.geometry.coordinates[0][0];
  const xs = coords.map((p) => p[0]),
    ys = coords.map((p) => p[1]);
  const minx = Math.min(...xs),
    miny = Math.min(...ys),
    w = Math.max(...xs) - minx || 1,
    h = Math.max(...ys) - miny || 1;
  return (
    <svg viewBox="0 0 80 65" aria-hidden="true">
      <polygon
        points={coords
          .map(
            (p) =>
              `${12 + ((p[0] - minx) / w) * 56},${53 - ((p[1] - miny) / h) * 41}`,
          )
          .join(" ")}
      />
    </svg>
  );
}
