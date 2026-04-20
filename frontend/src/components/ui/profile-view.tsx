"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Settings, LogOut, ChevronRight, ChevronLeft, Map as MapIcon, ShieldCheck, Save, X, Check } from "lucide-react";
import { PlatformLanguage, ui } from "@/lib/i18n";
import { apiUrl } from "@/lib/api";

type ProfileSubView = "main" | "plots" | "deals" | "settings";

export default function ProfileView({ language }: { language: PlatformLanguage }) {
  const t = ui[language];
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [subView, setSubView] = useState<ProfileSubView>("main");
  const [plots, setPlots] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loadingPlots, setLoadingPlots] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [profile, setProfile] = useState({
    name: "", phone: "", role: "", region: "", district: "",
  });
  const [editForm, setEditForm] = useState({
    fullName: "", phone: "", region: "", district: "",
  });

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "farmer": return t.farmerRole;
      case "seller": return t.sellerRole;
      case "buyer": return t.buyerRole;
      default: return t.farmerRole;
    }
  };

  const getPlotsSummary = (count: number) => {
    if (language === "kk") {
      return `${count} белсенді аумақ`;
    }

    const lastTwoDigits = count % 100;
    const lastDigit = count % 10;

    if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
      return `${count} активных участков`;
    }

    if (lastDigit === 1) {
      return `${count} активный участок`;
    }

    if (lastDigit >= 2 && lastDigit <= 4) {
      return `${count} активных участка`;
    }

    return `${count} активных участков`;
  };

  const getCompletedDealsSummary = (count: number) => {
    if (language === "kk") {
      return `${count} аяқталған мәміле`;
    }

    const lastTwoDigits = count % 100;
    const lastDigit = count % 10;

    if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
      return `${count} завершенных сделок`;
    }

    if (lastDigit === 1) {
      return `${count} завершенная сделка`;
    }

    if (lastDigit >= 2 && lastDigit <= 4) {
      return `${count} завершенные сделки`;
    }

    return `${count} завершенных сделок`;
  };

  const completedDealsCount = orders.filter((order: any) => order.status === "completed").length;

  useEffect(() => {
    const token = localStorage.getItem("agro_token");
    if (token) {
      setIsLoggedIn(true);
      const name = localStorage.getItem("agro_user_name") || "";
      const phone = localStorage.getItem("agro_user_phone") || "";
      const role = localStorage.getItem("agro_user_role") || "farmer";
      const region = localStorage.getItem("agro_user_region") || "";
      const district = localStorage.getItem("agro_user_district") || "";
      const savedAvatar = localStorage.getItem("agro_avatar");
      setProfile({ name, phone, role, region, district });
      if (savedAvatar) setAvatar(savedAvatar);
      fetchProfile(token);
      fetchPlots(token);
      fetchOrders(token);
    }
  }, []);

  const fetchProfile = async (token: string) => {
    try {
      const res = await fetch(apiUrl("/users/me"), {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success && json.data) {
        const u = json.data;
        const p = {
          name: u.fullName || "", phone: u.phone || "",
          role: u.role || "farmer", region: u.region || "", district: u.district || "",
        };
        setProfile(p);
        localStorage.setItem("agro_user_name", p.name);
        localStorage.setItem("agro_user_phone", p.phone);
        localStorage.setItem("agro_user_role", p.role);
        localStorage.setItem("agro_user_region", p.region);
        localStorage.setItem("agro_user_district", p.district);
      }
    } catch {}
  };

  const fetchPlots = async (providedToken?: string) => {
    setLoadingPlots(true);
    try {
      const token = providedToken || localStorage.getItem("agro_token");
      const res = await fetch(apiUrl("/farm-plots/mine"), {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) setPlots(json.data);
    } catch {} finally { setLoadingPlots(false); }
  };

  const fetchOrders = async (providedToken?: string) => {
    setLoadingOrders(true);
    try {
      const token = providedToken || localStorage.getItem("agro_token");
      const res = await fetch(apiUrl("/orders/my"), {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) setOrders(json.data);
    } catch {} finally { setLoadingOrders(false); }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setSaveSuccess(false);
    try {
      const token = localStorage.getItem("agro_token");
      const res = await fetch(apiUrl("/users/me"), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          fullName: editForm.fullName,
          phone: editForm.phone,
          region: editForm.region,
          district: editForm.district,
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        const u = json.data;
        const p = { name: u.fullName || "", phone: u.phone || "", role: u.role || "farmer", region: u.region || "", district: u.district || "" };
        setProfile(p);
        localStorage.setItem("agro_user_name", p.name);
        localStorage.setItem("agro_user_phone", p.phone);
        localStorage.setItem("agro_user_region", p.region);
        localStorage.setItem("agro_user_district", p.district);
        setSaveSuccess(true);
        setTimeout(() => { setSaveSuccess(false); setSubView("main"); }, 1500);
      } else {
        const msg = Array.isArray(json.message) ? json.message.join("\n") : json.message;
        alert(msg || "Error saving profile");
      }
    } catch {
      alert("Не удалось сохранить профиль");
    } finally { setSavingProfile(false); }
  };

  const handleLogout = () => {
    ["agro_token","agro_user_name","agro_user_phone","agro_user_role","agro_user_region","agro_user_district","agro_avatar"].forEach(k => localStorage.removeItem(k));
    window.location.reload();
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setAvatar(base64);
        localStorage.setItem("agro_avatar", base64);
      };
      reader.readAsDataURL(file);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="absolute inset-0 z-50 bg-[#FAF8F2] flex flex-col items-center justify-center p-8 text-center h-full">
        <div className="h-24 w-24 bg-white rounded-[2.5rem] flex items-center justify-center mb-6 shadow-2xl shadow-green-900/10">
          <User className="size-12 text-[#2F6B3D] opacity-20" />
        </div>
        <h2 className="text-3xl font-black text-[#2F6B3D] mb-3 tracking-tighter">{t.profileRequired}</h2>
        <p className="text-[#2F6B3D]/60 text-sm mb-10 px-6 font-medium leading-relaxed">{t.loginToManage}</p>
        <Button onClick={() => window.location.reload()} className="w-full h-16 rounded-[1.5rem] bg-[#2F6B3D] text-white font-black text-lg shadow-xl active:scale-95 transition-all">
          {t.loginToAgriPlan}
        </Button>
      </div>
    );
  }

  // Settings sub-view
  if (subView === "settings") {
    return (
      <div className="absolute inset-0 z-10 bg-[#FAF8F2] pt-12 px-6 pb-32 overflow-y-auto w-full h-full animate-in fade-in slide-in-from-right-4 duration-300 pointer-events-auto">
        <div className="flex items-center justify-between mb-10">
          <Button variant="ghost" size="icon" onClick={() => setSubView("main")} className="text-[#133824] hover:bg-black/5 rounded-full h-10 w-10 cursor-pointer">
            <ChevronLeft className="size-6" />
          </Button>
          <h1 className="text-sm font-black text-[#133824] tracking-widest uppercase">{t.editProfile || "EDIT PROFILE"}</h1>
          <button onClick={handleSaveProfile} disabled={savingProfile} className="text-sm font-bold text-green-700 uppercase tracking-widest disabled:opacity-50 hover:opacity-70 transition-opacity">
            {savingProfile ? t.wait : (t.saveChanges || "SAVE")}
          </button>
        </div>

        {saveSuccess && (
          <div className="mb-6 p-4 bg-green-100 border border-green-300 rounded-2xl flex items-center gap-3 animate-in fade-in duration-300">
            <Check className="size-5 text-green-600" />
            <span className="font-bold text-green-700 text-sm">{t.profileSaved}</span>
          </div>
        )}

        <div className="flex items-center gap-5 mb-10">
          <div onClick={() => document.getElementById("avatar-input")?.click()} className="h-20 w-20 rounded-2xl bg-[#71D675] flex items-center justify-center overflow-hidden cursor-pointer shadow-sm relative group">
            {avatar ? (
              <img src={avatar} className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl font-bold text-[#133824]">{profile.name ? profile.name.substring(0,2).toUpperCase() : "ET"}</span>
            )}
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-[10px] font-black uppercase">{t.change}</div>
          </div>
          <div>
            <h2 className="text-2xl font-extrabold text-[#133824]">{profile.name || "Elias Thorne"}</h2>
            <p className="text-[#133824]/60 text-sm font-medium">{getRoleLabel(profile.role)}</p>
          </div>
        </div>

        <div className="bg-[#F3F1EA] rounded-[2rem] p-6 mb-8">
          <h3 className="text-[10px] font-bold text-[#133824]/40 uppercase tracking-widest mb-6 border-b border-[#133824]/5 pb-3">PROFILE DETAILS</h3>
          
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-[#133824]/60 uppercase tracking-wider ml-1">{t.fullName}</Label>
              <Input value={editForm.fullName} onChange={e => setEditForm({...editForm, fullName: e.target.value})} className="rounded-xl h-12 bg-[#EBE8E0] border-none font-bold text-[#133824] focus-visible:ring-1 focus-visible:ring-[#133824]/20 shadow-none px-4" />
            </div>
            
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-[#133824]/60 uppercase tracking-wider ml-1">{t.phone}</Label>
              <Input value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} className="rounded-xl h-12 bg-[#EBE8E0] border-none font-bold text-[#133824] focus-visible:ring-1 focus-visible:ring-[#133824]/20 shadow-none px-4" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-[#133824]/60 uppercase tracking-wider ml-1">{t.region}</Label>
              <Input value={editForm.region} onChange={e => setEditForm({...editForm, region: e.target.value})} className="rounded-xl h-12 bg-[#EBE8E0] border-none font-bold text-[#133824] focus-visible:ring-1 focus-visible:ring-[#133824]/20 shadow-none px-4" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-[#133824]/60 uppercase tracking-wider ml-1">{t.district}</Label>
              <Input value={editForm.district} onChange={e => setEditForm({...editForm, district: e.target.value})} className="rounded-xl h-12 bg-[#EBE8E0] border-none font-bold text-[#133824] focus-visible:ring-1 focus-visible:ring-[#133824]/20 shadow-none px-4" />
            </div>
          </div>
        </div>

        <button className="text-[11px] font-bold text-red-600 uppercase tracking-widest mt-4 ml-2 hover:opacity-70 transition-opacity">
          DEACTIVATE ACCOUNT
        </button>
      </div>
    );
  }

  // My Plots sub-view
  if (subView === "plots") {
    return (
      <div className="absolute inset-0 z-10 bg-[#FAF8F2] pt-12 px-6 pb-32 overflow-y-auto w-full h-full animate-in fade-in slide-in-from-right-4 duration-300 pointer-events-auto">
        <div className="flex items-center justify-between mb-8">
          <Button variant="ghost" size="icon" onClick={() => setSubView("main")} className="text-[#133824] hover:bg-black/5 rounded-full h-10 w-10 cursor-pointer">
            <ChevronLeft className="size-6" />
          </Button>
          <h1 className="text-sm font-black text-[#133824] tracking-widest uppercase">{t.myPlots}</h1>
          <div className="w-10" />
        </div>
        
        {loadingPlots ? (
          <div className="text-center py-20"><div className="size-8 border-3 border-[#133824]/20 border-t-[#133824] animate-spin rounded-full mx-auto" /></div>
        ) : plots.length > 0 ? (
          <div className="space-y-4">
            {plots.map((plot: any) => (
              <div key={plot.id} className="bg-[#F3F1EA] rounded-2xl p-4 flex gap-4 items-center">
                <div className="h-12 w-12 rounded-xl bg-[#133824] flex items-center justify-center text-white shrink-0">
                  <MapIcon className="size-6 text-white" />
                </div>
                <div className="flex flex-col justify-center flex-1">
                  <h3 className="font-bold text-[#133824] text-base leading-tight">{plot.title}</h3>
                  <p className="text-[#133824]/60 text-xs font-medium mt-1">{plot.cropType} • {plot.areaSizeHectares} {t.hectares}</p>
                </div>
                <ChevronRight className="size-4 text-[#133824]/30" />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 opacity-40 select-none">
            <MapIcon className="size-16 mx-auto mb-4 text-[#133824]" />
            <p className="font-black text-[#133824] text-lg">{t.noPlots}</p>
            <p className="text-sm font-medium text-[#133824]/60 mt-2">{t.noPlotsHint}</p>
          </div>
        )}
      </div>
    );
  }

  // Deal History sub-view (real orders)
  if (subView === "deals") {
    return (
      <div className="absolute inset-0 z-10 bg-[#FAF8F2] pt-12 px-6 pb-32 overflow-y-auto w-full h-full animate-in fade-in slide-in-from-right-4 duration-300 pointer-events-auto">
        <div className="flex items-center justify-between mb-8">
          <Button variant="ghost" size="icon" onClick={() => setSubView("main")} className="text-[#133824] hover:bg-black/5 rounded-full h-10 w-10 cursor-pointer">
            <ChevronLeft className="size-6" />
          </Button>
          <h1 className="text-sm font-black text-[#133824] tracking-widest uppercase">{t.dealsHistory}</h1>
          <div className="w-10" />
        </div>
        
        {loadingOrders ? (
          <div className="text-center py-20"><div className="size-8 border-3 border-[#133824]/20 border-t-[#133824] animate-spin rounded-full mx-auto" /></div>
        ) : orders.length > 0 ? (
          <div className="space-y-4">
            {orders.map((order: any) => (
              <div key={order.id} className="bg-[#F3F1EA] rounded-[2rem] p-6">
                <div className="flex justify-between items-center mb-5 border-b border-[#133824]/5 pb-4">
                  <span className="text-[10px] font-bold text-[#133824]/50 uppercase tracking-widest">{t.orderDate}: {new Date(order.createdAt).toLocaleDateString()}</span>
                  <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${order.status === 'completed' ? 'bg-green-200/50 text-green-800' : order.status === 'cancelled' ? 'bg-red-200/50 text-red-800' : 'bg-amber-200/50 text-amber-800'}`}>
                    {order.status}
                  </span>
                </div>
                <div className="space-y-3">
                  {order.items?.map((item: any) => (
                    <div key={item.id} className="flex justify-between items-center">
                      <span className="text-sm font-bold text-[#133824]">{item.title}</span>
                      <span className="text-xs font-bold text-[#133824]/60">{item.quantity} {item.unit} × {Number(item.priceAtPurchase).toLocaleString()} {t.pricePer}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center mt-5 pt-4 border-t border-[#133824]/5">
                  <span className="font-black text-[#133824] text-xs uppercase tracking-widest">{t.orderTotal}</span>
                  <span className="font-black text-[#133824] text-lg">{Number(order.totalPrice).toLocaleString()} ₸</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 opacity-40 select-none">
            <ShieldCheck className="mx-auto mb-4 text-[#133824] size-12" />
            <p className="font-bold text-[#133824] text-lg">{t.noDeals}</p>
            <p className="text-sm text-[#133824]/60 mt-2">{t.noDealsHint}</p>
          </div>
        )}
      </div>
    );
  }

  // Main profile view
  return (
    <div className="absolute inset-0 z-10 bg-[#FAF8F2] pt-12 px-6 pb-32 overflow-y-auto w-full h-full animate-in fade-in slide-in-from-bottom-4 duration-500 pointer-events-auto">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-[#133824]">{t.profile}</h1>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => {
            setEditForm({ fullName: profile.name, phone: profile.phone, region: profile.region, district: profile.district });
            setSubView("settings");
          }}
          className="text-[#133824] hover:bg-black/5 rounded-full h-10 w-10 cursor-pointer"
        >
          <Settings className="size-5" />
        </Button>
      </div>

      <div className="mb-10">
        <h2 className="text-3xl font-extrabold text-[#133824] tracking-tight">{profile.name || "Фермер"}</h2>
        <p className="text-[#133824]/50 text-[11px] font-bold uppercase tracking-wider mt-1">
          {getRoleLabel(profile.role)} • {profile.phone || t.phone}
        </p>
      </div>

      <div className="space-y-8">
        <div>
          <h3 className="text-[10px] font-bold text-[#133824]/40 uppercase tracking-widest mb-3 pl-1">ACCOUNT & ACTIVITY</h3>
          <div className="bg-[#F3F1EA] rounded-2xl overflow-hidden">
            <button onClick={() => { setEditForm({ fullName: profile.name, phone: profile.phone, region: profile.region, district: profile.district }); setSubView("settings"); }} className="w-full flex items-center justify-between p-4 hover:bg-black/5 transition-colors text-left">
              <div className="flex items-center gap-4">
                <User className="size-5 text-[#133824]" />
                <span className="text-sm font-bold text-[#133824]">{t.editProfile || "Личные данные"}</span>
              </div>
              <ChevronRight className="size-4 text-[#133824]/30" />
            </button>
            <div className="h-[1px] w-full bg-[#133824]/5 mx-4" />
            <button onClick={() => { setSubView("plots"); fetchPlots(); }} className="w-full flex items-center justify-between p-4 hover:bg-black/5 transition-colors text-left">
              <div className="flex items-center gap-4">
                <MapIcon className="size-5 text-[#133824]" />
                <span className="text-sm font-bold text-[#133824]">{t.myPlots} ({plots.length})</span>
              </div>
              <ChevronRight className="size-4 text-[#133824]/30" />
            </button>
            <div className="h-[1px] w-full bg-[#133824]/5 mx-4" />
            <button onClick={() => { setSubView("deals"); fetchOrders(); }} className="w-full flex items-center justify-between p-4 hover:bg-black/5 transition-colors text-left">
              <div className="flex items-center gap-4">
                <ShieldCheck className="size-5 text-[#133824]" />
                <span className="text-sm font-bold text-[#133824]">{t.dealsHistory} ({completedDealsCount})</span>
              </div>
              <ChevronRight className="size-4 text-[#133824]/30" />
            </button>
          </div>
        </div>

        <div>
          <h3 className="text-[10px] font-bold text-[#133824]/40 uppercase tracking-widest mb-3 pl-1">SYSTEM</h3>
          <div className="bg-[#F3F1EA] rounded-2xl overflow-hidden">
            <button onClick={handleLogout} className="w-full flex items-center justify-between p-4 hover:bg-red-500/10 transition-colors text-left">
              <div className="flex items-center gap-4">
                <LogOut className="size-5 text-red-500" />
                <span className="text-sm font-bold text-red-500">{t.logout}</span>
              </div>
              <ChevronRight className="size-4 text-red-500/30" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
