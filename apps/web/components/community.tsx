/* eslint-disable @next/next/no-img-element -- Authenticated same-origin chat attachments use server-resized images. */
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  Check,
  CheckCheck,
  Copy,
  FileText,
  Forward,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Reply,
  RotateCcw,
  Search,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { api, ApiError, useApi, fmt } from "@/lib/api";
import { useEventSubscription, useRealtimeStatus } from "@/lib/app-store";
import { readOffline, writeOffline } from "@/lib/offline";
import type {
  ChatAttachment,
  Conversation,
  Field,
  Message,
  User,
} from "@/lib/types";
import { Button, ErrorBox, Loading, PageHead } from "./ui";
import "./chat.css";

type Member = {
  id: string;
  name: string;
  last_seen: string | null;
  online: boolean;
  last_read_id: number;
  typing_until?: string | null;
};
type Draft = {
  text: string;
  reply?: Message | null;
  attachments?: ChatAttachment[];
  field?: Field | null;
};
type Typing = { name: string; until: number };
const reactions = ["👍", "❤️", "🌱", "👏", "✅"];
const clock = (value: string) =>
  new Date(value).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
const day = (value: string) =>
  new Date(value).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
const version = (message: Message) => Number(message.version || 0);
function mergeMessages(current: Message[], incoming: Message[]) {
  const all = [...current];
  for (const next of incoming) {
    const index = all.findIndex(
      (m) => m.client_id === next.client_id || (m.id > 0 && m.id === next.id),
    );
    if (index < 0) all.push(next);
    else if (
      all[index].pending ||
      all[index].failed ||
      version(next) >= version(all[index])
    )
      all[index] = next;
  }
  const byId = new Map(all.map((message) => [message.id, message]));
  return all
    .map((message) => {
      const parent = message.reply_to_id ? byId.get(message.reply_to_id) : null;
      return parent
        ? {
            ...message,
            reply_preview: {
              id: parent.id,
              user_id: parent.user_id,
              name: parent.name,
              body: parent.body,
              deleted_at: parent.deleted_at,
            },
          }
        : message;
    })
    .sort((a, b) =>
      a.id > 0 && b.id > 0
        ? a.id - b.id
        : a.id > 0
          ? -1
          : b.id > 0
            ? 1
            : new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime(),
    );
}
function attachmentURL(item: ChatAttachment) {
  return item.url.startsWith("/chat/attachments/")
    ? "/api" + item.url
    : "/api/chat/attachments/" + encodeURIComponent(item.id);
}
function FieldThumbnail({
  geometry,
}: {
  geometry: NonNullable<Message["field_card"]>["geometry"];
}) {
  if (!geometry) return <MapPin size={26} />;
  const rings =
    geometry.type === "Polygon"
      ? geometry.coordinates
      : geometry.coordinates.flat();
  const points = rings.flat();
  if (!points.length || points.length > 256) return <MapPin size={26} />;
  const xs = points.map((point) => point[0]),
    ys = points.map((point) => point[1]);
  const west = Math.min(...xs),
    south = Math.min(...ys),
    width = Math.max(...xs) - west || 1,
    height = Math.max(...ys) - south || 1;
  const scale = 58 / Math.max(width, height);
  const path = rings
    .map(
      (ring) =>
        "M" +
        ring
          .map(
            ([x, y]) => `${7 + (x - west) * scale},${65 - (y - south) * scale}`,
          )
          .join(" L") +
        " Z",
    )
    .join(" ");
  return (
    <svg
      className="chat-field-thumbnail"
      viewBox="0 0 72 72"
      role="img"
      aria-label="Контур поля"
    >
      <path d={path} fillRule="evenodd" />
    </svg>
  );
}

