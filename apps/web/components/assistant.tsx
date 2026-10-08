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
  LoaderCircle,
  MapPin,
} from "lucide-react";
import { api, useApi, fmt } from "@/lib/api";
import { useAppState, useEventSubscription } from "@/lib/app-store";
import { Button, ErrorBox, Loading, PageHead } from "./ui";
type Tool = {
  name: string;
  origin?: string;
  status?: string;
  result?: Record<string, unknown> | Record<string, unknown>[];
};
type Turn = {
  id: number | string;
  question: string;
  answer: { text: string; tools: (Tool | string)[] };
  status?: string;
  model?: string;
};
type AssistantJob = {
  id: string;
  question: string;
  field_id?: string | null;
  status: string;
  answer?: string;
  model?: string;
  error?: string;
  tools?: unknown[];
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
  get_community_messages: "Сообщения сообщества",
  get_satellite_ndvi: "Спутниковые наблюдения",
  get_weathernext_forecast: "Прогноз WeatherNext",
  get_sensor_data: "Датчики поля",
};
function ToolCard({ tool }: { tool: Tool | string }) {
  if (typeof tool === "string")
    return <span className="tag">{labels[tool] || tool}</span>;
  const r = tool.result;
  const items = Array.isArray(r) ? r : Array.isArray(r?.items) ? r.items as Record<string, unknown>[] : null;
  const running = tool.status === "running";
  return (
    <div className="ai-tool-card">
      <span className="tool-label">
        {running ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
        {labels[tool.name] || tool.name}
        <small>
          {running ? "Получаю данные…" : tool.origin === "model" ? "Вызов модели" : tool.origin === "policy" ? "Проверка данных" : "Контекст поля"}
        </small>
      </span>
      {items
        ? items.slice(0, 3).map((item, i) => (
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
        : r && !Array.isArray(r) && (
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
    history = useApi<Turn[]>("/assistant/history"),
    provider = useApi<Provider>("/assistant/provider");
  const app = useAppState();
  const fields = app.snapshot?.fields || [];
  const jobs: AssistantJob[] = app.snapshot?.assistant_jobs || [];
  const [selected, setSelected] = useState(params.get("field") || ""),
    [question, setQuestion] = useState(""),
    [submitting, setSubmitting] = useState(false),
    [stopping, setStopping] = useState(false),
    [error, setError] = useState(""),
    [pending, setPending] = useState<AssistantJob | null>(null),
    [last, setLast] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const contextInitialized = useRef(false);
  const failedRequest = useRef<{ question: string; fieldId: string; clientId: string } | null>(null);
  const activeJob = jobs.find((job) => job.id === pending?.id)
    || [...jobs].reverse().find((job) => job.status === "queued" || job.status === "running")
    || pending || jobs[0];
  const busy = submitting || stopping || !!activeJob && ["queued", "running"].includes(activeJob.status);
  const streamPaused = app.connection === "offline" || app.connection === "reconnecting";
  useEffect(() => {
    if (contextInitialized.current || !app.snapshot) return;
    contextInitialized.current = true;
    const requested = params.get("field") || app.snapshot.selected_field_id;
    if (requested && app.snapshot.fields.some((field) => field.id === requested)) setSelected(requested);
  }, [app.snapshot, params]);
  useEventSubscription((event) => {
    if (!event.type.startsWith("assistant.")) return;
    if (event.type === "assistant.completed" || event.type === "assistant.error") {
      history.reload();
      if (event.payload.job_id === activeJob?.id) {
        setStopping(false);
        setPending(null);
        if (event.type === "assistant.error") setError(String(event.payload.message || "AI временно недоступен. Данные поля и прогноз продолжают работать."));
      }
    }
  });
  useEffect(() => {
    if (document.activeElement?.tagName !== "TEXTAREA")
      bottom.current?.scrollIntoView({ block: "end", behavior: "auto" });
  }, [activeJob?.answer, history.data?.length]);
  async function ask(q: string, retry = false) {
    if (!q.trim() || busy) return;
    if (app.connection === "offline") {
      setError("Нет связи. Вопрос сохранён в поле ввода; отправьте его после подключения.");
      setQuestion(q);
      return;
    }
    const clientId = retry && failedRequest.current?.question === q && failedRequest.current.fieldId === selected
      ? failedRequest.current.clientId : crypto.randomUUID();
    setSubmitting(true);
    setError("");
    setLast(q);
    setQuestion("");
    setPending({ id: clientId, question: q, status: "queued", answer: "" });
    try {
      const response = await api<{ id: string; status: string }>("/assistant/messages", {
        method: "POST",
        body: JSON.stringify({ question: q, field_id: selected || null, client_id: clientId }),
        signal: AbortSignal.timeout(15000),
      });
      failedRequest.current = null;
      setPending({ id: response.id, question: q, status: response.status, answer: "" });
      if (!["queued", "running"].includes(response.status)) history.reload();
    } catch (e) {
      failedRequest.current = { question: q, fieldId: selected, clientId };
      setError((e as Error).name === "TimeoutError" ? "Не удалось подтвердить отправку. Повторная попытка проверит тот же запрос без дублирования." : (e as Error).message);
      setPending(null);
      setQuestion(q);
    } finally {
      setSubmitting(false);
    }
  }
  async function stop() {
    if (!activeJob || submitting || stopping) return;
    setStopping(true);
    try {
      await api("/assistant/messages/" + activeJob.id + "/cancel", { method: "POST", signal: AbortSignal.timeout(10000) });
      setPending(null);
      history.reload();
    } catch (e) { setError((e as Error).message); }
    finally { setStopping(false); }
  }
  const activeTools = (activeJob?.tools || []).filter((tool): tool is Tool => !!tool && typeof tool === "object" && "name" in tool);
  const visibleTools = activeTools.filter((tool, index) => tool.status !== "running"
    || !activeTools.slice(index + 1).some((later) => later.name === tool.name && later.origin === tool.origin && later.status !== "running"));
  const activeTurn: Turn | null = activeJob ? {
    id: activeJob.id, question: activeJob.question,
    answer: { text: activeJob.answer || "", tools: visibleTools },
    status: activeJob.status, model: activeJob.model,
  } : null;
  const historyTurns = history.data || [];
  const alreadySaved = activeTurn && !busy && historyTurns.some((turn) => turn.question === activeTurn.question && turn.answer.text === activeTurn.answer.text);
  const turns = [...historyTurns, ...(activeTurn && !alreadySaved ? [activeTurn] : [])];
  const visibleError = error || (activeJob?.status === "failed" ? activeJob.error : "") || history.error;
  const retryQuestion = last || activeJob?.question;
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
          disabled={busy}
          onChange={(e) => {
            setSelected(e.target.value);
            if (e.target.value) localStorage.setItem("egin-current-field", e.target.value);
          }}
        >
          <option value="">Все хозяйства</option>
          {fields.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} · {f.farm_name}
            </option>
          ))}
        </select>
        <Link className="tag" href="/settings">
          {provider.data?.available ? provider.data.model : "Настройки AI"}
        </Link>
      </div>
      {busy && (
        <p className="note" role="status" aria-live="polite">
          {streamPaused ? "Связь восстанавливается. Запрос сохранён на сервере; ответ продолжится после подключения."
            : submitting ? "Отправляю вопрос…"
              : stopping ? "Останавливаю ответ…"
                : activeJob?.status === "queued" ? "Запрос принят. Помощник скоро начнёт отвечать…"
                  : "Помощник отвечает. Можно перейти к полям — ответ сохранится."}
        </p>
      )}
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
                    (busy && t.id === activeJob?.id
                      ? activeJob?.status === "queued" ? "Подключаю помощника…" : "Изучаю данные поля…"
                      : t.status === "failed" ? "AI временно недоступен. Прогноз и данные поля доступны."
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
      {visibleError && <ErrorBox message={visibleError} />}
      {!busy && retryQuestion && (
        <button className="text-link retry-answer" onClick={() => ask(retryQuestion, true)}>
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
            disabled={submitting || stopping}
            onClick={() => void stop()}
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
