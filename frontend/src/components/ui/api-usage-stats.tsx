"use client";

import React, { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";

interface ApiUsage {
  provider: string;
  callCount: number;
  monthlyLimit: number;
  updatedAt: string;
}

const ApiUsageStats = () => {
  const [stats, setStats] = useState<ApiUsage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem("agro_token");
        const res = await fetch(apiUrl("/api-usage/stats"), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setStats(data);
      } catch (err) {
        console.error("Failed to fetch API stats", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) return <div className="p-4 text-sm text-gray-500 animate-pulse">Загрузка лимитов...</div>;

  return (
    <div className="flex flex-col gap-4 p-5 bg-white/80 backdrop-blur-md rounded-3xl border border-gray-100 shadow-xl">
      <h3 className="text-lg font-bold text-gray-800">Лимиты API (Sandbox)</h3>
      {stats.map((item) => {
        const percent = Math.min((item.callCount / item.monthlyLimit) * 100, 100);
        return (
          <div key={item.provider} className="space-y-2">
            <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-gray-500">
              <span>{item.provider.replace('_', ' ')}</span>
              <span>{item.callCount} / {item.monthlyLimit}</span>
            </div>
            <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden border border-gray-50">
              <div 
                className={`h-full transition-all duration-1000 ${percent > 90 ? 'bg-red-500' : percent > 70 ? 'bg-amber-500' : 'bg-green-500'}`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-400 italic">Обновлено: {new Date(item.updatedAt).toLocaleString()}</p>
          </div>
        );
      })}
      <div className="text-[11px] text-[#2F6B3D]/70 bg-[#2F6B3D]/5 p-2 rounded-lg">
        * Бесплатный лимит Google Maps составляет около 28,500 загрузок в месяц ($200 кредит).
      </div>
    </div>
  );
};

export default ApiUsageStats;