export function Community({ user }: { user: User }) {
  const cs = useApi<Conversation[]>("/conversations"),
    params = useSearchParams(),
    connection = useRealtimeStatus();
  const [selected, setSelected] = useState(params.get("chat") || "");
  const [roomRevision, refreshRoom] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]),
    [members, setMembers] = useState<Member[]>([]);
  const [text, setText] = useState(""),
    [reply, setReply] = useState<Message | null>(null),
    [editing, setEditing] = useState<Message | null>(null);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]),
    [sharedField, setSharedField] = useState<Field | null>(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false),
    [more, setMore] = useState(false),
    [loadingOlder, setLoadingOlder] = useState(false);
  const [uploading, setUploading] = useState(false),
    [actions, setActions] = useState<Message | null>(null),
    [forward, setForward] = useState<Message | null>(null);
  const [fieldPicker, setFieldPicker] = useState(false),
    [roomFilter, setRoomFilter] = useState("");
  const [typers, setTypers] = useState<Record<string, Typing>>({}),
    [awayFromBottom, setAwayFromBottom] = useState(false),
    [newCount, setNewCount] = useState(0);
  const [unreadBoundary, setUnreadBoundary] = useState<number | null>(null),
    [draftReady, setDraftReady] = useState("");
  const [newChat, setNewChat] = useState(false),
    [search, setSearch] = useState(""),
    [found, setFound] = useState<{ id: string; name: string }[]>([]);
  const [chosenMembers, setChosenMembers] = useState<
      { id: string; name: string }[]
    >([]),
    [group, setGroup] = useState(false),
    [title, setTitle] = useState("");
  const fields = useApi<Field[]>(fieldPicker ? "/fields" : null);
  const scroller = useRef<HTMLDivElement>(null),
    bottom = useRef<HTMLDivElement>(null),
    input = useRef<HTMLTextAreaElement>(null),
    upload = useRef<HTMLInputElement>(null);
  const currentRoom = useRef(selected),
    stickToBottom = useRef(true),
    lastTyping = useRef(0),
    readWatermark = useRef(0),
    latestServerId = useRef(0),
    previousConnection = useRef(connection),
    loadingRoom = useRef("");
  const room = cs.data?.find((c) => c.id === selected),
    otherMembers = members.filter((m) => m.id !== user.id);
  const nearBottom = useCallback(() => {
    const element = scroller.current;
    return (
      !element ||
      element.scrollHeight - element.scrollTop - element.clientHeight < 100
    );
  }, []);
  const scrollBottom = useCallback((smooth = false) => {
    scroller.current?.scrollTo({
      top: scroller.current.scrollHeight,
      behavior: smooth ? "smooth" : "instant",
    });
    stickToBottom.current = true;
    setAwayFromBottom(false);
    setNewCount(0);
  }, []);
  const markRead = useCallback((roomId: string, id: number) => {
    if (
      !id ||
      id <= readWatermark.current ||
      document.visibilityState !== "visible" ||
      roomId !== currentRoom.current
    )
      return;
    readWatermark.current = id;
    void api(`/conversations/${roomId}/read`, {
      method: "POST",
      body: JSON.stringify({ last_read_id: id }),
    }).catch(() => {
      readWatermark.current = 0;
    });
  }, []);
  const addMessages = useCallback(
    (next: Message[]) =>
      setMessages((old) =>
        mergeMessages(
          old,
          next.filter(
            (message) => message.conversation_id === currentRoom.current,
          ),
        ),
      ),
    [],
  );
  const denyRoom = useCallback((roomId: string, error: unknown) => {
    if (!(error instanceof ApiError) || ![401, 403, 404].includes(error.status))
      return;
    void writeOffline("chat:messages:" + roomId, []);
    void writeOffline("chat:draft:" + roomId, null);
    if (currentRoom.current !== roomId) return;
    setMessages([]);
    setMembers([]);
    setText("");
    setReply(null);
    setEditing(null);
    setAttachments([]);
    setSharedField(null);
  }, []);

  useEffect(() => {
    currentRoom.current = selected;
    loadingRoom.current = selected;
    readWatermark.current = 0;
    stickToBottom.current = true;
    setMessages([]);
    setMembers([]);
    setText("");
    setReply(null);
    setEditing(null);
    setAttachments([]);
    setSharedField(null);
    setDraftReady("");
    setError("");
    setActions(null);
    setTypers({});
    setUnreadBoundary(null);
    setAwayFromBottom(false);
    setNewCount(0);
    setMore(false);
    if (!selected) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let active = true,
      fetched = false;
    setLoading(true);
    void readOffline<Message[]>("chat:messages:" + selected).then((cached) => {
      if (active && !fetched && cached) {
        setMessages(cached);
        setLoading(false);
      }
    });
    void readOffline<Draft>("chat:draft:" + selected).then((draft) => {
      if (!active) return;
      if (draft) {
        setText(draft.text);
        setReply(draft.reply || null);
        setAttachments(draft.attachments || []);
        setSharedField(draft.field || null);
      }
      setDraftReady(selected);
    });
    void Promise.all([
      api<Message[]>(`/conversations/${selected}/messages`, {
        signal: controller.signal,
      }),
      api<Member[]>(`/conversations/${selected}/members`, {
        signal: controller.signal,
      }),
    ])
      .then(([next, people]) => {
        if (!active) return;
        fetched = true;
        addMessages(next);
        setMembers(people);
        setMore(next.length === 50);
        const ownRead = people.find((p) => p.id === user.id)?.last_read_id || 0;
        setUnreadBoundary(
          next.find((m) => m.id > ownRead && m.user_id !== user.id)?.id || null,
        );
        markRead(selected, next.at(-1)?.id || 0);
      })
      .catch((e) => {
        if (active && !controller.signal.aborted) {
          denyRoom(selected, e);
          setError(
            navigator.onLine
              ? e.message
              : "Нет связи. Доступна сохранённая переписка.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [selected, user.id, addMessages, markRead, denyRoom, roomRevision]);
  useEffect(() => {
    if (
      previousConnection.current !== "live" &&
      connection === "live" &&
      selected &&
      error
    )
      refreshRoom((value) => value + 1);
    previousConnection.current = connection;
  }, [connection, selected, error]);

  useEffect(() => {
    latestServerId.current =
      selected &&
      messages.every((message) => message.conversation_id === selected)
        ? messages.filter((message) => message.id > 0).at(-1)?.id || 0
        : 0;
    if (
      selected &&
      messages.length &&
      loadingRoom.current === selected &&
      messages.every((m) => m.conversation_id === selected)
    )
      void writeOffline("chat:messages:" + selected, messages.slice(-100));
    if (stickToBottom.current) requestAnimationFrame(() => scrollBottom());
  }, [messages, selected, scrollBottom]);
  useEffect(() => {
    const element = scroller.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      // Image/font layout changes are not an intent to scroll into history.
      if (stickToBottom.current) scrollBottom();
      else setAwayFromBottom(!nearBottom());
    });
    for (const child of element.children) observer.observe(child);
    return () => observer.disconnect();
  }, [messages, selected, scrollBottom, nearBottom]);
  useEffect(() => {
    if (!selected || draftReady !== selected || editing) return;
    void writeOffline("chat:draft:" + selected, {
      text,
      reply,
      attachments,
      field: sharedField,
    });
  }, [selected, draftReady, text, reply, attachments, sharedField, editing]);
  useEffect(() => {
    const element = input.current;
    if (element) {
      element.style.height = "auto";
      element.style.height = Math.min(element.scrollHeight, 140) + "px";
    }
  }, [text, selected]);
  useEffect(() => {
    if (!Object.keys(typers).length) return;
    const timer = setInterval(
      () =>
        setTypers((old) =>
          Object.fromEntries(
            Object.entries(old).filter(([, value]) => value.until > Date.now()),
          ),
        ),
      1500,
    );
    return () => clearInterval(timer);
  }, [typers]);
  useEffect(() => {
    const heartbeat = () => {
      const now = Date.now();
      setMembers((old) =>
        old.map((member) => ({
          ...member,
          online: Boolean(
            member.last_seen && Date.parse(member.last_seen) > now - 70000,
          ),
        })),
      );
      if (document.visibilityState === "visible")
        markRead(currentRoom.current, latestServerId.current);
      if (document.visibilityState === "visible" && navigator.onLine)
        void api("/presence", { method: "POST", body: "{}" }).catch(() => {});
    };
    heartbeat();
    const timer = setInterval(heartbeat, 30000);
    document.addEventListener("visibilitychange", heartbeat);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", heartbeat);
    };
  }, [markRead]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!actions && !forward && !fieldPicker) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActions(null);
        setForward(null);
        setFieldPicker(false);
      }
    };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [actions, forward, fieldPicker]);

  useEventSubscription((event) => {
    const payload = event.payload;
    if (event.type === "snapshot.refreshed" && selected) {
      const roomId = selected;
      void Promise.all([
        api<Message[]>(`/conversations/${roomId}/messages`),
        api<Member[]>(`/conversations/${roomId}/members`),
      ])
        .then(([fresh, people]) => {
          if (currentRoom.current !== roomId) return;
          // A cursor older than server retention cannot be replayed. Replace the
          // authorized window while preserving local failed/pending messages and draft.
          setMessages((old) =>
            mergeMessages(
              old.filter((message) => message.pending || message.failed),
              fresh,
            ),
          );
          setMembers(people);
          setMore(fresh.length === 50);
          if (nearBottom()) markRead(roomId, fresh.at(-1)?.id || 0);
        })
        .catch((error) => {
          denyRoom(roomId, error);
          if (currentRoom.current === roomId) setError(error.message);
        });
      return;
    }
    if (event.type === "presence.updated") {
      setMembers((old) =>
        old.map((m) =>
          m.id === payload.user_id
            ? {
                ...m,
                online: Boolean(payload.online),
                last_seen: String(payload.last_seen || m.last_seen || ""),
              }
            : m,
        ),
      );
      return;
    }
    if (payload.conversation_id !== selected) return;
    if (event.type === "message.read") {
      setMembers((old) =>
        old.map((m) =>
          m.id === payload.user_id
            ? {
                ...m,
                last_read_id: Math.max(
                  m.last_read_id,
                  Number(payload.last_read_id),
                ),
              }
            : m,
        ),
      );
    } else if (event.type === "chat.typing" && payload.user_id !== user.id) {
      setTypers((old) => {
        const next = { ...old },
          id = String(payload.user_id);
        if (payload.typing)
          next[id] = {
            name: String(payload.name),
            until: Date.parse(String(payload.expires_at)) || Date.now() + 6000,
          };
        else delete next[id];
        return next;
      });
    } else if (event.type.startsWith("message.") && payload.message) {
      const next = payload.message as Message;
      addMessages([next]);
      if (event.type === "message.created" && next.user_id !== user.id) {
        setTypers((old) => {
          const nextTypers = { ...old };
          delete nextTypers[next.user_id];
          return nextTypers;
        });
        if (stickToBottom.current) markRead(selected, next.id);
        else setNewCount((x) => x + 1);
      }
    }
  });

  function typing(value: string) {
    setText(value);
    if (
      !selected ||
      !navigator.onLine ||
      (value && Date.now() - lastTyping.current < 3000)
    )
      return;
    lastTyping.current = Date.now();
    void api(`/conversations/${selected}/typing`, {
      method: "POST",
      body: JSON.stringify({ typing: Boolean(value.trim()) }),
    }).catch(() => {});
  }
  async function send(event?: React.FormEvent, retry?: Message) {
    event?.preventDefault();
    const roomId = selected;
    if (!roomId || uploading) return;
    const body =
      retry?.body ??
      (text.trim() ||
        (sharedField
          ? "Поле: " + sharedField.name
          : attachments.length
            ? "Вложение: " + attachments.map((file) => file.filename).join(", ")
            : ""));
    if (!body && !attachments.length && !sharedField) return;
    setError("");
    if (editing) {
      try {
        const saved = await api<Message>(
          `/conversations/${roomId}/messages/${editing.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({ body, version: editing.version || 1 }),
          },
        );
        addMessages([saved]);
        setEditing(null);
        setText("");
        await writeOffline("chat:draft:" + roomId, { text: "" });
      } catch (e) {
        setError((e as Error).message);
      }
      return;
    }
    const message: Message = retry
      ? { ...retry, pending: true, failed: false }
      : {
          id: -Number.parseInt(
            crypto.randomUUID().slice(0, 12).replace("-", ""),
            16,
          ),
          client_id: crypto.randomUUID(),
          user_id: user.id,
          name: user.name,
          conversation_id: roomId,
          body,
          created_at: new Date().toISOString(),
          pending: true,
          version: 0,
          attachments,
          reply_to_id: reply?.id || null,
          reply_preview: reply
            ? {
                id: reply.id,
                user_id: reply.user_id,
                name: reply.name,
                body: reply.body,
              }
            : null,
          field_card: sharedField
            ? {
                field_id: sharedField.id,
                name: sharedField.name,
                area_ha: sharedField.area_ha,
              }
            : null,
        };
    stickToBottom.current = true;
    addMessages([message]);
    if (!retry) {
      setText("");
      setReply(null);
      setAttachments([]);
      setSharedField(null);
      void writeOffline("chat:draft:" + roomId, { text: "" });
      void api(`/conversations/${roomId}/typing`, {
        method: "POST",
        body: '{"typing":false}',
      }).catch(() => {});
    }
    try {
      const saved = await api<Message>(`/conversations/${roomId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          body,
          client_id: message.client_id,
          reply_to_id: message.reply_to_id,
          attachments: message.attachments?.map((a) => a.id),
          field_id: message.field_card?.field_id,
        }),
      });
      if (currentRoom.current === roomId) addMessages([saved]);
    } catch (e) {
      if (currentRoom.current === roomId) {
        addMessages([{ ...message, pending: false, failed: true }]);
        setError(
          navigator.onLine
            ? (e as Error).message
            : "Нет связи. Сообщение сохранено на устройстве — повторите отправку после подключения.",
        );
      }
    }
  }
  async function loadMore() {
    const first = messages.find((m) => m.id > 0);
    if (!first || loadingOlder) return;
    setLoadingOlder(true);
    const roomId = selected,
      height = scroller.current?.scrollHeight || 0;
    try {
      const older = await api<Message[]>(
        `/conversations/${roomId}/messages?before=${first.id}`,
      );
      if (currentRoom.current !== roomId) return;
      stickToBottom.current = false;
      addMessages(older);
      setMore(older.length === 50);
      requestAnimationFrame(() => {
        if (scroller.current)
          scroller.current.scrollTop += scroller.current.scrollHeight - height;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingOlder(false);
    }
  }
  async function uploadFile(file: File) {
    const roomId = selected;
    if (!roomId) return;
    if (attachments.length >= 6) {
      setError("В одном сообщении можно отправить до шести вложений.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Выберите фото, PDF или TXT до 5 МБ.");
      return;
    }
    setUploading(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    try {
      const attached = await api<ChatAttachment>(
        `/conversations/${roomId}/attachments`,
        { method: "POST", body: form },
      );
      if (currentRoom.current === roomId)
        setAttachments((old) => [...old, attached]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  async function removeMessage(message: Message) {
    setActions(null);
    try {
      const removed = await api<Message>(
        `/conversations/${selected}/messages/${message.id}?version=${message.version || 1}`,
        { method: "DELETE" },
      );
      addMessages([removed]);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function react(message: Message, emoji: string) {
    setActions(null);
    const mine = message.reactions
      ?.find((r) => r.emoji === emoji)
      ?.user_ids.includes(user.id);
    try {
      const saved = await api<Message>(
        `/conversations/${selected}/messages/${message.id}/reactions`,
        { method: mine ? "DELETE" : "PUT", body: JSON.stringify({ emoji }) },
      );
      addMessages([saved]);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function forwardTo(target: Conversation) {
    if (!forward) return;
    try {
      await api(`/conversations/${target.id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          body: forward.body || "Пересланное сообщение",
          client_id: crypto.randomUUID(),
          forward_message_id: forward.id,
        }),
      });
      setForward(null);
      setNotice("Переслано в «" + target.title + "»");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function find(event: React.FormEvent) {
    event.preventDefault();
    try {
      setFound(await api("/users/search?q=" + encodeURIComponent(search)));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function create() {
    try {
      const conversation = await api<Conversation>("/conversations", {
        method: "POST",
        body: JSON.stringify({
          kind: group ? "group" : "direct",
          title: group ? title : chosenMembers[0]?.name || "Личный чат",
          member_ids: chosenMembers.map((m) => m.id),
        }),
      });
      setSelected(conversation.id);
      setNewChat(false);
      cs.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const activeTypers = Object.values(typers);
  const status =
    connection === "offline"
      ? "Нет связи · сохранённая переписка"
      : connection !== "live"
        ? "Восстанавливаем связь…"
        : activeTypers.length
          ? activeTypers.map((t) => t.name.split(" ")[0]).join(", ") +
            " печатает…"
          : room?.kind === "direct" && otherMembers[0]
            ? otherMembers[0].online
              ? "В сети"
              : otherMembers[0].last_seen
                ? "Был(а) " +
                  day(otherMembers[0].last_seen) +
                  " в " +
                  clock(otherMembers[0].last_seen)
                : "Не в сети"
            : `${members.length} участников · ${otherMembers.filter((m) => m.online).length} в сети`;
  return (
    <div className={"egin-chat " + (selected ? "has-room" : "")}>
      <PageHead
        eyebrow="ЛЮДИ, КОТОРЫЕ ПОНИМАЮТ"
        title="Сообщество"
        description="Обсуждайте сезон, делитесь опытом и своими полями."
        action={
          <Button variant="secondary" onClick={() => setNewChat(!newChat)}>
            <Plus size={18} />
            Новый чат
          </Button>
        }
      />
      {error && (
        <ErrorBox
          message={error}
          onRetry={() => {
            setError("");
            cs.reload();
            if (selected) refreshRoom((value) => value + 1);
          }}
        />
      )}
      {notice && (
        <div className="chat-notice" role="status">
          {notice}
        </div>
      )}
      {newChat && (
        <section className="panel new-chat" aria-label="Новая переписка">
          <form className="search-input" onSubmit={find}>
            <Search size={18} />
            <input
              aria-label="Поиск собеседника"
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
                setChosenMembers([]);
              }}
            />
            Групповой чат
          </label>
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
            {found
              .filter((p) => p.id !== user.id)
              .map((person) => (
                <button
                  key={person.id}
                  className={
                    chosenMembers.some((m) => m.id === person.id)
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setChosenMembers((old) =>
                      old.some((m) => m.id === person.id)
                        ? old.filter((m) => m.id !== person.id)
                        : group
                          ? [...old, person]
                          : [person],
                    )
                  }
                >
                  {person.name}
                </button>
              ))}
          </div>
          <Button
            disabled={!chosenMembers.length || (group && title.length < 2)}
            onClick={create}
          >
            Начать разговор
          </Button>
        </section>
      )}
      <div className={"chat-layout " + (selected ? "room-open" : "")}>
        <aside className="conversation-list">
          <div className="section-heading">
            <h2>Переписки</h2>
            <span className="count">{cs.data?.length || 0}</span>
          </div>
          <label className="chat-list-search">
            <Search size={18} />
            <input
              aria-label="Поиск переписки"
              placeholder="Найти переписку"
              value={roomFilter}
              onChange={(e) => setRoomFilter(e.target.value)}
            />
          </label>
          {cs.loading && !cs.data ? (
            <Loading />
          ) : (
            cs.data
              ?.filter((c) =>
                c.title
                  .toLocaleLowerCase()
                  .includes(roomFilter.toLocaleLowerCase()),
              )
              .map((c) => (
                <button
                  key={c.id}
                  className={
                    "conversation " + (selected === c.id ? "active" : "")
                  }
                  onClick={() => setSelected(c.id)}
                >
                  <span className="avatar">
                    {c.kind === "group" ? <Users size={23} /> : c.title[0]}
                  </span>
                  <span className="conversation-copy">
                    <strong>{c.title}</strong>
                    <small>{c.last_message || "Пока нет сообщений"}</small>
                  </span>
                  <span className="conversation-tail">
                    {c.last_message_at && (
                      <time>{clock(c.last_message_at)}</time>
                    )}
                    {c.unread_count > 0 && (
                      <span className="unread-badge">{c.unread_count}</span>
                    )}
                  </span>
                </button>
              ))
          )}
          {!cs.loading && !cs.data?.length && (
            <p className="chat-list-empty">
              Начните переписку с другим участником EGIN.
            </p>
          )}
        </aside>
        <section className="chat-room" aria-label={room?.title || "Переписка"}>
          {!selected ? (
            <div className="chat-empty">
              <MessageCircle size={52} strokeWidth={1.3} />
              <h2>Вместе растёт больше</h2>
              <p>Выберите сообщество или начните разговор.</p>
            </div>
          ) : (
            <>
              <header className="chat-room-head">
                <button
                  className="icon-button mobile-only"
                  aria-label="К списку чатов"
                  onClick={() => setSelected("")}
                >
                  <ArrowLeft size={23} />
                </button>
                <span className="avatar small">
                  {room?.kind === "group" ? (
                    <Users size={21} />
                  ) : (
                    room?.title[0]
                  )}
                </span>
                <div>
                  <strong>{room?.title || "Переписка"}</strong>
                  <small aria-live="polite">
                    <i
                      className={
                        "status-dot " + (connection !== "live" ? "offline" : "")
                      }
                    />
                    {status}
                  </small>
                </div>
              </header>
              <div
                className="messages"
                ref={scroller}
                onScroll={() => {
                  const near = nearBottom();
                  stickToBottom.current = near;
                  setAwayFromBottom(!near);
                  if (near) {
                    setNewCount(0);
                    markRead(
                      selected,
                      messages.filter((m) => m.id > 0).at(-1)?.id || 0,
                    );
                  }
                }}
              >
                {loading && <Loading />}
                {more && (
                  <button
                    className="load-history"
                    onClick={loadMore}
                    disabled={loadingOlder}
                  >
                    {loadingOlder ? "Загружаем…" : "Загрузить предыдущие"}
                  </button>
                )}
                {!loading && messages.length === 0 && (
                  <p className="chat-first-message">
                    Здесь начинается разговор. Напишите первым.
                  </p>
                )}
                {messages.map((m, index) => {
                  const own = m.user_id === user.id,
                    read =
                      own &&
                      otherMembers.some((p) => p.last_read_id >= m.id) &&
                      m.id > 0;
                  return (
                    <div key={m.client_id} className="message-group">
                      {(index === 0 ||
                        day(messages[index - 1].created_at) !==
                          day(m.created_at)) && (
                        <div className="chat-date">
                          <time>{day(m.created_at)}</time>
                        </div>
                      )}
                      {unreadBoundary === m.id && (
                        <div className="chat-unread-divider">
                          Новые сообщения
                        </div>
                      )}
                      <article
                        id={"message-" + m.id}
                        className={
                          "message " +
                          (own ? "own " : "") +
                          (m.deleted_at ? "deleted" : "")
                        }
                        data-message-id={m.id}
                      >
                        <div className="message-top">
                          <span className="message-author">
                            {own ? "Вы" : m.name}
                          </span>
                          {!m.pending && !m.failed && !m.deleted_at && (
                            <button
                              className="message-menu-button"
                              aria-label={"Действия с сообщением " + m.id}
                              onClick={() =>
                                setActions(actions?.id === m.id ? null : m)
                              }
                            >
                              <MoreHorizontal size={20} />
                            </button>
                          )}
                        </div>
                        {m.forwarded_from && !m.deleted_at && (
                          <span className="chat-forwarded">
                            <Forward size={13} />
                            Пересланное сообщение
                          </span>
                        )}
                        {m.reply_preview && !m.deleted_at && (
                          <button
                            className="chat-quote"
                            onClick={() =>
                              document
                                .getElementById(
                                  "message-" + m.reply_preview!.id,
                                )
                                ?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "center",
                                })
                            }
                          >
                            <strong>{m.reply_preview.name}</strong>
                            <span>
                              {m.reply_preview.deleted_at
                                ? "Сообщение удалено"
                                : m.reply_preview.body || "Вложение"}
                            </span>
                          </button>
                        )}
                        {m.deleted_at ? (
                          <p className="deleted-text">Сообщение удалено</p>
                        ) : (
                          <>
                            {m.field_card && (
                              <Link
                                className="chat-field-card"
                                href={"/fields/" + m.field_card.field_id}
                              >
                                <FieldThumbnail
                                  geometry={m.field_card.geometry}
                                />
                                <span>
                                  <strong>{m.field_card.name}</strong>
                                  <small>
                                    {fmt(m.field_card.area_ha)} га
                                    {m.field_card.region
                                      ? " · " + m.field_card.region
                                      : ""}
                                  </small>
                                  <small>Открыть поле →</small>
                                </span>
                              </Link>
                            )}
                            {m.attachments?.map((file) => (
                              <a
                                key={file.id}
                                className={"chat-attachment " + file.kind}
                                href={attachmentURL(file)}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={
                                  "Открыть вложение: " + file.filename
                                }
                              >
                                {file.kind === "image" ? (
                                  <img
                                    src={attachmentURL(file)}
                                    alt={file.filename}
                                    loading="lazy"
                                    width={300}
                                    height={225}
                                  />
                                ) : (
                                  <>
                                    <FileText size={28} />
                                    <span>
                                      <strong>{file.filename}</strong>
                                      <small>
                                        {Math.max(
                                          1,
                                          Math.round(file.size / 1024),
                                        )}{" "}
                                        КБ · Открыть
                                      </small>
                                    </span>
                                  </>
                                )}
                              </a>
                            ))}
                            {m.body && <p>{m.body}</p>}
                            {!!m.reactions?.length && (
                              <div className="chat-reactions">
                                {m.reactions.map((reaction) => (
                                  <button
                                    key={reaction.emoji}
                                    className={
                                      reaction.user_ids.includes(user.id)
                                        ? "mine"
                                        : ""
                                    }
                                    aria-label={
                                      "Реакция " +
                                      reaction.emoji +
                                      ": " +
                                      reaction.count
                                    }
                                    onClick={() => react(m, reaction.emoji)}
                                  >
                                    {reaction.emoji} {reaction.count}
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                        <div className="message-meta">
                          {m.edited_at && !m.deleted_at && (
                            <span>изменено</span>
                          )}
                          <time>{clock(m.created_at)}</time>
                          {own &&
                            (m.pending ? (
                              <span>Отправка…</span>
                            ) : m.failed ? (
                              <button onClick={() => send(undefined, m)}>
                                <RotateCcw size={15} />
                                Повторить
                              </button>
                            ) : read ? (
                              <span
                                className="message-read"
                                aria-label="Прочитано"
                              >
                                <CheckCheck size={17} />
                              </span>
                            ) : (
                              <span aria-label="Отправлено">
                                <Check size={17} />
                              </span>
                            ))}
                        </div>
                        {actions?.id === m.id && (
                          <div
                            className="message-actions"
                            role="menu"
                            aria-label="Действия с сообщением"
                          >
                            <div
                              className="reaction-picker"
                              aria-label="Выбрать реакцию"
                            >
                              {reactions.map((emoji) => (
                                <button
                                  key={emoji}
                                  onClick={() => react(m, emoji)}
                                  aria-label={"Добавить реакцию " + emoji}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                            <button
                              role="menuitem"
                              onClick={() => {
                                setReply(m);
                                setEditing(null);
                                setActions(null);
                                input.current?.focus();
                              }}
                            >
                              <Reply size={18} />
                              Ответить
                            </button>
                            <button
                              role="menuitem"
                              onClick={() => {
                                void navigator.clipboard
                                  .writeText(m.body)
                                  .then(() => setNotice("Текст скопирован"))
                                  .catch(() =>
                                    setError(
                                      "Не удалось скопировать текст. Выделите его в сообщении.",
                                    ),
                                  );
                                setActions(null);
                              }}
                            >
                              <Copy size={18} />
                              Копировать
                            </button>
                            <button
                              role="menuitem"
                              onClick={() => {
                                setForward(m);
                                setActions(null);
                              }}
                            >
                              <Forward size={18} />
                              Переслать
                            </button>
                            {own && (
                              <>
                                <button
                                  role="menuitem"
                                  onClick={() => {
                                    setEditing(m);
                                    setText(m.body);
                                    setReply(null);
                                    setActions(null);
                                    input.current?.focus();
                                  }}
                                >
                                  <Pencil size={18} />
                                  Изменить
                                </button>
                                <button
                                  role="menuitem"
                                  className="danger"
                                  onClick={() => removeMessage(m)}
                                >
                                  <Trash2 size={18} />
                                  Удалить
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </article>
                    </div>
                  );
                })}
                <div ref={bottom} className="chat-bottom-anchor" />
              </div>
              {awayFromBottom && (
                <button
                  className="chat-scroll-bottom"
                  onClick={() => {
                    scrollBottom(true);
                    markRead(
                      selected,
                      messages.filter((m) => m.id > 0).at(-1)?.id || 0,
                    );
                  }}
                  aria-label="К последним сообщениям"
                >
                  <ArrowDown size={20} />
                  {newCount > 0 && <span>{newCount}</span>}
                </button>
              )}
              {(reply ||
                editing ||
                sharedField ||
                attachments.length > 0 ||
                uploading) && (
                <div className="chat-compose-context">
                  {(reply || editing) && (
                    <div>
                      <Reply size={18} />
                      <span>
                        <strong>
                          {editing
                            ? "Изменение сообщения"
                            : "Ответ: " + reply?.name}
                        </strong>
                        <small>{(editing || reply)?.body || "Вложение"}</small>
                      </span>
                      <button
                        aria-label="Отменить ответ или изменение"
                        onClick={() => {
                          setReply(null);
                          if (editing) setText("");
                          setEditing(null);
                        }}
                      >
                        <X size={19} />
                      </button>
                    </div>
                  )}
                  {sharedField && (
                    <div>
                      <MapPin size={19} />
                      <span>
                        {sharedField.name} · {fmt(sharedField.area_ha)} га
                      </span>
                      <button
                        aria-label="Убрать поле из сообщения"
                        onClick={() => setSharedField(null)}
                      >
                        <X size={19} />
                      </button>
                    </div>
                  )}
                  {attachments.map((file) => (
                    <div key={file.id}>
                      <Paperclip size={18} />
                      <span>{file.filename}</span>
                      <button
                        aria-label={"Убрать вложение " + file.filename}
                        onClick={() =>
                          setAttachments((old) =>
                            old.filter((f) => f.id !== file.id),
                          )
                        }
                      >
                        <X size={19} />
                      </button>
                    </div>
                  ))}
                  {uploading && <div role="status">Загружаем вложение…</div>}
                </div>
              )}
              <form className="message-form" onSubmit={send}>
                <input
                  ref={upload}
                  type="file"
                  className="chat-file-input"
                  aria-label="Прикрепить файл"
                  accept="image/jpeg,image/png,image/webp,.pdf,.txt"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadFile(file);
                    e.target.value = "";
                  }}
                />
                <div className="chat-compose-tools">
                  <button
                    type="button"
                    aria-label="Добавить фото или документ"
                    title="Фото или документ"
                    disabled={uploading || Boolean(editing)}
                    onClick={() => upload.current?.click()}
                  >
                    <Paperclip size={23} />
                  </button>
                  <button
                    type="button"
                    aria-label="Поделиться полем"
                    title="Поделиться полем"
                    disabled={Boolean(editing)}
                    onClick={() => setFieldPicker(true)}
                  >
                    <MapPin size={22} />
                  </button>
                </div>
                <textarea
                  ref={input}
                  aria-label="Сообщение"
                  rows={1}
                  maxLength={6000}
                  value={text}
                  onChange={(e) => typing(e.target.value)}
                  placeholder="Напишите сообщение…"
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing &&
                      !matchMedia("(pointer: coarse)").matches
                    ) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <Button
                  type="submit"
                  disabled={
                    uploading ||
                    (!text.trim() && !attachments.length && !sharedField)
                  }
                  aria-label={
                    editing ? "Сохранить изменение" : "Отправить сообщение"
                  }
                >
                  {editing ? <Check size={22} /> : <Send size={21} />}
                </Button>
              </form>
            </>
          )}
        </section>
      </div>
      {(forward || fieldPicker) && (
        <div
          className="chat-modal-backdrop"
          onClick={() => {
            setForward(null);
            setFieldPicker(false);
          }}
        >
          <section
            className="chat-modal"
            role="dialog"
            aria-modal="true"
            aria-label={forward ? "Переслать сообщение" : "Поделиться полем"}
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h2>{forward ? "Куда переслать?" : "Выберите поле"}</h2>
              <button
                aria-label="Закрыть окно"
                onClick={() => {
                  setForward(null);
                  setFieldPicker(false);
                }}
              >
                <X size={22} />
              </button>
            </header>
            {forward ? (
              cs.data?.map((c) => (
                <button
                  className="chat-picker-row"
                  key={c.id}
                  onClick={() => forwardTo(c)}
                >
                  <Users size={22} />
                  <span>{c.title}</span>
                  <Forward size={20} />
                </button>
              ))
            ) : fields.loading ? (
              <Loading />
            ) : fields.error ? (
              <ErrorBox message={fields.error} onRetry={fields.reload} />
            ) : (
              fields.data?.map((field) => (
                <button
                  className="chat-picker-row"
                  key={field.id}
                  onClick={() => {
                    setSharedField(field);
                    setFieldPicker(false);
                    input.current?.focus();
                  }}
                >
                  <MapPin size={24} />
                  <span>
                    <strong>{field.name}</strong>
                    <small>{fmt(field.area_ha)} га</small>
                  </span>
                  <Plus size={20} />
                </button>
              ))
            )}
          </section>
        </div>
      )}
    </div>
  );
}
