"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Sparkles,
  Send,
  Square,
  RotateCcw,
  ArrowUpRight,
  Check,
  MapPin,
} from "lucide-react";
import { useApi, fmt } from "@/lib/api";
import type { Field } from "@/lib/types";
import { Button, ErrorBox, Loading, PageHead } from "./ui";
type Tool = {
  name: string;
  origin?: string;
  result?: Record<string, unknown> | Record<string, unknown>[];
};
type Turn = {
  id: number;
  question: string;
  answer: { text: string; tools: (Tool | string)[] };
  status?: string;
  model?: string;
};
export type Provider = {
  provider: string | null;
  model: string;
  configured: boolean;
  available: boolean;
  message: string;
};
const labels: Record<string, string> = {
  get_field_weather: "Погода поля",
  get_field_soil: "Почвенный профиль",
  get_field_analysis: "Анализ поля",
  run_field_analysis: "Новый анализ",
  get_fields: "Ваши поля",
  get_field: "Данные поля",
  search_marketplace: "Рынок",
  search_machinery: "Аренда техники",
  search_jobs: "Вакансии",
  get_field_climate: "История климата",
  get_notifications: "Задачи и уведомления",
  get_region_news: "Новости",
  get_user_farms: "Хозяйства",
  get_current_user: "Профиль",
};
function ToolCard({ tool }: { tool: Tool | string }) {
  if (typeof tool === "string")
    return <span className="tag">{labels[tool] || tool}</span>;
  const r = tool.result;
  return (
    <div className="ai-tool-card">
      <span className="tool-label">
        <Check size={14} />
        {labels[tool.name] || tool.name}
        <small>
          {tool.origin === "model" ? "Вызов модели" : "Контекст поля"}
        </small>
      </span>
      {Array.isArray(r)
        ? r.slice(0, 3).map((item, i) => (
            <Link
              key={i}
              href={
                tool.name.startsWith("search_")
                  ? "/market/" + item.id
                  : tool.name === "get_fields"
                    ? "/fields/" + item.id
                    : "/news"
              }
            >
              {String(item.title || item.name || "Открыть")}
              <ArrowUpRight size={14} />
            </Link>
          ))
        : r && (
            <>
              {r.error != null && <p>{String(r.error)}</p>}
              {tool.name === "get_field_weather" && (
                <>
                  <strong>
                    {fmt(
                      (r.current as { temperature_2m?: number })
                        ?.temperature_2m,
                    )}
                    °{" "}
                    <small>
                      {String((r.field as { name?: string })?.name || "")}
                    </small>
                  </strong>
                  <p>
                    {String(r.source || "")} · {String(r.timezone || "")} ·{" "}
                    {String(r.status || "")}
                  </p>
                  {(r.field as { id?: string })?.id && (
                    <Link href={"/fields/" + (r.field as { id: string }).id}>
                      Прогноз на неделю <ArrowUpRight size={14} />
                    </Link>
                  )}
                </>
              )}
              {tool.name === "get_field" && (
                <Link href={"/fields/" + r.id}>
                  {String(r.name)} · {fmt(r.area_ha as number)} га
                  <ArrowUpRight size={14} />
                </Link>
              )}
              {(tool.name === "get_field_analysis" ||
                tool.name === "run_field_analysis") && (
                <p>
                  {String(
                    (r.recommendation as { warning?: string })?.warning ||
                      r.message ||
                      "Расчёт получен",
                  )}
                </p>
              )}
            </>
          )}
    </div>
  );
}
export function Assistant() {
  const params = useSearchParams(),
    fields = useApi<Field[]>("/fields"),
    history = useApi<Turn[]>("/assistant/history"),
    provider = useApi<Provider>("/assistant/provider");
  const [selected, setSelected] = useState(params.get("field") || ""),
    [question, setQuestion] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [draft, setDraft] = useState<Turn | null>(null),
    [last, setLast] = useState("");
  const controller = useRef<AbortController | null>(null),
    bottom = useRef<HTMLDivElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (document.activeElement?.tagName !== "TEXTAREA")
      bottom.current?.scrollIntoView({ block: "end", behavior: "auto" });
  }, [draft?.answer.text, history.data?.length]);
  async function ask(q: string) {
    if (!q.trim() || busy) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    setLast(q);
    setQuestion("");
    setDraft({ id: -1, question: q, answer: { text: "", tools: [] } });
    let completed = false;
    try {
      const response = await fetch("/api/assistant/stream", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, field_id: selected || null }),
        signal: abort.signal,
      });
      if (!response.ok) {
        const e = await response.json();
        throw new Error(
          typeof e.detail === "string"
            ? e.detail
            : "Не удалось отправить запрос",
        );
      }
      if (!response.body) throw new Error("Поток ответа недоступен");
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";
        for (const chunk of chunks) {
          const data = chunk.split("\n").find((x) => x.startsWith("data:"));
          if (!data) continue;
          const event = JSON.parse(data.slice(5));
          if (event.type === "error") throw new Error(event.message);
          if (event.type === "token")
            setDraft((t) =>
              t
                ? {
                    ...t,
                    answer: { ...t.answer, text: t.answer.text + event.text },
                  }
                : t,
            );
          if (event.type === "tool")
            setDraft((t) =>
              t
                ? {
                    ...t,
                    answer: { ...t.answer, tools: [...t.answer.tools, event] },
                  }
                : t,
            );
          if (event.type === "meta")
            setDraft((t) => (t ? { ...t, model: event.model } : t));
          if (event.type === "done") completed = true;
        }
      }
      if (!completed) throw new Error("Соединение прервано. Повторите запрос.");
      history.reload();
      setDraft(null);
    } catch (e) {
      if (!abort.signal.aborted) setError((e as Error).message);
      else setDraft((t) => (t ? { ...t, status: "cancelled" } : t));
    } finally {
      setBusy(false);
      controller.current = null;
    }
  }
  const turns = [...(history.data || []), ...(draft ? [draft] : [])];
  return (
    <div className="assistant-page">
      <PageHead
        eyebrow="ВАШ ПОМОЩНИК В ПОЛЕ"
        title="EGIN AI"
        description="Чем помочь вашему хозяйству?"
      />
      <div className="assistant-context">
        <MapPin size={18} />
        <select
          aria-label="Поле для помощника"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Все хозяйства</option>
          {fields.data?.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} · {f.farm_name}
            </option>
          ))}
        </select>
        <Link className="tag" href="/settings">
          {provider.data?.available ? provider.data.model : "Настройки AI"}
        </Link>
      </div>
      {provider.data && !provider.data.available && (
        <div className="note">
          {provider.data.configured
            ? "Модель сейчас недоступна"
            : "AI provider не настроен"}
          . <Link href="/settings">Настроить провайдер</Link>
        </div>
      )}
      <div className="assistant-intro">
        <div className="assistant-symbol">
          <Sparkles size={28} />
        </div>
        <h2>От данных — к решению.</h2>
        <p>
          Выберите поле и задайте вопрос. Источники появятся рядом с ответом.
        </p>
        <div className="prompt-grid">
          {[
            "Анализ моего поля",
            "Погода на неделю",
            "Что посадить?",
            "Риски сегодня",
            "Найти технику",
            "Проанализировать почву",
          ].map((p) => (
            <button key={p} disabled={busy} onClick={() => ask(p)}>
              {p}
              <ArrowUpRight size={16} />
            </button>
          ))}
        </div>
      </div>
      <div className="assistant-thread">
        {history.loading && !history.data && <Loading />}
        {turns.map((t) => (
          <div className="assistant-turn" key={t.id}>
            <div className="user-question">{t.question}</div>
            <div className="assistant-response">
              <Sparkles size={19} />
              <div>
                <div className="ai-tools">
                  {t.answer.tools?.map((tool, i) => (
                    <ToolCard key={i} tool={tool} />
                  ))}
                </div>
                <p className="ai-answer">
                  {t.answer.text ||
                    (busy && t.id === -1
                      ? "Изучаю данные…"
                      : "Ответ остановлен")}
                </p>
                {t.status === "cancelled" && (
                  <small>Генерация остановлена</small>
                )}
                {t.model && <small className="muted">{t.model}</small>}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {error && <ErrorBox message={error} />}
      {!busy && last && (
        <button className="text-link retry-answer" onClick={() => ask(last)}>
          <RotateCcw size={16} />
          Повторить ответ
        </button>
      )}
      <form
        className="assistant-input"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <textarea
          aria-label="Вопрос помощнику"
          placeholder="Спросите о своём поле…"
          rows={2}
          maxLength={2000}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        {busy ? (
          <Button
            type="button"
            aria-label="Остановить ответ"
            onClick={() => controller.current?.abort()}
          >
            <Square size={20} />
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={!question.trim()}
            aria-label="Отправить вопрос"
          >
            <Send size={20} />
          </Button>
        )}
      </form>
      <p className="assistant-disclaimer">
        Почвенные данные — глобальная оценка. ML-рекомендации экспериментальные;
        проверяйте решения с агрономом.
      </p>
    </div>
  );
}
