"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowDownAZ,
  ArrowUpZA,
  CalendarDays,
  ChevronLeft,
  Clock3,
  Eye,
  EyeOff,
  MessageCircle,
  MapPin,
  Send,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import CreateListingModal from "./create-listing-modal";
import { apiUrl } from "@/lib/api";
import { PlatformLanguage } from "@/lib/i18n";

type Listing = {
  id: string;
  cropId: string;
  category: string;
  title: string;
  description?: string;
  quantity: number;
  unit: string;
  price: number;
  currency: string;
  availableFrom: string;
  location: string;
  imageUrl?: string | null;
  deliveryAvailable?: boolean;
  deliveryNotes?: string | null;
  freshnessDays?: number | null;
  storageLifeDays?: number | null;
  storageConditions?: string | null;
  recommendedRegion?: string | null;
  saleModel?: string;
  sellerTrust?: {
    score: number;
    dealsCount: number;
    reliability: "new" | "stable" | "trusted";
  };
  farmer?: {
    id?: string;
    fullName?: string;
    region?: string;
  };
  visibilityStatus?: "visible" | "hidden";
  competitionLevel?: "low" | "medium" | "high" | null;
  visibilityReason?: string | null;
  recommendationStatus?: "healthy" | "caution" | "low_interest" | null;
  recommendationTitle?: string | null;
  recommendationMessage?: string | null;
  recommendedActions?: string[] | null;
  status?: string;
};

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

const listingVisuals = (title: string, category: string) => {
  const imageByKey: Record<string, string> = {
    "арбуз":
      "https://images.unsplash.com/photo-1589984662646-e7b2e4962f18?q=80&w=1200&auto=format&fit=crop",
    "картофель":
      "https://images.unsplash.com/photo-1518977676601-b53f82aba655?q=80&w=1200&auto=format&fit=crop",
    "пшеница":
      "https://images.unsplash.com/photo-1574323347407-2fac25d970e7?q=80&w=1200&auto=format&fit=crop",
    "морковь":
      "https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?q=80&w=1200&auto=format&fit=crop",
    "овощи":
      "https://images.unsplash.com/photo-1566385101042-1a0aa0c1268c?q=80&w=1200&auto=format&fit=crop",
    "фрукты":
      "https://plus.unsplash.com/premium_photo-1675237625695-1f92e92c2dd9?q=80&w=1200&auto=format&fit=crop",
    "зерновые":
      "https://images.unsplash.com/photo-1501430654243-c934cec2e1c0?q=80&w=1200&auto=format&fit=crop",
  };

  const key =
    Object.keys(imageByKey).find((entry) =>
      title.toLowerCase().includes(entry.toLowerCase()),
    ) ||
    Object.keys(imageByKey).find((entry) =>
      category.toLowerCase().includes(entry.toLowerCase()),
    );

  return {
    image:
      (key && imageByKey[key]) ||
      "https://images.unsplash.com/photo-1592424005167-9bb29c0b0add?q=80&w=1200&auto=format&fit=crop",
  };
};

const trustLabel = (
  reliability: Listing["sellerTrust"] extends infer T
    ? T extends { reliability: infer R }
      ? R
      : never
    : never,
  language: PlatformLanguage,
) => {
  if (reliability === "trusted") {
    return language === "kk" ? "Сенімді" : "Надежный";
  }
  if (reliability === "stable") {
    return language === "kk" ? "Тұрақты" : "Стабильный";
  }
  return language === "kk" ? "Жаңа" : "Новый";
};

const listingImage = (item: Listing) => {
  if (item.imageUrl) {
    return item.imageUrl;
  }

  return listingVisuals(item.title, item.category).image;
};

