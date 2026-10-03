"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  ChevronRight,
  MessageCircle,
  Search,
  Send,
  Users,
  X,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { apiUrl } from "@/lib/api";
import type { PlatformLanguage } from "@/lib/i18n";
type ChatListItem = {
  id: string;
  type: string;
  title: string;
  listingId: string | null;
  participantCount: number;
  participants: Array<{
    userId: string;
    fullName: string;
    role: string | null;
    region: string | null;
  }>;
  channel: {
    key: string;
    label: string;
    scope: string;
    region: string | null;
    district: string | null;
    village: string | null;
    cropType: string | null;
    isModerated: boolean;
  } | null;
  lastMessage: {
    id: string;
    body: string;
    senderId: string;
    createdAt: string;
  } | null;
};

type ChatDetail = {
  id: string;
  type: string;
  title: string;
  listingId: string | null;
  participantCount: number;
  participants: Array<{
    userId: string;
    fullName: string;
    role: string | null;
    region: string | null;
  }>;
  channel: {
    key: string;
    label: string;
    scope: string;
    region: string | null;
    district: string | null;
    village: string | null;
    cropType: string | null;
    isModerated: boolean;
  } | null;
  messages: Array<{
    id: string;
    senderId: string;
    senderName?: string;
    body: string;
    type: string;
    createdAt: string;
  }>;
};

interface ChatOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  language: PlatformLanguage;
  currentUserId: string | null;
  preferredChatId?: string | null;
  onOpenMarket?: () => void;
}

