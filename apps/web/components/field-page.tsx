"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Sparkles,
  MapPin,
  Layers,
  History,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { api, useApi, fmt, date, cropNames } from "@/lib/api";
import type {
  Field,
  Analysis,
  Weather,
  Soil,
  Climate,
  Geometry,
} from "@/lib/types";
import { Button, ErrorBox, Loading, PageHead, SourceLabel, Empty } from "./ui";
import { WeatherCard } from "./weather";
import { Tasks, FieldNotes } from "./activity";
const MapCanvas = dynamic(() => import("./map-canvas"), { ssr: false });
export function SoilCard({ value }: { value: Soil }) {
  const labels: Record<string, string> = {
    phh2o: "pH · кислотность",
    soc: "Органический углерод",
    clay: "Глина",
    silt: "Ил",
    sand: "Песок",
    bdod: "Плотность",
    cec: "Ёмкость обмена",
  };
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>
          <Layers size={20} /> Почвенный профиль
        </h2>
        <span className="tag">{value.depth || "0–30 cm"}</span>
      </div>
      <SourceLabel value={value} />
      {value.topsoil ? (
        <>
          <div className="soil-grid">
            {Object.entries(labels).map(([k, label]) => (
              <div key={k}>
                <span>{label}</span>
                <strong>
                  {fmt(value.topsoil?.[k], 2)}{" "}
                  <small>{k === "phh2o" ? "" : value.units?.[k]}</small>
                </strong>
                {value.uncertainty?.[k] && (
                  <small className="muted">
                    {Object.entries(value.uncertainty[k])
                      .map(([q, v]) => `${q}: ${fmt(v)}`)
                      .join(" · ")}
                  </small>
                )}
              </div>
            ))}
          </div>
          <p className="note">
            {value.texture} · Разрешение {value.resolution_m} м.{" "}
            {value.warning}{" "}
          </p>
        </>
      ) : (
        <p className="note">{value.message}</p>
      )}
    </section>
  );
}
export function FieldPage({ id }: { id: string }) {
  const f = useApi<Field>("/fields/" + id),
    run = useApi<Analysis>("/fields/" + id + "/analysis"),
    versions = useApi<
      {
        revision: number;
        area_ha: number;
        created_at: string;
        geometry: Geometry;
      }[]
    >("/fields/" + id + "/versions");
  const [analysis, setAnalysis] = useState<Analysis | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [viewVersion, setViewVersion] = useState<number | null>(null),
    [deletePrompt, setDeletePrompt] = useState(false);
  const router = useRouter();
  const current = analysis || run.data;
  const field = f.data;
  const ws = useApi<Weather>(field ? `/fields/${field.id}/weather` : null),
    ss = useApi<Soil>(field ? `/soil?lat=${field.lat}&lon=${field.lon}` : null);
  async function analyze() {
    setBusy(true);
    setError("");
    try {
      setAnalysis(
        await api<Analysis>("/fields/" + id + "/analyze", { method: "POST" }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api("/fields/" + id, { method: "DELETE" });
      router.push("/map");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  if (f.loading) return <Loading />;
  if (f.error) return <ErrorBox message={f.error} onRetry={f.reload} />;
  if (!field) return null;
  const shown = versions.data?.find((v) => v.revision === viewVersion);
  const mapField = shown ? { ...field, geometry: shown.geometry } : field;
  return (
    <div>
      <Link href="/map" className="back-link">
        <ArrowLeft size={16} />
        Все поля
      </Link>
      <PageHead
        eyebrow={field.farm_name + " / ПРОФИЛЬ ПОЛЯ"}
        title={field.name}
        description={[field.region, field.district].filter(Boolean).join(" · ")}
        action={
          <Button onClick={analyze} busy={busy}>
            <Sparkles size={18} />
            {busy ? "Анализируем источники…" : "Проанализировать поле"}
          </Button>
        }
      />
      {error && <ErrorBox message={error} />}
      <div className="field-summary">
        <div>
          <span>ПЛОЩАДЬ ПО POSTGIS</span>
          <strong>
            {fmt(field.area_ha)} <small>га</small>
          </strong>
        </div>
        <div>
          <span>КУЛЬТУРА</span>
          <strong>{field.crop_name || "Не выбрана"}</strong>
        </div>
        <div>
          <span>КООРДИНАТЫ ЦЕНТРОИДА</span>
          <strong className="mono">
            {field.lat.toFixed(4)}, {field.lon.toFixed(4)}
          </strong>
        </div>
        <div>
          <span>КОНТУР</span>
          <strong>Версия {field.revision}</strong>
        </div>
      </div>
      <div className="field-top-grid">
        <div className="field-map">
          <MapCanvas fields={[mapField]} selected={id} compact />
          <div className="field-map-caption">
            <MapPin size={15} />
            {shown ? `Контур версии ${shown.revision} · ` : ""}
            Границы: HDX / UNHCR {field.boundary_version}
          </div>
        </div>
        <section className="analysis-panel panel">
          <div className="eyebrow">EGIN INTELLIGENCE</div>
          <h2>Земля в деталях</h2>
          {busy && <Loading />}
          {current ? (
            <>
              <div className="demo-label">Демонстрационная ML-модель</div>
              {current.geometry_changed && (
                <p className="note">
                  Геометрия изменилась. Запустите новый анализ.
                </p>
              )}
              {current.recommendation.candidates ? (
                <div className="recommendations">
                  {current.recommendation.candidates.map((c, i) => (
                    <div key={c.crop}>
                      <span className="rank">0{i + 1}</span>
                      <div>
                        <strong>{cropNames[c.crop] || c.crop}</strong>
                        <div className="score-bar">
                          <i style={{ width: `${c.score * 100}%` }} />
                        </div>
                      </div>
                      <small>{fmt(c.score * 100, 0)}%</small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="note">{current.recommendation.warning}</p>
              )}
              <p className="small muted">
                Баллы — сходство с синтетическими профилями, не вероятность
                урожая и не точность рекомендаций.
              </p>
              <ul className="reasons">
                {current.recommendation.reasons?.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <div className={`risk-box ${current.risk.level}`}>
                <strong>
                  Погодные риски:{" "}
                  {
                    {
                      high: "высокие",
                      medium: "умеренные",
                      low: "пороги не превышены",
                      unknown: "нет данных",
                    }[current.risk.level]
                  }
                </strong>
                {current.risk.flags.map((x) => (
                  <p key={x.code}>{x.text}</p>
                ))}
              </div>
              <small className="muted">
                Расчёт: {date(current.created_at)}
              </small>
            </>
          ) : (
            <Empty title="Начните с анализа">
              <p>
                Соберём погоду, историю климата и почвенную оценку в один
                профиль.
              </p>
              <Button onClick={analyze} busy={busy}>
                <Sparkles size={16} />
                Запустить анализ
              </Button>
            </Empty>
          )}
          <Link className="text-link" href={"/assistant?field=" + id}>
            Обсудить поле с помощником <ExternalLink size={15} />
          </Link>
        </section>
      </div>
      <div className="stack">
        {ws.loading ? (
          <Loading />
        ) : ws.error ? (
          <ErrorBox message={ws.error} onRetry={ws.reload} />
        ) : (
          ws.data && <WeatherCard value={ws.data} />
        )}
        <div className="two-columns">
          {ss.loading ? (
            <Loading />
          ) : ss.error ? (
            <ErrorBox message={ss.error} onRetry={ss.reload} />
          ) : (
            ss.data && <SoilCard value={ss.data} />
          )}
          <ClimateCard value={current?.climate} />
        </div>
        <section className="panel" id="history">
          <div className="section-heading">
            <h2>
              <History size={20} />
              История контура
            </h2>
            <span className="tag">{versions.data?.length || 0} версий</span>
          </div>
          <p className="muted small">
            Выберите версию, чтобы увидеть её на карте. История не
            перезаписывается.
          </p>
          <div className="version-list">
            {versions.data?.map((v) => (
              <button
                className={viewVersion === v.revision ? "selected" : ""}
                key={v.revision}
                onClick={() => {
                  setViewVersion(v.revision);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                <span>Версия {v.revision}</span>
                <strong>{fmt(v.area_ha)} га</strong>
                <small>{date(v.created_at)}</small>
              </button>
            ))}
          </div>
        </section>
        <div className="danger-zone">
          {deletePrompt ? (
            <>
              <span>Удалить поле, анализы и историю контура?</span>
              <Button variant="danger" busy={busy} onClick={remove}>
                Удалить поле
              </Button>
              <Button variant="ghost" onClick={() => setDeletePrompt(false)}>
                Отмена
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setDeletePrompt(true)}>
              <Trash2 size={16} />
              Удалить поле
            </Button>
          )}
        </div>
      </div>
      <div className="two-columns">
        <Tasks fieldId={id} />
        <FieldNotes fieldId={id} />
      </div>
    </div>
  );
}
function ClimateCard({ value }: { value?: Climate }) {
  return (
    <section className="panel climate-panel">
      <div className="eyebrow">ИСТОРИЯ КЛИМАТА</div>
      <h2>Контекст сезона</h2>
      {value ? (
        <>
          <SourceLabel value={value} />
          {value.growing_temperature != null ? (
            <>
              <div className="climate-values">
                <div>
                  <strong>{fmt(value.growing_temperature)}°</strong>
                  <span>средняя температура</span>
                </div>
                <div>
                  <strong>
                    {fmt(value.growing_precipitation, 0)}
                    <small> мм</small>
                  </strong>
                  <span>осадки за сезон</span>
                </div>
              </div>
              <p className="note">{value.definition}</p>
              <p className="muted">NASA POWER · {value.period}</p>
            </>
          ) : (
            <p className="note">{value.message}</p>
          )}
        </>
      ) : (
        <p className="muted">
          Запустите анализ поля, чтобы получить исторические данные NASA POWER
          за три полных года.
        </p>
      )}
    </section>
  );
}