export default function MarketView({
  language = "ru",
}: {
  language: PlatformLanguage;
}) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const debounceTimeoutRef = useState<NodeJS.Timeout | null>(null)[0];

  useEffect(() => {
    if (debounceTimeoutRef) {
      clearTimeout(debounceTimeoutRef);
    }
    const timeout = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 400);
    debounceTimeoutRef.current = timeout;

    return () => clearTimeout(timeout);
  }, [searchQuery]);
  const [activeCategory, setActiveCategory] = useState("Все");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [activeChat, setActiveChat] = useState<ChatDetail | null>(null);
  const [isChatsLoading, setIsChatsLoading] = useState(false);
  const [isChatCreating, setIsChatCreating] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<"createdAt" | "price">("createdAt");
  const [sortOrder, setSortOrder] = useState<"ASC" | "DESC">("DESC");
  const [marketMode, setMarketMode] = useState<"public" | "mine">("public");

  const visibleListings = marketMode === "mine" ? myListings : listings;
  const marketCopy =
    language === "kk"
      ? {
          title: "Маркет",
          hero: "Өнімді тікелей сатып алушыға сатыңыз",
          subtitle:
            "Фермерге ыңғайлы маркет: баға, көлем, мерзім, орын және тез келіссөз.",
          listing: "Жариялау",
          search: "Дақыл, қала немесе өңірді іздеу...",
          refresh: "Жаңарту",
          newest: "Жаңа",
          cheap: "Арзан",
          expensive: "Қымбат",
          market: "Нарық",
          mine: "Менің",
          live: "Белсенділер",
          myListings: "Менің жарияланымдарым",
          hidden: "AI жасырған",
          lowInterest: "Төмен қызығушылық",
          caution: "Ескерту",
          healthy: "Нарықта дұрыс",
          visibleNow: "Қазір көрінеді",
          verified: "Тексерілгендер",
          negotiation: "Келіссөз",
          visible: "Көрінеді",
          hiddenStatus: "Жасырын",
          price: "Баға",
          quantity: "Көлем",
          currency: "Валюта",
          dealMode: "Келісім режимі",
          freshness: "Балғындық",
          storage: "Сақтау",
          delivery: "Жеткізу",
          trust: "Сенім",
          regionAdvice: "Ұсынылатын өңір",
          deals: "Мәміле",
          direct: "Тікелей келіссөз ашу",
          chats: "Чаттар",
          openChats: "Чаттарды ашу",
          chatEmpty: "Чаттар әзірге жоқ",
          chatEmptyHint: "Тауар карточкасынан сатушымен тікелей сөйлесуді бастаңыз.",
          chatLogin: "Чатты қолдану үшін жүйеге кіріңіз.",
          messagePlaceholder: "Хабарлама жазыңыз...",
          quickAvailability: "Бар ма?",
          quickQuantity: "Қанша тонна?",
          quickDelivery: "Жеткізу бар ма?",
          quickLocation: "Қайдасыз?",
          startChatError: "Чатты ашу мүмкін болмады.",
          sendError: "Хабар жіберілмеді.",
          noMessages: "Әзірге хабар жоқ",
          chatWith: "Чат",
          noMine: "Сізде әзірге жарияланым жоқ",
          noPublic: "Жарияланым табылмады",
          noMineHint:
            "Бірінші жарияланымды жасаңыз, мұнда көрінетін және жасырын позициялар шығады.",
          noPublicHint:
            "Басқа сүзгіні қолданып көріңіз немесе бірінші жарияланымды жасаңыз.",
          close: "Жабу",
          start: "Келіссөзді бастау",
          seller: "Тексерілген фермер",
          all: "Барлығы",
          vegetables: "Көкөніс",
          fruits: "Жеміс",
          grains: "Дәнді",
          other: "Басқа",
        }
      : {
          title: "Маркет",
          hero: "Продавайте напрямую покупателю",
          subtitle:
            "Удобный агро-маркет: цена, объем, срок, локация и быстрый переход к переговорам.",
          listing: "Разместить",
          search: "Поиск по культуре, городу или региону...",
          refresh: "Обновить",
          newest: "Новые",
          cheap: "Дешевле",
          expensive: "Дороже",
          market: "Рынок",
          mine: "Мои",
          live: "Активные",
          myListings: "Мои объявления",
          hidden: "Скрыто AI",
          lowInterest: "Низкий интерес",
          caution: "Предупреждение",
          healthy: "Нормально для рынка",
          visibleNow: "Видны сейчас",
          verified: "Проверенные",
          negotiation: "Переговоры",
          visible: "Видно",
          hiddenStatus: "Скрыто",
          price: "Цена",
          quantity: "Объем",
          currency: "Валюта",
          dealMode: "Режим сделки",
          freshness: "Свежесть",
          storage: "Хранение",
          delivery: "Доставка",
          trust: "Доверие",
          regionAdvice: "Регион рекомендации",
          deals: "Сделок",
          direct: "Открыть прямые переговоры",
          chats: "Чаты",
          openChats: "Открыть чаты",
          chatEmpty: "Чатов пока нет",
          chatEmptyHint: "Начните прямой диалог с продавцом из карточки товара.",
          chatLogin: "Чтобы пользоваться чатом, войдите в систему.",
          messagePlaceholder: "Напишите сообщение...",
          quickAvailability: "Есть в наличии?",
          quickQuantity: "Сколько тонн?",
          quickDelivery: "Доставка есть?",
          quickLocation: "Где находитесь?",
          startChatError: "Не удалось открыть чат.",
          sendError: "Не удалось отправить сообщение.",
          noMessages: "Сообщений пока нет",
          chatWith: "Чат",
          noMine: "У вас пока нет объявлений",
          noPublic: "Объявления не найдены",
          noMineHint:
            "Создайте первое объявление, и здесь появятся видимые и скрытые позиции.",
          noPublicHint:
            "Попробуйте другой фильтр или создайте первое объявление.",
          close: "Закрыть",
          start: "Начать переговоры",
          seller: "Проверенный фермер",
          all: "Все",
          vegetables: "Овощи",
          fruits: "Фрукты",
          grains: "Зерновые",
          other: "Прочее",
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

  const fetchChats = async (preferredChatId?: string) => {
    const token = localStorage.getItem("agro_token");
    if (!token) {
      setChats([]);
      setActiveChat(null);
      return;
    }

    setIsChatsLoading(true);
    try {
      const res = await fetch(apiUrl("/chats"), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const json = await res.json();
      const data = Array.isArray(json?.data) ? json.data : [];
      setChats(data);

      const chatIdToOpen = preferredChatId || activeChat?.id || data[0]?.id;
      if (chatIdToOpen) {
        await openChat(chatIdToOpen, token);
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
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const json = await res.json();
      if (res.ok && json?.data) {
        setActiveChat(json.data);
      }
    } catch {}
  };

  const startDirectChat = async () => {
    const token = localStorage.getItem("agro_token");
    if (!token) {
      alert(marketCopy.chatLogin);
      return;
    }

    if (!selectedListing?.farmer?.id) {
      alert(marketCopy.startChatError);
      return;
    }

    setIsChatCreating(true);
    try {
      const res = await fetch(apiUrl("/chats/direct"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          participantUserId: selectedListing.farmer.id,
          listingId: selectedListing.id,
        }),
      });
      const json = await res.json();

      if (!res.ok || !json?.data?.id) {
        alert(marketCopy.startChatError);
        return;
      }

      setSelectedListing(null);
      setIsChatOpen(true);
      await fetchChats(json.data.id);
    } catch {
      alert(marketCopy.startChatError);
    } finally {
      setIsChatCreating(false);
    }
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

  const fetchMarketData = async (manualRefresh = false) => {
    if (manualRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const queryParams = new URLSearchParams();
      if (activeCategory !== marketCopy.all) queryParams.append("category", activeCategory);
      if (searchQuery.trim()) queryParams.append("search", searchQuery.trim());
      queryParams.append("sortBy", sortBy);
      queryParams.append("sortOrder", sortOrder);

      const res = await fetch(
        apiUrl(`/marketplace/listings?${queryParams.toString()}`),
      );
      const json = await res.json();
      const token = localStorage.getItem("agro_token");

      if (res.ok) {
        const data = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
        setListings(data);
      } else {
        setListings([]);
      }

      if (token) {
        const myRes = await fetch(apiUrl("/marketplace/listings/my"), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const myJson = await myRes.json();
        if (myRes.ok) {
          const myData = Array.isArray(myJson?.data)
            ? myJson.data
            : Array.isArray(myJson)
              ? myJson
              : [];
          setMyListings(myData);
        } else {
          setMyListings([]);
        }
      } else {
        setMyListings([]);
      }
    } catch {
      setListings([]);
      setMyListings([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMarketData();
  }, [activeCategory, searchQuery, sortBy, sortOrder]);

  useEffect(() => {
    setActiveCategory(marketCopy.all);
  }, [language]);

  useEffect(() => {
    setCurrentUserId(localStorage.getItem("agro_user_id"));
  }, []);

  useEffect(() => {
    if (isChatOpen) {
      fetchChats();
    }
  }, [isChatOpen]);

  useEffect(() => {
    if (!isChatOpen) {
      return;
    }

    const intervalId = window.setInterval(() => {
      fetchChats(activeChat?.id);
    }, 12000);

    return () => window.clearInterval(intervalId);
  }, [isChatOpen, activeChat?.id]);

  const toggleSort = () => {
    if (sortBy === "createdAt") {
      setSortBy("price");
      setSortOrder("ASC");
      return;
    }

    if (sortOrder === "ASC") {
      setSortOrder("DESC");
      return;
    }

    setSortBy("createdAt");
    setSortOrder("DESC");
  };

  return (
    <div className="absolute inset-0 z-10 h-full w-full overflow-y-auto bg-[#F4EFE6] dark:bg-[#002115] dark:text-white transition-colors px-4 pt-5 pb-32 animate-in fade-in slide-in-from-bottom-4 duration-500 pointer-events-auto lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Card className="overflow-hidden rounded-[2.2rem] border-none bg-[#17381C] p-0 shadow-[0_30px_100px_rgba(13,30,17,0.28)]">
          <div className="relative">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage:
                  "url(https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=1600&auto=format&fit=crop)",
              }}
            />
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(15,47,24,0.82),rgba(15,47,24,0.35))]" />

            <div className="relative space-y-5 px-5 py-6 text-white lg:px-7 lg:py-7">
              <div className="flex items-start justify-between gap-3">
                <div className="max-w-[75%]">
                  <p className="text-[11px] font-black uppercase tracking-[0.28em] text-white/58">
                    {marketCopy.title}
                  </p>
                  <h1 className="mt-2 text-[2rem] leading-[0.96] font-black tracking-tight lg:text-4xl">
                    {marketCopy.hero}
                  </h1>
                  <p className="mt-2 text-sm leading-relaxed text-white/72 lg:max-w-2xl">
                    {marketCopy.subtitle}
                  </p>
                </div>

                <Button
                  onClick={() => setIsCreateOpen(true)}
                  className="h-12 rounded-full bg-white text-[#17381C] font-black shadow-xl hover:bg-[#F3E7C3]"
                >
                  <Plus className="mr-2 size-4" />
                  {marketCopy.listing}
                </Button>
              </div>

              <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/55" />
                  <input
                    type="text"
                    placeholder={marketCopy.search}
                    className="h-13 w-full rounded-full border border-white/12 bg-white/12 pl-11 pr-4 text-sm font-semibold text-white placeholder:text-white/45 backdrop-blur-xl outline-none"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <Button
                  onClick={() => fetchMarketData(true)}
                  className="h-13 rounded-full bg-black/20 px-5 font-black text-white backdrop-blur-xl hover:bg-black/28"
                >
                  <RefreshCw className={`mr-2 size-4 ${isRefreshing ? "animate-spin" : ""}`} />
                  {marketCopy.refresh}
                </Button>

                <Button
                  onClick={toggleSort}
                  className="h-13 rounded-full bg-black/20 px-5 font-black text-white backdrop-blur-xl hover:bg-black/28"
                >
                  {sortBy === "createdAt" ? (
                    <>
                      <Clock3 className="mr-2 size-4" />
                      {marketCopy.newest}
                    </>
                  ) : sortOrder === "ASC" ? (
                    <>
                      <ArrowDownAZ className="mr-2 size-4" />
                      {marketCopy.cheap}
                    </>
                  ) : (
                    <>
                      <ArrowUpZA className="mr-2 size-4" />
                      {marketCopy.expensive}
                    </>
                  )}
                </Button>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => setIsChatOpen(true)}
                  className="h-11 rounded-full bg-white/12 px-4 font-black text-white backdrop-blur-xl hover:bg-white/18"
                >
                  <MessageCircle className="mr-2 size-4" />
                  {marketCopy.openChats}
                </Button>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {[
                  { key: "public", label: "Рынок" },
                  { key: "mine", label: "Мои" },
                ].map((mode) => (
                  <button
                    key={mode.key}
                    onClick={() =>
                      setMarketMode(mode.key as "public" | "mine")
                    }
                    className={`min-w-fit rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.2em] transition-all ${
                      marketMode === mode.key
                        ? "bg-[#D9B44A] text-[#17381C]"
                        : "bg-black/18 text-white/75"
                    }`}
                  >
                    {mode.key === "public" ? marketCopy.market : marketCopy.mine}
                  </button>
                ))}
                {[
                  marketCopy.all,
                  marketCopy.vegetables,
                  marketCopy.fruits,
                  marketCopy.grains,
                  marketCopy.other,
                ].map((category) => (
                  <button
                    key={category}
                    onClick={() => setActiveCategory(category)}
                    className={`min-w-fit rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.2em] transition-all ${
                      activeCategory === category
                        ? "bg-white text-[#17381C]"
                        : "bg-white/12 text-white/78"
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            {
              label: marketMode === "mine" ? marketCopy.myListings : marketCopy.live,
              value: visibleListings.length,
              icon: ShoppingBasket,
            },
            {
              label: marketMode === "mine" ? marketCopy.caution : marketCopy.verified,
              value:
                marketMode === "mine"
                  ? myListings.filter(
                      (item) => item.recommendationStatus === "caution",
                    ).length
                  : listings.filter((item) => item.farmer?.fullName).length,
              icon: marketMode === "mine" ? EyeOff : ShieldCheck,
            },
            {
              label: marketMode === "mine" ? marketCopy.visibleNow : marketCopy.negotiation,
              value:
                marketMode === "mine"
                  ? myListings.filter((item) => item.visibilityStatus !== "hidden").length
                  : "1:1",
              icon: marketMode === "mine" ? Eye : Sparkles,
            },
          ].map(({ label, value, icon: Icon }) => (
            <Card
              key={label}
              className="rounded-[1.8rem] border-none bg-white/88 px-5 py-5 shadow-[0_18px_50px_rgba(13,30,17,0.08)] backdrop-blur-xl"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#2F6B3D]/45">
                  {label}
                </p>
                <Icon className="size-4 text-[#D9B44A]" />
              </div>
              <p className="text-2xl font-black tracking-tight text-[#17381C]">
                {value}
              </p>
            </Card>
          ))}
        </div>

        <AnimatePresence>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {isLoading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <motion.div
                    key={`skeleton-${index}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Card
                      className="overflow-hidden rounded-[2rem] border-none bg-white/88 p-0 shadow-[0_18px_50px_rgba(13,30,17,0.08)] animate-pulse"
                    >
                  <div className="h-52 bg-[#E7E0D3]" />
                  <div className="space-y-3 p-5">
                    <div className="h-4 w-3/4 rounded-full bg-[#E7E0D3]" />
                    <div className="h-4 w-1/2 rounded-full bg-[#E7E0D3]" />
                    <div className="h-16 rounded-[1.2rem] bg-[#E7E0D3]" />
                  </div>
                </Card>
              ))
            : visibleListings.map((item, index) => {
                const visual = listingVisuals(item.title, item.category);
                const cardVariants = {
                  hidden: { opacity: 0, y: 30 },
                  visible: { opacity: 1, y: 0 }
                };
                return (
                  <motion.div
                    key={item.id}
                    layoutId={`listing-${item.id}`}
                    variants={cardVariants}
                    initial="hidden"
                    animate="visible"
                    whileHover={{ scale: 1.02, y: -8 }}
                    transition={{ 
                      duration: 0.5, 
                      ease: "easeOut",
                      delay: index * 0.05 
                    }}
                    className="origin-center"
                  >
                    <Card
                      className={`overflow-hidden rounded-[2rem] border-none p-0 shadow-[0_18px_50px_rgba(13,30,17,0.08)] ${
                        item.recommendationStatus === "low_interest"
                          ? "bg-[#F2EEE7]"
                          : "bg-white/92"
                      }`}
                    >
                    <button
                      type="button"
                      onClick={() => setSelectedListing(item)}
                      className="w-full text-left group"
                    >
                      <div className="relative h-56 overflow-hidden">
                        <img
                          src={listingImage(item) || visual.image}
                          alt={item.title}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                        <div className="absolute left-4 top-4 rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#17381C]">
                          {item.category}
                        </div>
                        {marketMode === "mine" && (
                          <div
                            className={`absolute right-4 top-4 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] ${
                              item.recommendationStatus === "low_interest"
                                ? "bg-[#17381C] text-white"
                                : item.recommendationStatus === "caution"
                                  ? "bg-[#D9B44A] text-[#17381C]"
                                  : "bg-[#DFF2E1] text-[#1F5A2B]"
                            }`}
                          >
                            {item.recommendationStatus === "low_interest"
                              ? marketCopy.lowInterest
                              : item.recommendationStatus === "caution"
                                ? marketCopy.caution
                                : marketCopy.healthy}
                          </div>
                        )}
                        <div className="absolute left-4 right-4 bottom-4 flex items-end justify-between gap-3 text-white">
                          <div>
                            <p className="text-sm font-bold text-white/76">
                              {item.farmer?.fullName || marketCopy.seller}
                            </p>
                            <h2 className="text-xl font-black leading-tight">
                              {item.title}
                            </h2>
                          </div>
                          <div className="rounded-[1.2rem] bg-white px-3 py-2 shadow-sm">
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#17381C]/70">
                              {marketCopy.price}
                            </p>
                            <p className="mt-1 text-lg font-black text-[#17381C]">
                              {Number(item.price || 0).toLocaleString("ru-RU")}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4 p-5">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-[1.2rem] bg-[#F5F1E8] px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#2F6B3D]/45">
                              {marketCopy.quantity}
                            </p>
                            <h2 className="text-xl font-black leading-tight drop-shadow-lg">
                              {item.title}
                            </h2>
                          </div>
                          <div className="rounded-[1.2rem] bg-[#F5F1E8] px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#2F6B3D]/45">
                              {marketCopy.currency}
                            </p>
                            <p className="mt-1 text-base font-black text-[#17381C]">
                              {item.currency}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-[1.2rem] bg-[#F5F1E8] px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#2F6B3D]/45">
                              {marketCopy.freshness}
                            </p>
                            <p className="mt-1 text-base font-black text-[#17381C]">
                              {item.freshnessDays ? `${item.freshnessDays} дн` : "n/a"}
                            </p>
                          </div>
                          <div className="rounded-[1.2rem] bg-[#F5F1E8] px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#2F6B3D]/45">
                              {marketCopy.delivery}
                            </p>
                            <p className="mt-1 text-base font-black text-[#17381C]">
                              {item.deliveryAvailable
                                ? language === "kk"
                                  ? "Бар"
                                  : "Есть"
                                : language === "kk"
                                  ? "Жоқ"
                                  : "Нет"}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2 text-sm text-[#2F6B3D]/72">
                          {marketMode === "mine" && (item.recommendationMessage || item.visibilityReason) && (
                            <div className="rounded-[1.2rem] bg-[#F5F1E8] px-4 py-3 text-sm leading-relaxed text-[#2F6B3D]/72">
                              <p className="font-black text-[#17381C]">
                                {item.recommendationTitle || marketCopy.caution}
                              </p>
                              <p className="mt-1">
                                {item.recommendationMessage || item.visibilityReason}
                              </p>
                              {item.recommendedActions?.length ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {item.recommendedActions.map((action) => (
                                    <span
                                      key={action}
                                      className="rounded-full bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#17381C]"
                                    >
                                      {action}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <MapPin className="size-4 text-[#D9B44A]" />
                            <span className="font-semibold">{item.location}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <CalendarDays className="size-4 text-[#D9B44A]" />
                            <span className="font-semibold">{item.availableFrom}</span>
                          </div>
                          {item.recommendedRegion ? (
                            <div className="flex items-center gap-2">
                              <Sparkles className="size-4 text-[#D9B44A]" />
                              <span className="font-semibold">
                                {marketCopy.regionAdvice}: {item.recommendedRegion}
                              </span>
                            </div>
                          ) : null}
                          {item.sellerTrust ? (
                            <div className="rounded-[1.2rem] bg-[#F5F1E8] px-4 py-3">
                              <p className="font-black text-[#17381C]">
                                {marketCopy.trust}: {item.sellerTrust.score.toFixed(1)} •{" "}
                                {trustLabel(item.sellerTrust.reliability, language)}
                              </p>
                              <p className="mt-1 text-xs">
                                {marketCopy.deals}: {item.sellerTrust.dealsCount}
                              </p>
                            </div>
                          ) : null}
                        </div>

                        <div className="flex items-center justify-between rounded-[1.4rem] bg-[#17381C] px-4 py-3 text-white">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/58">
                              {marketCopy.dealMode}
                            </p>
                            <p className="mt-1 text-sm font-bold">
                              {marketCopy.direct}
                            </p>
                          </div>
                          <Wallet className="size-5 text-[#D9B44A]" />
                        </div>
                      </div>
                    </button>
                  </Card>
                );
              })}
        </div>

        {!isLoading && visibleListings.length === 0 && (
          <Card className="mt-5 rounded-[2rem] border-none bg-white/88 px-6 py-8 text-center shadow-[0_18px_50px_rgba(13,30,17,0.08)]">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#2F6B3D]/45">
              {marketMode === "mine" ? marketCopy.myListings : marketCopy.title}
            </p>
            <h2 className="mt-2 text-2xl font-black text-[#17381C]">
              {marketMode === "mine" ? marketCopy.noMine : marketCopy.noPublic}
            </h2>
            <p className="mt-2 text-sm text-[#2F6B3D]/72">
              {marketMode === "mine"
                ? marketCopy.noMineHint
                : marketCopy.noPublicHint}
            </p>
          </Card>
        )}
      </div>

      <CreateListingModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={() => fetchMarketData(true)}
        language={language}
      />

      {selectedListing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center">
          <Card className="w-full max-w-lg rounded-[2rem] border-none bg-[#F4EFE6] p-0 shadow-[0_30px_100px_rgba(13,30,17,0.3)]">
            <div className="relative h-64">
              <img
                src={
                  selectedListing.imageUrl ||
                  listingVisuals(selectedListing.title, selectedListing.category).image
                }
                alt={selectedListing.title}
                className="h-full w-full rounded-t-[2rem] object-cover"
              />
              <div className="absolute inset-0 rounded-t-[2rem] bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <button
                type="button"
                onClick={() => setSelectedListing(null)}
                className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-2 text-xs font-black uppercase tracking-[0.22em] text-[#17381C]"
              >
                {marketCopy.close}
              </button>
              <div className="absolute left-5 right-5 bottom-5 text-white">
                <p className="text-sm font-bold text-white/78">
                  {selectedListing.farmer?.fullName || marketCopy.seller}
                </p>
                <h2 className="mt-1 text-2xl font-black">{selectedListing.title}</h2>
              </div>
            </div>

            <div className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[1.2rem] bg-white px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#2F6B3D]/45">
                    {marketCopy.quantity}
                  </p>
                  <p className="mt-1 text-base font-black text-[#17381C]">
                    {selectedListing.quantity} {selectedListing.unit}
                  </p>
                </div>
                <div className="rounded-[1.2rem] bg-white px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#2F6B3D]/45">
                    {marketCopy.price}
                  </p>
                  <p className="mt-1 text-base font-black text-[#17381C]">
                    {Number(selectedListing.price || 0).toLocaleString("ru-RU")}{" "}
                    {selectedListing.currency}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[1.2rem] bg-white px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#2F6B3D]/45">
                    {marketCopy.freshness}
                  </p>
                  <p className="mt-1 text-base font-black text-[#17381C]">
                    {selectedListing.freshnessDays
                      ? `${selectedListing.freshnessDays} дн`
                      : "n/a"}
                  </p>
                </div>
                <div className="rounded-[1.2rem] bg-white px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#2F6B3D]/45">
                    {marketCopy.storage}
                  </p>
                  <p className="mt-1 text-base font-black text-[#17381C]">
                    {selectedListing.storageLifeDays
                      ? `${selectedListing.storageLifeDays} дн`
                      : "n/a"}
                  </p>
                </div>
              </div>

              <div className="rounded-[1.2rem] bg-white px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#2F6B3D]/45">
                  {marketCopy.storage}
                </p>
                <p className="mt-2 text-sm text-[#2F6B3D]/72">
                  {selectedListing.storageConditions || "n/a"}
                </p>
              </div>

              <div className="rounded-[1.2rem] bg-white px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#2F6B3D]/45">
                  {marketCopy.delivery}
                </p>
                <p className="mt-2 text-sm text-[#2F6B3D]/72">
                  {selectedListing.deliveryAvailable
                    ? selectedListing.deliveryNotes ||
                      (language === "kk" ? "Жеткізу бар" : "Доставка доступна")
                    : language === "kk"
                      ? "Жеткізу жоқ"
                      : "Доставка не указана"}
                </p>
              </div>

              {selectedListing.sellerTrust ? (
                <div className="rounded-[1.2rem] bg-white px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#2F6B3D]/45">
                    {marketCopy.trust}
                  </p>
                  <p className="mt-2 text-sm font-black text-[#17381C]">
                    {selectedListing.sellerTrust.score.toFixed(1)} •{" "}
                    {trustLabel(selectedListing.sellerTrust.reliability, language)}
                  </p>
                  <p className="mt-1 text-sm text-[#2F6B3D]/72">
                    {marketCopy.deals}: {selectedListing.sellerTrust.dealsCount}
                  </p>
                </div>
              ) : null}

              <div className="space-y-2 rounded-[1.4rem] bg-white px-4 py-4 text-sm text-[#2F6B3D]/78">
                <div className="flex items-center gap-2">
                  <MapPin className="size-4 text-[#D9B44A]" />
                  <span className="font-semibold">{selectedListing.location}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CalendarDays className="size-4 text-[#D9B44A]" />
                  <span className="font-semibold">{selectedListing.availableFrom}</span>
                </div>
              </div>

              {selectedListing.description && (
                <p className="rounded-[1.4rem] bg-white px-4 py-4 text-sm leading-relaxed text-[#2F6B3D]/78">
                  {selectedListing.description}
                </p>
              )}

              {(selectedListing.recommendationMessage || selectedListing.visibilityReason) && (
                <div className="rounded-[1.4rem] bg-[#FBF6E7] px-4 py-4 text-sm leading-relaxed text-[#2F6B3D]/78">
                  <p className="font-black text-[#17381C]">
                    {selectedListing.recommendationTitle || marketCopy.caution}
                  </p>
                  <p className="mt-1">
                    {selectedListing.recommendationMessage || selectedListing.visibilityReason}
                  </p>
                  {selectedListing.recommendedActions?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedListing.recommendedActions.map((action) => (
                        <span
                          key={action}
                          className="rounded-full bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#17381C]"
                        >
                          {action}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}

              <Button
                onClick={startDirectChat}
                disabled={isChatCreating}
                className="h-14 w-full rounded-[1.4rem] bg-[#17381C] font-black text-white hover:bg-[#214a28]"
              >
                <MessageCircle className="size-4" />
                {marketCopy.start}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {isChatOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-2 backdrop-blur-sm sm:p-3 sm:items-center">
          <Card className="flex h-[calc(100dvh-1rem)] w-full max-w-[32rem] overflow-hidden rounded-[2rem] border-none bg-[#F4EFE6] p-0 shadow-[0_30px_100px_rgba(13,30,17,0.3)] sm:h-[90vh] md:max-w-5xl">
            <div className="flex w-full min-w-0 flex-col md:flex-row">
              <div className="w-full shrink-0 border-b border-black/5 bg-white/75 md:w-[20rem] md:border-b-0 md:border-r">
                <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#2F6B3D]/45">
                      {marketCopy.chats}
                    </p>
                    <h2 className="mt-1 text-xl font-black text-[#17381C]">
                      {marketCopy.chatWith}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsChatOpen(false)}
                    className="flex size-10 items-center justify-center rounded-full bg-[#F5F1E8] text-[#17381C]"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <div className="max-h-[31vh] overflow-y-auto px-2 pb-3 sm:px-3 md:max-h-[calc(90vh-5rem)]">
                  {isChatsLoading ? (
                    <div className="px-3 py-6 text-sm text-[#2F6B3D]/60">
                      Loading...
                    </div>
                  ) : chats.length > 0 ? (
                    <div className="space-y-2">
                      {chats.map((chat) => {
                        const isCommunity = Boolean(chat.channel);
                        return (
                          <button
                            key={chat.id}
                            type="button"
                            onClick={() => openChat(chat.id)}
                            className={`w-full min-w-0 rounded-[1.2rem] px-3 py-3 text-left transition-colors ${
                              activeChat?.id === chat.id
                                ? "bg-[#17381C] text-white"
                                : "bg-white text-[#17381C] hover:bg-[#F5F1E8]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="min-w-0 flex-1 truncate pr-2 text-sm font-black">
                                {chat.title}
                              </p>
                              <div
                                aria-label={isCommunity ? "channel" : "chat"}
                                className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${
                                  activeChat?.id === chat.id
                                    ? "bg-white/10 text-white/72"
                                    : "bg-[#F5F1E8] text-[#2F6B3D]/65"
                                }`}
                              >
                                {isCommunity
                                  ? language === "kk"
                                    ? "Арна"
                                    : "Канал"
                                  : language === "kk"
                                    ? "Чат"
                                    : "Чат"}
                              </div>
                            </div>
                            <p
                              className={`mt-1 line-clamp-2 text-xs ${
                                activeChat?.id === chat.id
                                  ? "text-white/72"
                                  : "text-[#2F6B3D]/62"
                              }`}
                            >
                              {chat.lastMessage?.body ||
                                (isCommunity
                                  ? language === "kk"
                                    ? "Қауым арнасы дайын"
                                    : "Канал сообщества готов"
                                  : marketCopy.noMessages)}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-[1.2rem] bg-white px-4 py-5 text-sm text-[#2F6B3D]/72">
                      <p className="font-black text-[#17381C]">
                        {marketCopy.chatEmpty}
                      </p>
                      <p className="mt-2">{marketCopy.chatEmptyHint}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="flex items-center justify-between gap-3 border-b border-black/5 bg-white/60 px-4 py-4 sm:px-5">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#2F6B3D]/45">
                      {activeChat?.channel
                        ? language === "kk"
                          ? "Қауым арнасы"
                          : "Канал сообщества"
                        : marketCopy.chatWith}
                    </p>
                    <h3 className="truncate text-lg font-black text-[#17381C]">
                      {activeChat?.title ||
                        activeChat?.participants.find(
                          (participant) => participant.userId !== currentUserId,
                        )?.fullName ||
                        activeChat?.participants[0]?.fullName ||
                        marketCopy.seller}
                    </h3>
                  </div>
                  {activeChat?.channel?.isModerated ? (
                    <div className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#2F6B3D]/65">
                      {language === "kk" ? "Модерация" : "Модерация"}
                    </div>
                  ) : null}
                </div>

                <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-4 sm:px-4">
                  {activeChat?.messages?.length ? (
                    <div className="space-y-3">
                      {activeChat.messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex ${
                            message.senderId === currentUserId
                              ? "justify-end"
                              : "justify-start"
                          }`}
                        >
                          <div className="max-w-[85%] rounded-[1.2rem] bg-white px-4 py-3 text-sm text-[#17381C] shadow-sm">
                            {activeChat?.channel &&
                            message.senderId !== currentUserId ? (
                              <p className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#2F6B3D]/45">
                                {message.senderName || "User"}
                              </p>
                            ) : null}
                            {message.body}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <div className="rounded-[1.3rem] bg-white px-5 py-4 text-center text-sm text-[#2F6B3D]/72 shadow-sm">
                        {marketCopy.noMessages}
                      </div>
                    </div>
                  )}
                </div>

                {activeChat && (
                  <>
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
                            className="shrink-0 rounded-full bg-white px-3 py-2 text-xs font-black text-[#17381C] shadow-sm transition-colors hover:bg-[#F5F1E8]"
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
                          className="h-13 min-w-0 flex-1 rounded-full border-none bg-white px-4 text-sm font-semibold text-[#17381C] shadow-sm outline-none"
                        />
                        <Button
                          onClick={() => sendMessage(chatMessage)}
                          disabled={isSendingMessage || !chatMessage.trim()}
                          className="h-13 shrink-0 rounded-full bg-[#17381C] px-4 font-black text-white hover:bg-[#214a28]"
                        >
                          <Send className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
