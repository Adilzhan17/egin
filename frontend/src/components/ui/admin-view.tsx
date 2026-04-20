"use client";
import React, { useState, useEffect } from 'react';
import { Card } from './card';
import { apiUrl } from '@/lib/api';

export default function AdminView() {
  const [plots, setPlots] = useState<any[]>([]);

  useEffect(() => {
    fetchPlots();
  }, []);

  const fetchPlots = async () => {
    try {
      const token = localStorage.getItem("agro_token");
      const res = await fetch(apiUrl('/farm-plots'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) setPlots(json.data);
    } catch (e) {
      console.error(e);
    }
  };

  const deletePlot = async (id: string) => {
    if (!confirm("Удалить участок?")) return;
    try {
      const token = localStorage.getItem("agro_token");
      await fetch(apiUrl(`/farm-plots/${id}`), {
        method: 'DELETE',
        headers: { "Authorization": `Bearer ${token}` }
      });
      fetchPlots();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#F5F9F4] dark:bg-[#002115] dark:text-white transition-colors p-6 overflow-auto pt-10">
      <h1 className="text-3xl font-black text-[#2F6B3D] mb-6 shadow-sm">Админ-панель</h1>
      <Card className="p-6 rounded-[2rem] bg-white shadow-[0_18px_40px_rgba(0,0,0,0.05)] border-none">
        <h2 className="text-xl font-bold mb-4 text-[#2F6B3D]">Управление участками ({plots.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100 uppercase text-xs tracking-wider text-gray-400">
                <th className="pb-3 px-2">ID</th>
                <th className="pb-3 px-2">Название участка</th>
                <th className="pb-3 px-2">Культура</th>
                <th className="pb-3 px-2 text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {plots.map(plot => (
                <tr key={plot.id} className="border-b border-gray-50 hover:bg-green-50/50 transition-colors">
                  <td className="py-4 px-2 text-xs text-gray-500 font-mono">{plot.id.slice(0, 8)}</td>
                  <td className="py-4 px-2 font-bold text-[#2F6B3D]">{plot.title || 'Без названия'}</td>
                  <td className="py-4 px-2">
                    <span className="bg-[#EAF3E7] text-[#2F6B3D] px-3 py-1 rounded-full text-xs font-bold">{plot.cropType}</span>
                  </td>
                  <td className="py-4 px-2 text-right">
                    <button onClick={() => deletePlot(plot.id)} className="text-red-500 font-bold text-sm hover:underline py-1 px-3 bg-red-50 border-red-100 border rounded-lg active:scale-95 transition-all">Удалить</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {plots.length === 0 && <div className="text-center py-10 text-gray-400">Нет добавленных участков</div>}
        </div>
      </Card>
      <div className="h-32" />
    </div>
  );
}
