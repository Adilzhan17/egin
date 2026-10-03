"use client";

import React, { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";
import s from "../styles/egin-map.module.css";

interface ApiUsage {
  provider: string;
  callCount: number;
  monthlyLimit: number;
  updatedAt: string;
}

interface EginQuotaWidgetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Glassmorphism API quota widget — overlays on top of the map.
 * Shows used/remaining/percentage for each tracked API provider.
 * Only rendered for admin users.
 */
const EginQuotaWidget: React.FC<EginQuotaWidgetProps> = ({ visible, onClose }) => {
  const [stats, setStats] = useState<ApiUsage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible) return;

    const fetchStats = async () => {
      try {
        const token = localStorage.getItem("agro_token");
        const res = await fetch(apiUrl("/api-usage/stats"), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setStats(Array.isArray(data) ? data : []);
      } catch {
        setStats([]);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    // Auto-refresh every 60s while visible
    const interval = setInterval(fetchStats, 60_000);
    return () => clearInterval(interval);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className={s.quotaWidget}>
      <div className={s.quotaHeader}>
        <span className={s.quotaTitle}>API Квоты</span>
        <button type="button" onClick={onClose} className={s.quotaClose}>
          ✕
        </button>
      </div>

      {loading ? (
        <div className={s.quotaProvider} style={{ opacity: 0.5 }}>
          Загрузка...
        </div>
      ) : stats.length === 0 ? (
        <div className={s.quotaProvider} style={{ opacity: 0.5 }}>
          Нет данных
        </div>
      ) : (
        stats.map((item) => {
          const percent = Math.min((item.callCount / item.monthlyLimit) * 100, 100);
          const remaining = Math.max(item.monthlyLimit - item.callCount, 0);
          const fillClass =
            percent > 90 ? s.quotaFillDanger : percent > 70 ? s.quotaFillWarn : s.quotaFillOk;

          return (
            <div key={item.provider} className={s.quotaRow}>
              <div className={s.quotaRowHeader}>
                <span className={s.quotaProvider}>
                  {item.provider.replace(/_/g, " ")}
                </span>
                <span className={s.quotaCounts}>
                  {item.callCount.toLocaleString()} / {item.monthlyLimit.toLocaleString()}
                </span>
              </div>
              <div className={s.quotaTrack}>
                <div className={fillClass} style={{ width: `${percent}%` }} />
              </div>
              <div className={s.quotaRemaining}>
                Осталось: {remaining.toLocaleString()} ({(100 - percent).toFixed(1)}%)
              </div>
            </div>
          );
        })
      )}

      <div className={s.quotaNote}>
        * Google Maps: ~28 500 загрузок/мес ($200 кредит)
      </div>
    </div>
  );
};

export default EginQuotaWidget;
