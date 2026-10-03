"use client";
import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Sprout,
  LayoutDashboard,
  Map,
  MessageCircle,
  Store,
  Newspaper,
  Sparkles,
  LogOut,
  Menu,
  X,
  ArrowUpRight,
  ChevronDown,
  Ellipsis,
} from "lucide-react";
import { api, useApi } from "@/lib/api";
import type { User } from "@/lib/types";
import { AuthPage, Onboarding } from "./auth";
import { Dashboard } from "./dashboard";
import { Farms } from "./farms";
import { MapPage } from "./map-page";
import { FieldPage } from "./field-page";
import { MarketPage, ListingPage, ListingForm } from "./market";
import { Community } from "./community";
import { NewsPage } from "./assistant-news";
import { Assistant } from "./assistant";
import { MorePage, SettingsPage, Tasks } from "./activity";
import { Loading, ErrorBox } from "./ui";
const nav = [
  {
    href: "/",
    label: "Обзор хозяйства",
    short: "Главная",
    icon: LayoutDashboard,
  },
  { href: "/map", label: "Карта полей", short: "Карта", icon: Map },
  { href: "/assistant", label: "Помощник EGIN", short: "AI", icon: Sparkles },
  {
    href: "/community",
    label: "Сообщество",
    short: "Чаты",
    icon: MessageCircle,
  },
  { href: "/market", label: "Агрорынок", short: "Рынок", icon: Store },
  {
    href: "/news",
    label: "Лента хозяйства",
    short: "Новости",
    icon: Newspaper,
  },
];
export default function App() {
  const path = usePathname();
  return (
    <Suspense fallback={<Loading />}>
      {path === "/login" || path === "/register" ? (
        <AuthPage register={path === "/register"} />
      ) : (
        <PrivateApp />
      )}
    </Suspense>
  );
}
function PrivateApp() {
  const user = useApi<User>("/auth/me"),
    router = useRouter(),
    path = usePathname(),
    [menu, setMenu] = useState(false);
  useEffect(() => {
    if (user.error === "Войдите в аккаунт") router.replace("/login");
    else if (user.data && !user.data.onboarded && path != "/onboarding")
      router.replace("/onboarding");
  }, [user.error, user.data, path, router]);
  useEffect(() => setMenu(false), [path]);
  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.push("/login");
  }
  if (user.loading)
    return (
      <div className="startup">
        <Sprout size={38} />
        <strong>egin.</strong>
        <Loading />
      </div>
    );
  if (user.error)
    return user.error === "Войдите в аккаунт" ? (
      <Loading />
    ) : (
      <ErrorBox message={user.error} onRetry={user.reload} />
    );
  if (!user.data) return null;
  if (path === "/onboarding")
    return <Onboarding user={user.data} onDone={user.reload} />;
  const current = user.data;
  let content: React.ReactNode;
  if (path === "/") content = <Dashboard user={current} />;
  else if (path === "/farms") content = <Farms user={current} />;
  else if (path === "/map") content = <MapPage />;
  else if (path.startsWith("/fields/"))
    content = <FieldPage key={path} id={path.split("/")[2]} />;
  else if (path === "/assistant") content = <Assistant />;
  else if (path === "/community") content = <Community user={current} />;
  else if (path === "/market/new") content = <ListingForm />;
  else if (path.match(/^\/market\/[^/]+\/edit$/))
    content = <ListingForm id={path.split("/")[2]} />;
  else if (path.startsWith("/market/"))
    content = <ListingPage id={path.split("/")[2]} user={current} />;
  else if (path === "/market") content = <MarketPage />;
  else if (path === "/news") content = <NewsPage />;
  else if (path === "/more") content = <MorePage />;
  else if (path === "/settings") content = <SettingsPage />;
  else if (path === "/tasks") content = <Tasks />;
  else
    content = (
      <div className="empty">
        <h1>Страница не найдена</h1>
        <Link href="/">Вернуться к хозяйству</Link>
      </div>
    );
  return (
    <div className="app-shell">
      {menu && (
        <button
          className="nav-backdrop"
          aria-label="Закрыть меню"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Sprout size={29} />
          </span>
          egin<span className="brand-dot">.</span>
        </Link>
        <Link href="/farms" className="workspace-chip">
          <span className="farm-emblem">
            <Sprout size={18} />
          </span>
          <div>
            <strong>Мои хозяйства</strong>
            <small>Личное пространство</small>
          </div>
          <ChevronDown size={14} />
        </Link>
        <div className="nav-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
        <nav>
          {nav.map((n) => (
            <Link
              key={n.href}
              className={
                path === n.href ||
                (n.href === "/map" && path.startsWith("/fields/")) ||
                (n.href === "/market" && path.startsWith("/market/"))
                  ? "active"
                  : ""
              }
              href={n.href}
            >
              <n.icon size={20} />
              <span>{n.label}</span>
              {n.href === "/assistant" && <small className="ai-nav">AI</small>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-status">
            <span className="status-dot" />
            Локальное рабочее пространство
          </div>
          <div className="profile">
            <span className="avatar">{current.name[0]}</span>
            <div>
              <strong>{current.name}</strong>
              <small>Фермер · {current.language.toUpperCase()}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Выйти"
              title="Выйти"
              onClick={logout}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="row">
            <button
              className="icon-button mobile-only"
              aria-label="Открыть меню"
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X size={21} /> : <Menu size={21} />}
            </button>
            <span className="topbar-label">Земля. Данные. Решения.</span>
          </div>
          <div className="topbar-right">
            <span className="country-label">Казахстан</span>
            <span className="locale-tag">{current.language.toUpperCase()}</span>
            <Link href="/assistant" className="topbar-help">
              Помощник <ArrowUpRight size={14} />
            </Link>
          </div>
        </header>
        <main className={"main-content " + (path === "/map" ? "wide" : "")}>
          {content}
        </main>
        <footer className="app-footer">
          <span>EGIN.KZ · Создано для земли</span>
          <span>Рабочее пространство фермера</span>
        </footer>
      </div>
      <nav className="bottom-nav">
        {[
          nav[0],
          nav[1],
          nav[2],
          nav[4],
          { href: "/more", short: "Ещё", icon: Ellipsis },
        ].map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={
              (n.href === "/assistant" ? "ai-tab " : "") +
              (path === n.href ||
              (n.href === "/more" &&
                [
                  "/community",
                  "/news",
                  "/tasks",
                  "/settings",
                  "/farms",
                ].includes(path))
                ? "active"
                : "")
            }
          >
            <n.icon size={20} />
            <span>{n.short}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
