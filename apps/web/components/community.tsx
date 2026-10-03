"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  MessageCircle,
  Plus,
  Send,
  Search,
  ArrowLeft,
  Users,
  RotateCcw,
  CheckCheck,
} from "lucide-react";
import { api, useApi, date } from "@/lib/api";
import type { Conversation, Message, User } from "@/lib/types";
import { Button, Loading, ErrorBox, PageHead } from "./ui";
export function Community({ user }: { user: User }) {
  const cs = useApi<Conversation[]>("/conversations"),
    params = useSearchParams();
  const [selected, setSelected] = useState(params.get("chat") || ""),
    [messages, setMessages] = useState<Message[]>([]),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [connected, setConnected] = useState(false),
    [more, setMore] = useState(true),
    [newChat, setNewChat] = useState(false),
    [search, setSearch] = useState(""),
    [found, setFound] = useState<{ id: string; name: string }[]>([]),
    [members, setMembers] = useState<{ id: string; name: string }[]>([]),
    [group, setGroup] = useState(false),
    [title, setTitle] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const room = cs.data?.find((c) => c.id === selected);
  const reloadConversations = cs.reload;
  const merge = (next: Message) =>
    setMessages((old) =>
      [...old.filter((m) => m.client_id !== next.client_id), next].sort(
        (a, b) => a.id - b.id,
      ),
    );
  useEffect(() => {
    if (!selected) return;
    let alive = true,
      events: WebSocket | null = null;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    const c = new AbortController();
    setLoading(true);
    setMessages([]);
    setError("");
    setConnected(false);
    setMore(true);
    api<Message[]>(`/conversations/${selected}/messages`, { signal: c.signal })
      .then((data) => {
        if (!alive) return;
        setMessages(data);
        setMore(data.length === 50);
        let last = data.at(-1)?.id || 0;
        const read = () =>
          api(`/conversations/${selected}/read`, {
            method: "POST",
            body: JSON.stringify({ last_read_id: last }),
          }).catch(() => {});
        void read();
        let failures = 0;
        const connect = () => {
          if (!alive) return;
          events = new WebSocket(
            `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws/conversations/${selected}?after=${last}`,
          );
          events.onmessage = (e) => {
            if (!alive) return;
            const event = JSON.parse(e.data);
            if (event.type === "ready") {
              setConnected(true);
              failures = 0;
            }
            if (event.type !== "message") return;
            const m = event.message as Message;
            last = Math.max(last, m.id);
            merge(m);
            void read();
            reloadConversations();
          };
          events.onclose = () => {
            if (!alive) return;
            setConnected(false);
            reconnect = setTimeout(
              connect,
              Math.min(15000, 1000 * 2 ** failures++),
            );
          };
          events.onerror = () => events?.close();
        };
        connect();
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      c.abort();
      clearTimeout(reconnect);
      events?.close();
    };
  }, [selected, reloadConversations]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);
  async function send(e?: React.FormEvent, retry?: Message) {
    e?.preventDefault();
    const body = retry?.body || text.trim();
    if (!body || !selected) return;
    const m: Message = retry
      ? { ...retry, pending: true, failed: false }
      : {
          id: Number.MAX_SAFE_INTEGER,
          client_id: crypto.randomUUID(),
          body,
          user_id: user.id,
          name: user.name,
          created_at: new Date().toISOString(),
          pending: true,
        };
    merge(m);
    if (!retry) setText("");
    try {
      const saved = await api<Message>(`/conversations/${selected}/messages`, {
        method: "POST",
        body: JSON.stringify({ body, client_id: m.client_id }),
      });
      merge(saved);
      reloadConversations();
    } catch {
      merge({ ...m, pending: false, failed: true });
    }
  }
  async function loadMore() {
    if (!messages.length) return;
    try {
      const older = await api<Message[]>(
        `/conversations/${selected}/messages?before=${messages[0].id}`,
      );
      setMessages((old) => [...older, ...old]);
      setMore(older.length === 50);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function find(e: React.FormEvent) {
    e.preventDefault();
    try {
      setFound(await api("/users/search?q=" + encodeURIComponent(search)));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function create() {
    try {
      const c = await api<Conversation>("/conversations", {
        method: "POST",
        body: JSON.stringify({
          kind: group ? "group" : "direct",
          title: group ? title : members[0]?.name || "Личный чат",
          member_ids: members.map((m) => m.id),
        }),
      });
      setSelected(c.id);
      setNewChat(false);
      reloadConversations();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div>
      <PageHead
        eyebrow="ОПЫТ ОБЪЕДИНЯЕТ"
        title="Сообщество"
        description="Разговоры о земле, сезоне и общих делах."
        action={
          <Button variant="secondary" onClick={() => setNewChat(!newChat)}>
            <Plus size={18} />
            Новый чат
          </Button>
        }
      />
      {error && <ErrorBox message={error} />}{" "}
      {newChat && (
        <div className="panel new-chat">
          <div className="form-grid">
            <form className="search-input" onSubmit={find}>
              <Search size={17} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Имя или точный email"
                minLength={2}
                required
              />
              <button type="submit">Найти</button>
            </form>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={group}
                onChange={(e) => {
                  setGroup(e.target.checked);
                  setMembers([]);
                }}
              />
              Групповой чат
            </label>
          </div>
          {group && (
            <label>
              Название группы
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                minLength={2}
                maxLength={100}
              />
            </label>
          )}
          <div className="chips">
            {found.map((p) => (
              <button
                className={members.some((m) => m.id === p.id) ? "active" : ""}
                key={p.id}
                onClick={() =>
                  setMembers((old) =>
                    old.some((m) => m.id === p.id)
                      ? old.filter((m) => m.id !== p.id)
                      : group
                        ? [...old, p]
                        : [p],
                  )
                }
              >
                {p.name}
              </button>
            ))}
          </div>
          <Button
            onClick={create}
            disabled={!members.length || (group && title.length < 2)}
          >
            Начать разговор
          </Button>
        </div>
      )}
      <div className={"chat-layout " + (selected ? "room-open" : "")}>
        <aside className="conversation-list">
          <div className="section-heading">
            <h2>Переписки</h2>
            <span className="count">{cs.data?.length || 0}</span>
          </div>
          {cs.loading && !cs.data ? (
            <Loading />
          ) : (
            cs.data?.map((c) => (
              <button
                key={c.id}
                className={
                  "conversation " + (selected === c.id ? "active" : "")
                }
                onClick={() => setSelected(c.id)}
              >
                <span className="avatar">
                  {c.kind === "group" ? <Users size={22} /> : c.title[0]}
                </span>
                <span className="conversation-copy">
                  <strong>{c.title}</strong>
                  <small>{c.last_message || "Начните разговор"}</small>
                </span>
                {c.unread_count > 0 && (
                  <span className="unread-badge">{c.unread_count}</span>
                )}
              </button>
            ))
          )}
        </aside>
        <section className="chat-room">
          {!selected ? (
            <div className="chat-empty">
              <MessageCircle size={44} strokeWidth={1} />
              <h2>Хорошие решения начинаются с разговора</h2>
              <p>Выберите сообщество слева или начните личный чат.</p>
            </div>
          ) : (
            <>
              <div className="chat-room-head">
                <button
                  className="icon-button mobile-only"
                  aria-label="К списку чатов"
                  onClick={() => setSelected("")}
                >
                  <ArrowLeft size={20} />
                </button>
                <span className="avatar small">
                  <Users size={20} />
                </span>
                <div>
                  <strong>{room?.title || "Переписка"}</strong>
                  <small>
                    <i
                      className={"status-dot " + (!connected ? "offline" : "")}
                    />
                    {connected
                      ? "Подключено · сообщения сохраняются"
                      : "Восстанавливаем соединение…"}
                  </small>
                </div>
              </div>
              <div className="messages">
                {loading && <Loading />}
                {more && messages.length > 0 && (
                  <button className="load-history" onClick={loadMore}>
                    Загрузить предыдущие
                  </button>
                )}
                {messages.map((m) => (
                  <div
                    key={m.client_id}
                    className={
                      "message " + (m.user_id === user.id ? "own" : "")
                    }
                  >
                    <span className="message-author">{m.name}</span>
                    <p>{m.body}</p>
                    <div className="message-meta">
                      <time>{date(m.created_at)}</time>
                      {m.pending ? (
                        "Отправка…"
                      ) : m.failed ? (
                        <button onClick={() => send(undefined, m)}>
                          <RotateCcw size={12} />
                          Повторить
                        </button>
                      ) : (
                        <CheckCheck size={13} />
                      )}
                    </div>
                  </div>
                ))}
                <div ref={bottom} />
              </div>
              <form className="message-form" onSubmit={send}>
                <textarea
                  aria-label="Сообщение"
                  rows={1}
                  maxLength={6000}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Напишите сообщение…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <Button
                  type="submit"
                  disabled={!text.trim()}
                  aria-label="Отправить сообщение"
                >
                  <Send size={20} />
                </Button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
