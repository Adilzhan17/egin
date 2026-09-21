import { useEffect, useState } from "react";
import { X, Send } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { PlatformLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

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
}

export function ChatOverlay({ isOpen, onClose, language, currentUserId, preferredChatId }: ChatOverlayProps) {
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [activeChat, setActiveChat] = useState<ChatDetail | null>(null);
  const [isChatsLoading, setIsChatsLoading] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [chatMessage, setChatMessage] = useState("");

  const marketCopy =
    language === "kk"
      ? {
          chats: "Чаттар",
          chatWith: "Чат",
          chatEmpty: "Чаттар әзірге жоқ",
          chatEmptyHint: "Тауар карточкасынан сатушымен тікелей сөйлесуді бастаңыз.",
          noMessages: "Әзірге хабар жоқ",
          messagePlaceholder: "Хабарлама жазыңыз...",
          sendError: "Хабар жіберілмеді.",
          quickAvailability: "Бар ма?",
          quickQuantity: "Қанша тонна?",
          quickDelivery: "Жеткізу бар ма?",
          quickLocation: "Қайдасыз?",
          seller: "Тексерілген фермер",
        }
      : {
          chats: "Чаты",
          chatWith: "Чат",
          chatEmpty: "Чатов пока нет",
          chatEmptyHint: "Начните прямой диалог с продавцом из карточки товара.",
          noMessages: "Сообщений пока нет",
          messagePlaceholder: "Напишите сообщение...",
          sendError: "Не удалось отправить сообщение.",
          quickAvailability: "Есть в наличии?",
          quickQuantity: "Сколько тонн?",
          quickDelivery: "Доставка есть?",
          quickLocation: "Где находитесь?",
          seller: "Проверенный фермер",
        };

  const communityQuickReplies =
    language === "kk"
      ? [
          "Жақын жерде кім сатып алып жатыр?",
          "Логистика бар ма?",
          "Бүгін қандай баға жүріп тұр?",
          "Осы өңірде кімге тапсыруға болады?",
        ]
      : [
          "Кто сейчас покупает рядом?",
          "Есть ли доставка по району?",
          "Какая цена сейчас по региону?",
          "Кому можно продать локально?",
        ];

  const fetchChats = async (chatIdToSelect?: string) => {
    const token = localStorage.getItem("agro_token");
    if (!token) {
      setChats([]);
      setActiveChat(null);
      return;
    }

    setIsChatsLoading(true);
    try {
      const res = await fetch(apiUrl("/chats"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      const data = Array.isArray(json?.data) ? json.data : [];
      setChats(data);

      const targetChatId = chatIdToSelect || preferredChatId || activeChat?.id || data[0]?.id;
      if (targetChatId) {
        await openChat(targetChatId, token);
      } else {
        setActiveChat(null);
      }
    } catch {
      setChats([]);
      setActiveChat(null);
    } finally {
      setIsChatsLoading(false);
    }
  };

  const openChat = async (chatId: string, tokenArg?: string) => {
    const token = tokenArg || localStorage.getItem("agro_token");
    if (!token) return;

    try {
      const res = await fetch(apiUrl(`/chats/${chatId}/messages`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok && json?.data) {
        setActiveChat(json.data);
      }
    } catch {}
  };

  const sendMessage = async (body: string) => {
    const token = localStorage.getItem("agro_token");
    if (!token || !activeChat || !body.trim()) return;

    setIsSendingMessage(true);
    try {
      const res = await fetch(apiUrl(`/chats/${activeChat.id}/messages`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          body: body.trim(),
          type: "text",
        }),
      });

      if (!res.ok) {
        alert(marketCopy.sendError);
        return;
      }

      setChatMessage("");
      await fetchChats(activeChat.id);
    } catch {
      alert(marketCopy.sendError);
    } finally {
      setIsSendingMessage(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchChats();
    }
  }, [isOpen, preferredChatId]);

  useEffect(() => {
    if (!isOpen) return;

    const intervalId = window.setInterval(() => {
      fetchChats(activeChat?.id);
    }, 12000);

    return () => window.clearInterval(intervalId);
  }, [isOpen, activeChat?.id]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#F4EFE6] sm:p-4 md:items-center md:justify-center md:bg-black/40 md:backdrop-blur-sm">
      <div className="flex h-full w-full flex-col bg-[#F4EFE6] md:h-[90vh] md:max-w-5xl md:flex-row md:rounded-[2rem] md:overflow-hidden md:shadow-[0_30px_100px_rgba(13,30,17,0.3)]">
        {/* Chat List */}
        <div className="flex shrink-0 flex-col border-b border-black/5 bg-white/75 md:w-[20rem] md:border-b-0 md:border-r">
          <div className="flex min-h-16 items-center justify-between px-4 py-3 sm:px-5">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#2F6B3D]/65">
                {marketCopy.chats}
              </p>
              <h2 className="mt-1 text-xl font-black text-[#17381C]">
                {marketCopy.chatWith}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-12 min-w-12 items-center justify-center rounded-full bg-[#F5F1E8] text-[#17381C]"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-3 sm:px-3 md:max-h-[calc(90vh-5rem)]">
            {isChatsLoading && chats.length === 0 ? (
              <div className="px-3 py-6 text-sm text-[#2F6B3D]/60">Loading...</div>
            ) : chats.length > 0 ? (
              <div className="space-y-2">
                {chats.map((chat) => {
                  const isCommunity = Boolean(chat.channel);
                  return (
                    <button
                      key={chat.id}
                      type="button"
                      onClick={() => openChat(chat.id)}
                      className={`min-h-16 w-full rounded-2xl px-4 py-4 text-left transition-colors ${
                        activeChat?.id === chat.id
                          ? "bg-[#17381C] text-white"
                          : "bg-white text-[#17381C] hover:bg-[#F5F1E8]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex-1 truncate pr-2 text-base font-black">
                          {chat.title}
                        </p>
                        <div
                          className={`rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] ${
                            activeChat?.id === chat.id
                              ? "bg-white/10 text-white/80"
                              : "bg-[#F5F1E8] text-[#2F6B3D]/65"
                          }`}
                        >
                          {isCommunity
                            ? language === "kk" ? "Арна" : "Канал"
                            : language === "kk" ? "Чат" : "Чат"}
                        </div>
                      </div>
                      <p
                        className={`mt-1 line-clamp-2 text-sm ${
                          activeChat?.id === chat.id ? "text-white/80" : "text-[#2F6B3D]/62"
                        }`}
                      >
                        {chat.lastMessage?.body ||
                          (isCommunity
                            ? language === "kk" ? "Қауым арнасы дайын" : "Канал сообщества готов"
                            : marketCopy.noMessages)}
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl bg-white px-4 py-5 text-base text-[#2F6B3D]/72">
                <p className="font-black text-[#17381C]">{marketCopy.chatEmpty}</p>
                <p className="mt-2 text-sm">{marketCopy.chatEmptyHint}</p>
              </div>
            )}
          </div>
        </div>

        {/* Chat Detail */}
        <div className="flex min-h-0 flex-1 flex-col bg-[#F4EFE6] md:bg-white/60">
          <div className="flex min-h-16 items-center justify-between gap-3 border-b border-black/5 bg-white/60 px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#2F6B3D]/65">
                {activeChat?.channel
                  ? language === "kk" ? "Қауым арнасы" : "Канал сообщества"
                  : marketCopy.chatWith}
              </p>
              <h3 className="truncate text-lg font-black text-[#17381C]">
                {activeChat?.title ||
                  activeChat?.participants.find(
                    (participant) => participant.userId !== currentUserId
                  )?.fullName ||
                  activeChat?.participants[0]?.fullName ||
                  marketCopy.seller}
              </h3>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 md:px-5">
            {activeChat?.messages?.length ? (
              <div className="space-y-4">
                {activeChat.messages.map((message) => {
                  const isMe = message.senderId === currentUserId;
                  return (
                    <div key={message.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-[1.2rem] px-5 py-3 text-base shadow-sm ${
                          isMe ? "bg-[#17381C] text-white" : "bg-white text-[#17381C]"
                        }`}
                      >
                        {activeChat?.channel && !isMe ? (
                          <p className="mb-1 text-[11px] font-black uppercase tracking-[0.16em] opacity-70">
                            {message.senderName || "User"}
                          </p>
                        ) : null}
                        {message.body}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="rounded-2xl bg-white px-5 py-4 text-center text-base text-[#2F6B3D]/72 shadow-sm">
                  {marketCopy.noMessages}
                </div>
              </div>
            )}
          </div>

          {activeChat && (
            <div className="bg-[#F4EFE6] md:bg-transparent">
              <div className="border-t border-black/5 px-3 pt-4 sm:px-4">
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {(activeChat.channel
                    ? communityQuickReplies
                    : [
                        marketCopy.quickAvailability,
                        marketCopy.quickQuantity,
                        marketCopy.quickDelivery,
                        marketCopy.quickLocation,
                      ]
                  ).map((quickMessage) => (
                    <button
                      key={quickMessage}
                      type="button"
                      onClick={() => sendMessage(quickMessage)}
                      className="min-h-12 shrink-0 rounded-full bg-white px-4 py-2 text-sm font-black text-[#17381C] shadow-sm transition-colors hover:bg-[#F5F1E8]"
                    >
                      {quickMessage}
                    </button>
                  ))}
                </div>
              </div>
              <div className="border-t border-black/5 px-3 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:px-4 sm:pb-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <input
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        sendMessage(chatMessage);
                      }
                    }}
                    placeholder={marketCopy.messagePlaceholder}
                    className="min-h-14 min-w-0 flex-1 rounded-full border-none bg-white px-5 text-base font-semibold text-[#17381C] shadow-sm outline-none"
                  />
                  <Button
                    onClick={() => sendMessage(chatMessage)}
                    disabled={isSendingMessage || !chatMessage.trim()}
                    className="min-h-14 min-w-14 shrink-0 rounded-full bg-[#17381C] px-0 font-black text-white hover:bg-[#214a28]"
                  >
                    <Send className="size-5" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
