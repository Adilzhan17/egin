"use client";

import {
  House,
  Map,
  ShoppingBasket,
  MessageCircle,
  Menu,
  User,
  BriefcaseBusiness,
  Newspaper,
  CircleHelp,
  Shield,
  ChevronRight,
} from "lucide-react";
import type { PlatformLanguage } from "@/lib/i18n";

export type AppTab =
  | "home"
  | "map"
  | "market"
  | "chat"
  | "menu"
  | "profile"
  | "services"
  | "info"
  | "admin";

export function MobileNavigation({
  activeTab,
  onNavigate,
  language,
}: {
  activeTab: AppTab;
  onNavigate: (tab: AppTab) => void;
  language: PlatformLanguage;
}) {
  const kk = language === "kk";
  const items = [
    { key: "home", icon: House, label: kk ? "Басты бет" : "Главная" },
    { key: "map", icon: Map, label: kk ? "Егістік" : "Поля" },
    { key: "market", icon: ShoppingBasket, label: kk ? "Базар" : "Рынок" },
    { key: "chat", icon: MessageCircle, label: "Чат" },
    { key: "menu", icon: Menu, label: kk ? "Мәзір" : "Меню" },
  ] as const;
  return (
    <nav
      aria-label={kk ? "Негізгі бөлімдер" : "Основные разделы"}
      className="mobile-navigation lg:hidden"
    >
      {items.map(({ key, icon: Icon, label }) => {
        const active =
          activeTab === key ||
          (key === "menu" &&
            ["profile", "services", "info", "admin"].includes(activeTab));
        return (
          <button
            key={key}
            type="button"
            onClick={() => onNavigate(key)}
            aria-current={active ? "page" : undefined}
            className={`mobile-navigation-item ${active ? "is-active" : ""}`}
          >
            <Icon
              size={24}
              aria-hidden="true"
              strokeWidth={active ? 2.3 : 1.8}
            />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function MenuView({
  language,
  setLanguage,
  onNavigate,
  onHelp,
  isAdmin,
}: {
  language: PlatformLanguage;
  setLanguage: (lang: PlatformLanguage) => void;
  onNavigate: (tab: AppTab) => void;
  onHelp: () => void;
  isAdmin: boolean;
}) {
  const kk = language === "kk";
  const items = [
    {
      key: "profile",
      icon: User,
      title: kk ? "Менің профилім" : "Мой профиль",
      hint: kk ? "Аты-жөніңіз, телефон және өңір" : "Имя, телефон и ваш регион",
    },
    {
      key: "services",
      icon: BriefcaseBusiness,
      title: kk ? "Қызметтер" : "Услуги",
      hint: kk
        ? "Техника, жеткізу және мамандар"
        : "Техника, перевозки и специалисты",
    },
    {
      key: "info",
      icon: Newspaper,
      title: kk ? "Жаңалықтар мен қолдау" : "Новости и поддержка",
      hint: kk
        ? "Фермерлерге арналған пайдалы ақпарат"
        : "Полезная информация для фермеров",
    },
    ...(isAdmin
      ? [
          {
            key: "admin",
            icon: Shield,
            title: kk ? "Басқару" : "Управление",
            hint: kk ? "Әкімші бөлімі" : "Раздел администратора",
          },
        ]
      : []),
  ];
  return (
    <section className="app-scroll-page">
      <div className="app-page-content">
        <h1 className="page-title">{kk ? "Мәзір" : "Меню"}</h1>
        <p className="text-muted-foreground">
          {kk ? "Барлық бөлімдер мен баптаулар" : "Все разделы и настройки"}
        </p>
        <div className="surface mt-6 divide-y divide-border">
          {items.map(({ key, icon: Icon, title, hint }) => (
            <button
              key={key}
              className="navigation-row"
              onClick={() => onNavigate(key as AppTab)}
            >
              <Icon
                className="size-6 shrink-0 text-primary"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-semibold">{title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {hint}
                </span>
              </span>
              <ChevronRight className="size-5 shrink-0" aria-hidden="true" />
            </button>
          ))}
          <button className="navigation-row" onClick={onHelp}>
            <CircleHelp
              className="size-6 shrink-0 text-primary"
              aria-hidden="true"
            />
            <span className="flex-1">
              <span className="block text-lg font-semibold">
                {kk ? "Қалай қолдануға болады?" : "Как пользоваться?"}
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {kk
                  ? "Картамен жұмыс істеу нұсқаулығы"
                  : "Пошаговая помощь по работе с картой"}
              </span>
            </span>
            <ChevronRight className="size-5 shrink-0" aria-hidden="true" />
          </button>
        </div>
        <fieldset className="mt-8">
          <legend className="mb-3 text-lg font-semibold">
            {kk ? "Қолданба тілі" : "Язык приложения"}
          </legend>
          <div className="flex flex-wrap gap-3">
            {(["ru", "kk"] as const).map((lang) => (
              <button
                key={lang}
                aria-pressed={language === lang}
                onClick={() => setLanguage(lang)}
                className={
                  language === lang ? "primary-action" : "secondary-action"
                }
              >
                {lang === "ru" ? "Русский" : "Қазақша"}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </section>
  );
}
