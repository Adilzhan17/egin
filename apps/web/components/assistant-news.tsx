"use client";
import { useState } from "react";
import { ArrowUpRight, Newspaper, SlidersHorizontal, Check } from "lucide-react";
import { api, useApi, date } from "@/lib/api";
import type { News, Region } from "@/lib/types";
import { Button, Loading, ErrorBox, PageHead } from "./ui";
export function NewsPage() {
  const news = useApi<News[]>("/news"),
    regions = useApi<Region[]>("/admin/regions"),
    interests = useApi<{ kind: string; value: string }[]>("/interests");
  const [settings, setSettings] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const d = new FormData(e.currentTarget);
    const items = [
      ...d.getAll("topic").map((value) => ({ kind: "topic", value })),
      ...d.getAll("crop").map((value) => ({ kind: "crop", value })),
      ...(d.get("region") ? [{ kind: "region", value: d.get("region") }] : []),
    ];
    try {
      await api("/interests", {
        method: "PUT",
        body: JSON.stringify({ interests: items }),
      });
      interests.reload();
      news.reload();
      setSettings(false);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <PageHead
        eyebrow="КОНТЕКСТ ДЛЯ ВАШИХ РЕШЕНИЙ"
        title="Лента хозяйства"
        description="Материалы по вашему региону, культурам и интересам."
        action={
          <Button variant="secondary" onClick={() => setSettings(!settings)}>
            <SlidersHorizontal size={17} />
            Мои интересы
          </Button>
        }
      />
      {error && <ErrorBox message={error} />}{" "}
      {saved && (
        <div className="success" role="status">
          <Check size={17} />
          Интересы сохранены
        </div>
      )}
      {settings && (
        <form onSubmit={save} className="panel interests">
          <h2>Настроить ленту</h2>
          <label>
            Ваш регион
            <select
              name="region"
              defaultValue={
                interests.data?.find((i) => i.kind === "region")?.value || ""
              }
            >
              <option value="">Все регионы</option>
              {regions.data?.map((r) => (
                <option key={r.id}>{r.name_ru}</option>
              ))}
            </select>
          </label>
          <div className="interest-options">
            {[
              { name: "Погода", value: "weather", kind: "topic" },
              { name: "Агрономия", value: "agronomy", kind: "topic" },
              { name: "Почва", value: "soil", kind: "topic" },
              { name: "Техника", value: "machinery", kind: "topic" },
              { name: "Рынок", value: "market", kind: "topic" },
              { name: "Пшеница", value: "wheat", kind: "crop" },
              { name: "Ячмень", value: "barley", kind: "crop" },
              { name: "Подсолнечник", value: "sunflower", kind: "crop" },
            ].map((i) => (
              <label className="checkbox-label" key={i.value}>
                <input
                  type="checkbox"
                  name={i.kind}
                  value={i.value}
                  defaultChecked={interests.data?.some(
                    (x) => x.kind === i.kind && x.value === i.value,
                  )}
                />
                {i.name}
              </label>
            ))}
          </div>
          <Button type="submit" busy={busy}>
            Сохранить интересы
          </Button>
        </form>
      )}
      <div className="news-note">
        <Newspaper size={20} />
        <p>
          В локальной базе есть демонстрационные материалы. Они отмечены «Демо»
          и не выдаются за текущие новости.
        </p>
      </div>
      {news.loading ? (
        <Loading />
      ) : news.error ? (
        <ErrorBox message={news.error} onRetry={news.reload} />
      ) : (
        <div className="news-grid">
          {news.data?.map((n, i) => (
            <article className={"news-card news-tone-" + (i % 3)} key={n.id}>
              <div className="news-card-top">
                <span className="eyebrow">
                  {n.is_demo ? "ДЕМО-МАТЕРИАЛ" : "НОВОСТЬ"}
                </span>
                <Newspaper size={28} strokeWidth={1} />
              </div>
              <div className="news-content">
                <div className="row">
                  {n.tags.map((t) => (
                    <span className="tag" key={t}>
                      {{
                        weather: "Погода",
                        agronomy: "Агрономия",
                        soil: "Почва",
                        market: "Рынок",
                        machinery: "Техника",
                      }[t] || t}
                    </span>
                  ))}
                </div>
                <h2>{n.title}</h2>
                <p>{n.summary}</p>
                <div className="news-footer">
                  <span>
                    {n.source}
                    <small>
                      {n.published_at
                        ? date(n.published_at)
                        : "Учебный материал · без даты события"}
                    </small>
                  </span>
                  {n.external_url && /^https?:\/\//.test(n.external_url) && (
                    <a
                      href={n.external_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Открыть источник"
                    >
                      <ArrowUpRight size={20} />
                    </a>
                  )}
                </div>
                {n.relevance > 0 && (
                  <small className="relevance">
                    <Check size={12} />
                    Соответствует вашим интересам
                  </small>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