export function ChatOverlay({
  isOpen,
  onClose,
  language,
  currentUserId,
  preferredChatId,
  onOpenMarket,
}: ChatOverlayProps) {
  const kk = language === "kk";
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeChat, setActiveChat] = useState<ChatDetail | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [listError, setListError] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [viewport, setViewport] = useState<{
    height: number;
    top: number;
  } | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const followLatest = useRef(true);
  const sendLock = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const draft = selectedId ? drafts[selectedId] || "" : "";
  const conversation = activeChat?.id === selectedId ? activeChat : null;
  const sending = sendingId !== null;
  const locale = kk ? "kk-KZ" : "ru-RU";
  const copy = {
    title: kk ? "Хабарламалар" : "Сообщения",
    close: kk ? "Жабу" : "Закрыть",
    back: kk ? "Артқа" : "Назад",
    retry: kk ? "Қайталау" : "Повторить",
    loadError: kk
      ? "Хабарламалар жүктелмеді. Интернетті тексеріп, қайталаңыз."
      : "Не удалось загрузить сообщения. Проверьте интернет и попробуйте снова.",
  };

  useEffect(() => {
    if (!isOpen) return;
    returnFocus.current = document.activeElement as HTMLElement;
    setSelectedId(preferredChatId || null);
    setSendError(null);
    const updateViewport = () => {
      const visual = window.visualViewport;
      if (visual) setViewport({ height: visual.height, top: visual.offsetTop });
    };
    updateViewport();
    window.visualViewport?.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("scroll", updateViewport);
    return () => {
      window.visualViewport?.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("scroll", updateViewport);
    };
  }, [isOpen, preferredChatId]);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    let busy = false;
    setListLoading(true);
    const load = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const token = localStorage.getItem("agro_token");
        if (!token) throw new Error("No session");
        const res = await fetch(apiUrl("/chats"), {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok || !Array.isArray(json.data))
          throw new Error("Could not load chats");
        if (!controller.signal.aborted) {
          setChats(json.data);
          setListError(false);
        }
      } catch {
        if (!controller.signal.aborted) setListError(true);
      } finally {
        busy = false;
        if (!controller.signal.aborted) setListLoading(false);
      }
    };
    void load();
    const interval = window.setInterval(load, 12000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [isOpen, refresh]);

  useEffect(() => {
    if (!isOpen || !selectedId) return;
    const controller = new AbortController();
    let busy = false;
    setDetailLoading(true);
    setDetailError(false);
    const load = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const token = localStorage.getItem("agro_token");
        if (!token) throw new Error("No session");
        const res = await fetch(apiUrl(`/chats/${selectedId}/messages`), {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok || !json.data || !Array.isArray(json.data.messages))
          throw new Error("Could not load messages");
        if (!controller.signal.aborted) {
          setActiveChat(json.data);
          setDetailError(false);
        }
      } catch {
        if (!controller.signal.aborted) setDetailError(true);
      } finally {
        busy = false;
        if (!controller.signal.aborted) setDetailLoading(false);
      }
    };
    void load();
    const interval = window.setInterval(load, 12000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [isOpen, selectedId, refresh]);

  useEffect(() => {
    const container = messagesRef.current;
    if (container && followLatest.current)
      container.scrollTop = container.scrollHeight;
  }, [conversation?.messages, selectedId]);

  const selectChat = (id: string | null) => {
    followLatest.current = true;
    setSelectedId(id);
    setSendError(null);
  };

  const sendMessage = async () => {
    if (!selectedId || !conversation || !draft.trim() || sendLock.current)
      return;
    const chatId = selectedId;
    const body = draft.trim();
    const token = localStorage.getItem("agro_token");
    if (!token) return;
    sendLock.current = true;
    setSendingId(chatId);
    setSendError(null);
    try {
      const res = await fetch(apiUrl(`/chats/${chatId}/messages`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body, type: "text" }),
      });
      if (!res.ok) throw new Error("Send failed");
      setDrafts((previous) => ({
        ...previous,
        [chatId]: previous[chatId]?.trim() === body ? "" : previous[chatId],
      }));
      followLatest.current = true;
      setRefresh((value) => value + 1);
    } catch {
      setSendError(chatId);
    } finally {
      sendLock.current = false;
      setSendingId(null);
    }
  };

  const formatTime = (date: string) =>
    new Date(date).toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
  const formatDay = (date: string) =>
    new Date(date).toLocaleDateString(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  const filteredChats = chats.filter((chat) =>
    chat.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const quickReplies = conversation?.channel
    ? kk
      ? ["Бүгінгі баға қандай?", "Жеткізу бар ма?"]
      : ["Какая цена сегодня?", "Есть доставка по району?"]
    : kk
      ? ["Сәлеметсіз бе! Бар ма?", "Бағасы қанша?", "Жеткізу бар ма?"]
      : ["Здравствуйте! Есть в наличии?", "Какая цена?", "Есть доставка?"];

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-[#102b1b]/45" />
        <Dialog.Content
          className="chat-dialog fixed inset-x-0 z-[71] flex flex-col bg-background text-foreground md:inset-x-6 md:mx-auto md:max-w-5xl md:rounded-2xl"
          style={
            viewport
              ? { top: viewport.top, height: viewport.height }
              : { top: 0, height: "100dvh" }
          }
          aria-describedby="chat-description"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById("chat-close")?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (selectedId && window.matchMedia("(max-width: 767px)").matches) {
              event.preventDefault();
              selectChat(null);
            }
          }}
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] md:rounded-t-2xl">
            <div>
              <Dialog.Title className="text-xl font-bold">
                {copy.title}
              </Dialog.Title>
              <Dialog.Description id="chat-description" className="sr-only">
                {kk
                  ? "Фермерлермен және сатып алушылармен сөйлесу"
                  : "Переписка с фермерами и покупателями"}
              </Dialog.Description>
            </div>
            <Dialog.Close id="chat-close" className="secondary-action">
              <X className="size-5" aria-hidden="true" />
              <span>{copy.close}</span>
            </Dialog.Close>
          </header>
          <div className="flex min-h-0 flex-1">
            <section
              aria-label={kk ? "Чаттар тізімі" : "Список бесед"}
              className={`${selectedId ? "hidden md:flex" : "flex"} min-h-0 w-full flex-col bg-card md:w-80 md:shrink-0 md:border-r md:border-border`}
            >
              <div className="p-4">
                <label
                  htmlFor="chat-search"
                  className="mb-2 block text-sm font-medium"
                >
                  {kk ? "Чатты іздеу" : "Найти беседу"}
                </label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-3.5 size-5 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <input
                    id="chat-search"
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={
                      kk ? "Аты немесе чат атауы" : "Имя или название чата"
                    }
                    className="min-h-12 w-full rounded-xl border border-border bg-background py-3 pl-10 pr-3 text-base"
                  />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
                {listError && (
                  <div role="alert" className="m-2 rounded-xl bg-muted p-4">
                    <p>{copy.loadError}</p>
                    <button
                      className="secondary-action mt-3"
                      onClick={() => setRefresh((value) => value + 1)}
                    >
                      <RefreshCw className="size-5" aria-hidden="true" />
                      {copy.retry}
                    </button>
                  </div>
                )}
                {listLoading && !chats.length ? (
                  <p className="p-4" role="status">
                    {kk ? "Чаттар жүктелуде…" : "Загружаем беседы…"}
                  </p>
                ) : filteredChats.length ? (
                  filteredChats.map((chat) => (
                    <button
                      key={chat.id}
                      onClick={() => selectChat(chat.id)}
                      aria-current={selectedId === chat.id ? "true" : undefined}
                      className={`mb-1 flex min-h-24 w-full items-start gap-3 rounded-xl p-3 text-left transition-colors ${selectedId === chat.id ? "bg-muted" : "hover:bg-muted"}`}
                    >
                      {chat.channel ? (
                        <Users
                          className="mt-1 size-6 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                      ) : (
                        <MessageCircle
                          className="mt-1 size-6 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-semibold">
                          {chat.title}
                        </span>
                        <span className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">
                          {chat.lastMessage?.body ||
                            (kk
                              ? "Алғашқы хабарламаны жазыңыз"
                              : "Напишите первое сообщение")}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {chat.channel
                            ? kk
                              ? "Фермерлер тобы"
                              : "Группа фермеров"
                            : kk
                              ? "Жеке хат алмасу"
                              : "Личная переписка"}
                          {chat.lastMessage
                            ? ` · ${new Date(chat.lastMessage.createdAt).toLocaleDateString(locale, { day: "numeric", month: "short" })}`
                            : ""}
                        </span>
                      </span>
                      <ChevronRight
                        className="mt-1 size-5 shrink-0"
                        aria-hidden="true"
                      />
                    </button>
                  ))
                ) : (
                  !listError && (
                    <div className="px-4 py-8">
                      <MessageCircle
                        className="mb-4 size-9 text-primary"
                        aria-hidden="true"
                      />
                      <h2 className="section-title">
                        {search
                          ? kk
                            ? "Чат табылмады"
                            : "Беседа не найдена"
                          : kk
                            ? "Әзірге хат алмасу жоқ"
                            : "Здесь будут ваши беседы"}
                      </h2>
                      <p className="mt-3 leading-relaxed text-muted-foreground">
                        {search
                          ? kk
                            ? "Басқа атауды енгізіңіз."
                            : "Попробуйте другое имя или название."
                          : kk
                            ? "Базарда хабарландыруды ашып, сатушыға жазыңыз."
                            : "Откройте объявление на рынке и напишите продавцу."}
                      </p>
                      {!search && onOpenMarket && (
                        <button
                          className="primary-action mt-4"
                          onClick={onOpenMarket}
                        >
                          {kk ? "Базарға өту" : "Перейти на рынок"}
                        </button>
                      )}
                    </div>
                  )
                )}
              </div>
            </section>
            <section
              aria-label={kk ? "Хат алмасу" : "Переписка"}
              className={`${selectedId ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-1 flex-col`}
            >
              {!selectedId ? (
                <div className="m-auto max-w-sm p-8 text-center">
                  <MessageCircle
                    className="mx-auto mb-4 size-10 text-primary"
                    aria-hidden="true"
                  />
                  <h2 className="section-title">
                    {kk ? "Чатты таңдаңыз" : "Выберите беседу"}
                  </h2>
                  <p className="mt-3 text-muted-foreground">
                    {kk
                      ? "Хабарламаларды көру үшін сол жақтағы атты басыңыз."
                      : "Нажмите на имя слева, чтобы прочитать сообщения."}
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-3 py-2">
                    <button
                      onClick={() => selectChat(null)}
                      className="secondary-action px-3 md:hidden"
                    >
                      <ArrowLeft className="size-5" aria-hidden="true" />
                      {copy.back}
                    </button>
                    <div className="min-w-0 py-1">
                      <h2 className="truncate text-base font-semibold">
                        {conversation?.title ||
                          chats.find((chat) => chat.id === selectedId)?.title ||
                          (kk ? "Чат" : "Беседа")}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {conversation?.channel
                          ? `${conversation.participantCount} ${kk ? "қатысушы" : "участников"}`
                          : kk
                            ? "Жеке хат алмасу"
                            : "Личная переписка"}
                      </p>
                    </div>
                  </div>
                  {detailError && (
                    <div
                      role="alert"
                      className="shrink-0 border-b border-border bg-card px-4 py-3"
                    >
                      <p className="text-sm">{copy.loadError}</p>
                      <button
                        className="secondary-action mt-2"
                        onClick={() => setRefresh((value) => value + 1)}
                      >
                        {copy.retry}
                      </button>
                    </div>
                  )}
                  <div
                    ref={messagesRef}
                    onScroll={(event) => {
                      const el = event.currentTarget;
                      followLatest.current =
                        el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                    }}
                    className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
                  >
                    {detailLoading && !conversation ? (
                      <p role="status">
                        {kk
                          ? "Хабарламалар жүктелуде…"
                          : "Загружаем сообщения…"}
                      </p>
                    ) : conversation?.messages.length ? (
                      <div
                        role="log"
                        aria-label={copy.title}
                        aria-live="polite"
                        aria-relevant="additions"
                        className="space-y-3"
                      >
                        {conversation.messages.map((message, index) => {
                          const mine = message.senderId === currentUserId;
                          const day = formatDay(message.createdAt);
                          const showDay =
                            index === 0 ||
                            day !==
                              formatDay(
                                conversation.messages[index - 1].createdAt,
                              );
                          return (
                            <div key={message.id}>
                              {showDay && (
                                <p className="py-3 text-center text-xs text-muted-foreground">
                                  {day}
                                </p>
                              )}
                              <div
                                className={`flex ${mine ? "justify-end" : "justify-start"}`}
                              >
                                <div
                                  className={`max-w-[88%] rounded-2xl px-4 py-3 ${mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm border border-border bg-card text-card-foreground"}`}
                                >
                                  <p className="sr-only">
                                    {mine
                                      ? kk
                                        ? "Сіз"
                                        : "Вы"
                                      : message.senderName}
                                  </p>
                                  {conversation.channel && !mine && (
                                    <p className="mb-1 text-sm font-semibold text-primary">
                                      {message.senderName ||
                                        (kk ? "Қатысушы" : "Участник")}
                                    </p>
                                  )}
                                  <p className="whitespace-pre-wrap break-words text-base leading-relaxed [overflow-wrap:anywhere]">
                                    {message.body}
                                  </p>
                                  <time
                                    dateTime={message.createdAt}
                                    className={`mt-1 block text-right text-xs ${mine ? "text-white/85" : "text-muted-foreground"}`}
                                  >
                                    {formatTime(message.createdAt)}
                                  </time>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      conversation && (
                        <div className="py-6 text-center">
                          <h3 className="text-lg font-semibold">
                            {kk ? "Әңгіме бастаңыз" : "Начните разговор"}
                          </h3>
                          <p className="mt-2 text-muted-foreground">
                            {kk
                              ? "Хабарлама жазыңыз немесе төмендегі сұрақты таңдаңыз."
                              : "Напишите сообщение или выберите готовый вопрос ниже."}
                          </p>
                        </div>
                      )
                    )}
                  </div>
                  {conversation && (
                    <form
                      className="chat-composer shrink-0 border-t border-border bg-card px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void sendMessage();
                      }}
                    >
                      {!conversation.messages.length && (
                        <details className="mb-3">
                          <summary className="min-h-11 cursor-pointer py-2 font-medium">
                            {kk ? "Дайын сұрақтар" : "Готовые вопросы"}
                          </summary>
                          <div className="flex flex-wrap gap-2 py-2">
                            {quickReplies.map((reply) => (
                              <button
                                type="button"
                                key={reply}
                                onClick={() => {
                                  setDrafts((previous) => ({
                                    ...previous,
                                    [selectedId]: reply,
                                  }));
                                  composerRef.current?.focus();
                                }}
                                className="secondary-action text-sm"
                              >
                                {reply}
                              </button>
                            ))}
                          </div>
                        </details>
                      )}
                      {sendError === selectedId && (
                        <p role="alert" className="mb-3 text-sm text-red-800">
                          {kk
                            ? "Жіберілмеді. Мәтін сақталды. Интернетті тексеріп, қайта жіберіңіз."
                            : "Не удалось отправить. Текст сохранён. Проверьте интернет и нажмите «Отправить» ещё раз."}
                        </p>
                      )}
                      <label
                        htmlFor="chat-message"
                        className="mb-2 block text-sm font-medium"
                      >
                        {kk ? "Сіздің хабарламаңыз" : "Ваше сообщение"}
                      </label>
                      <div className="flex items-end gap-2">
                        <textarea
                          ref={composerRef}
                          id="chat-message"
                          rows={2}
                          maxLength={conversation.channel ? 500 : 1000}
                          value={draft}
                          onChange={(event) =>
                            setDrafts((previous) => ({
                              ...previous,
                              [selectedId]: event.target.value,
                            }))
                          }
                          placeholder={
                            kk ? "Осында жазыңыз…" : "Напишите здесь…"
                          }
                          className="min-h-14 min-w-0 flex-1 resize-none rounded-xl border border-border bg-background px-3 py-3 text-base leading-relaxed"
                          onKeyDown={(event) => {
                            if (
                              event.key === "Enter" &&
                              !event.shiftKey &&
                              !event.nativeEvent.isComposing &&
                              window.matchMedia("(pointer: fine)").matches
                            ) {
                              event.preventDefault();
                              void sendMessage();
                            }
                          }}
                        />
                        <button
                          type="submit"
                          disabled={sending || !draft.trim()}
                          className="primary-action min-h-14 flex-col gap-1 px-3 text-xs sm:flex-row sm:text-base"
                        >
                          {sendingId === selectedId ? (
                            <Loader2
                              className="size-5 animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <Send className="size-5" aria-hidden="true" />
                          )}
                          <span>
                            {sendingId === selectedId
                              ? kk
                                ? "Жіберілуде"
                                : "Отправка"
                              : kk
                                ? "Жіберу"
                                : "Отправить"}
                          </span>
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
