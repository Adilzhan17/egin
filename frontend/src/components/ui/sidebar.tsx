'use client';

import React from 'react';
import { 
  MessageCircle,
  Settings,
  House, 
  Map as MapIcon, 
  ShoppingBasket, 
  BriefcaseBusiness, 
  Shield, 
  User, 
  LogOut,
  ChevronRight,
  Newspaper
} from "lucide-react";
import { PlatformLanguage, ui } from "@/lib/i18n";
import type { AppTab } from "./app-navigation";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: AppTab) => void;
  language: PlatformLanguage;
  currentUserRole: string;
  logout: () => void;
  t: (typeof ui)[PlatformLanguage];
}

export default function Sidebar({ 
  activeTab, 
  setActiveTab, 
  language, 
  currentUserRole, 
  logout,
  t 
}: SidebarProps) {
  const menuItems = [
    {
      key: "home",
      icon: House,
      label: language === "kk" ? "Басты бет" : "Главная",
    },
    { key: "map", icon: MapIcon, label: language === "kk" ? "Менің егістіктерім" : "Мои поля" },
    { key: "market", icon: ShoppingBasket, label: language === "kk" ? "Базар" : "Рынок" },
    { key: "chat", icon: MessageCircle, label: language === "kk" ? "Хабарламалар" : "Сообщения" },
    {
      key: "services",
      icon: BriefcaseBusiness,
      label: language === "kk" ? "Қызметтер" : "Услуги",
    },
    {
      key: "info",
      icon: Newspaper,
      label: language === "kk" ? "Ақпарат" : "Инфо-центр",
    },
    ...(currentUserRole === "admin"
      ? [{
          key: "admin",
          icon: Shield,
          label: language === "kk" ? "Әкімші" : "Админ",
        }]
      : []),
    { key: "profile", icon: User, label: t.profile || "Профиль" },
    { key: "menu", icon: Settings, label: language === "kk" ? "Баптаулар және көмек" : "Настройки и помощь" },
  ];

  return (
    <aside className="hidden lg:flex flex-col shrink-0 w-72 bg-[#16321C]/95 border-r border-white/10 h-full backdrop-blur-xl z-50 transition-all duration-300">
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-2xl bg-[#D9B44A] flex items-center justify-center shadow-[0_10px_25px_rgba(217,180,74,0.3)]">
            <span className="text-[#17381C] font-black text-xl">E</span>
          </div>
          <div>
            <h1 className="text-white font-black tracking-tight text-xl">Egin-KZ</h1>
            <p className="text-white/60 text-xs font-black uppercase tracking-[0.2em]">Agro Solutions</p>
          </div>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-2">
        <p className="px-4 mb-4 text-xs font-black uppercase tracking-[0.2em] text-white/60">
          Меню
        </p>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key as AppTab)}
              aria-current={isActive ? "page" : undefined}
              className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all duration-300 group ${
                isActive 
                  ? "bg-white/10 text-[#D9B44A]" 
                  : "text-white/85 hover:bg-white/5 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl transition-all duration-300 ${
                  isActive ? "bg-[#D9B44A]/20" : "bg-white/5 group-hover:bg-white/10"
                }`}>
                  <Icon className="size-5" />
                </div>
                <span className="font-semibold text-base">{item.label}</span>
              </div>
              {isActive && <ChevronRight className="size-4 opacity-50" />}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-red-400/70 hover:bg-red-500/10 hover:text-red-400 transition-all duration-300 font-bold text-sm"
        >
          <div className="p-2 rounded-xl bg-red-500/10">
            <LogOut className="size-5" />
          </div>
          {t.logout || "Выйти"}
        </button>
      </div>
    </aside>
  );
}
