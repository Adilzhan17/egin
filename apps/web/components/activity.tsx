"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Plus,
  Check,
  CalendarDays,
  MessageCircle,
  Newspaper,
  Tractor,
  BriefcaseBusiness,
  Settings,
  MapPinned,
  ChevronRight,
} from "lucide-react";
import { api, useApi, date } from "@/lib/api";
import { queueOfflineNote, flushOfflineNotes } from "@/lib/app-store";
import { readOffline, writeOffline } from "@/lib/offline";
import type { Provider } from "./assistant";
import { Button, ErrorBox, PageHead, Loading } from "./ui";
import { GoogleStatus } from "./google-status";
import { NotificationSettings } from "./notification-settings";
type Task = {
  id: string;
  title: string;
  field_name?: string;
  due_date: string;
  completed_at: string | null;
};
export function Tasks({ fieldId }: { fieldId?: string }) {
  const tasks = useApi<Task[]>(
    "/tasks" + (fieldId ? "?field_id=" + fieldId : ""),
  );
  const [title, setTitle] = useState(""),
    [due, setDue] = useState(new Date().toLocaleDateString("en-CA")),
    [adding, setAdding] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title,
          due_date: due,
          field_id: fieldId || null,
        }),
      });
      tasks.reload();
      setTitle("");
      setAdding(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(t: Task) {
    try {
      await api("/tasks/" + t.id, {
        method: "PATCH",
        body: JSON.stringify({ done: !t.completed_at }),
      });
      tasks.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="panel task-panel">
      <div className="section-heading">
        <h2>
          <CalendarDays size={20} />
          План работ
        </h2>
        <button
          className="icon-button"
          aria-label="Добавить задачу"
          onClick={() => setAdding(!adding)}
        >
          <Plus size={20} />
        </button>
      </div>
      {(error || tasks.error) && <ErrorBox message={error || tasks.error} />}{" "}
      {tasks.loading && !tasks.data && <Loading />}
      {adding && (
        <form className="task-form" onSubmit={add}>
          <input
            autoFocus
            aria-label="Название задачи"
            placeholder="Что нужно сделать?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            minLength={2}
            maxLength={240}
          />
          <input
            aria-label="Дата задачи"
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            required
          />
          <Button type="submit" busy={busy}>
            Добавить
          </Button>
        </form>
      )}
      {tasks.data?.length
        ? tasks.data.slice(0, 6).map((t) => (
            <div
              className={"task-row " + (t.completed_at ? "done" : "")}
              key={t.id}
            >
              <button
                className="task-check"
                aria-label={
                  (t.completed_at ? "Вернуть задачу: " : "Выполнить задачу: ") +
                  t.title
                }
                aria-pressed={!!t.completed_at}
                onClick={() => toggle(t)}
              >
                {t.completed_at && <Check size={17} />}
              </button>
              <div>
                <strong>{t.title}</strong>
                <small>
                  {t.field_name && t.field_name + " · "}
                  {t.due_date}
                </small>
              </div>
            </div>
          ))
        : !tasks.loading && (
            <p className="muted">
              Запланируйте осмотр поля, посев или обслуживание техники.
            </p>
          )}
    </section>
  );
}
export function FieldNotes({ fieldId }: { fieldId: string }) {
  const notes = useApi<
    { id: string; body: string; author: string; created_at: string }[]
  >("/fields/" + fieldId + "/notes");
  const [body, setBody] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<
      { id: string; fieldId: string; body: string; createdAt: string }[]
    >([]);
  useEffect(() => {
    let active = true;
    const load = () => {
      void readOffline<typeof pending>("pending-notes").then((value) => {
        if (active)
          setPending((value || []).filter((note) => note.fieldId === fieldId));
      });
    };
    load();
    void readOffline<string>("note-draft:" + fieldId).then((value) => {
      if (active && value) setBody(value);
    });
    window.addEventListener("egin:notes-synced", load);
    void flushOfflineNotes();
    return () => {
      active = false;
      window.removeEventListener("egin:notes-synced", load);
    };
  }, [fieldId]);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const note = await queueOfflineNote(fieldId, body);
      setPending((old) => [...old, note]);
      setBody("");
      await writeOffline("note-draft:" + fieldId, "");
      await flushOfflineNotes();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Заметки поля</h2>
      </div>
      {(error || notes.error) && <ErrorBox message={error || notes.error} />}
      <form className="note-form" onSubmit={add}>
        <textarea
          aria-label="Заметка поля"
          placeholder="Наблюдение, состояние посевов, результат осмотра…"
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            void writeOffline("note-draft:" + fieldId, e.target.value);
          }}
          minLength={2}
          maxLength={6000}
          required
          rows={2}
        />
        <Button type="submit" busy={busy} disabled={body.trim().length < 2}>
          Добавить заметку
        </Button>
      </form>
      {pending.map((note) => (
        <article className="pending-note" key={note.id}>
          <p>{note.body}</p>
          <small>На устройстве · ожидает отправки</small>
          <button
            className="button ghost"
            onClick={() => {
              void flushOfflineNotes();
            }}
          >
            Повторить отправку
          </button>
        </article>
      ))}
      {notes.data?.map((n) => (
        <article className="field-note" key={n.id}>
          <p>{n.body}</p>
          <small>
            {n.author} · {date(n.created_at)}
          </small>
        </article>
      ))}
    </section>
  );
}
export function MorePage() {
  return (
    <div>
      <PageHead
        eyebrow="ВАШЕ ХОЗЯЙСТВО"
        title="Ещё"
        description="Люди, ресурсы и повседневные дела."
      />
      <div className="more-grid">
        {[
          {
            href: "/farms",
            icon: MapPinned,
            title: "Мои хозяйства",
            text: "Команда и поля",
          },
          {
            href: "/tasks",
            icon: CalendarDays,
            title: "План работ",
            text: "Задачи и даты",
          },
          {
            href: "/community",
            icon: MessageCircle,
            title: "Сообщество",
            text: "Опыт фермеров рядом",
          },
          {
            href: "/news",
            icon: Newspaper,
            title: "Новости",
            text: "События агроотрасли",
          },
          {
            href: "/market?type=machinery_rental",
            icon: Tractor,
            title: "Аренда техники",
            text: "Техника для сезона",
          },
          {
            href: "/market?type=job",
            icon: BriefcaseBusiness,
            title: "Работа",
            text: "Вакансии в хозяйствах",
          },
          {
            href: "/settings",
            icon: Settings,
            title: "Настройки AI",
            text: "Провайдер и модель",
          },
        ].map((x) => (
          <Link className="panel more-link" href={x.href} key={x.href}>
            <x.icon size={25} />
            <div>
              <strong>{x.title}</strong>
              <p>{x.text}</p>
            </div>
            <ChevronRight size={20} />
          </Link>
        ))}
      </div>
    </div>
  );
}
export function SettingsPage() {
  const provider = useApi<Provider>("/assistant/provider");
  return (
    <div>
      <PageHead
        eyebrow="ПОДКЛЮЧЕНИЕ AI"
        title="Настройки помощника"
        description="Состояние помощника и источников данных вашего хозяйства."
      />
      <section className="panel settings-panel">
        {provider.loading ? (
          <Loading />
        ) : provider.error ? (
          <ErrorBox message={provider.error} onRetry={provider.reload} />
        ) : (
          <>
            <h2>
              {provider.data?.available
                ? "AI подключён"
                : provider.data?.message}
            </h2>
            <p>
              {provider.data?.provider || "Провайдер не выбран"} ·{" "}
              {provider.data?.model}
            </p>
            <Button variant="secondary" onClick={provider.reload}>
              Проверить подключение
            </Button>
          </>
        )}
        <p className="note">
          Локальная модель может отвечать дольше. Прогноз, поля и сохранённые
          анализы доступны независимо от помощника.
        </p>
        <Link className="button primary" href="/assistant">
          Открыть помощника
        </Link>
      </section>
      <GoogleStatus />
      <NotificationSettings />
    </div>
  );
}
