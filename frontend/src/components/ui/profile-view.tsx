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
      <div className="absolute inset-0 z-10 bg-[#FAF8F2] pt-8 px-6 pb-32 overflow-y-auto w-full h-full animate-in fade-in slide-in-from-right-4 duration-300 pointer-events-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => setSubView("main")} className="text-[#2F6B3D] hover:bg-white/60 bg-white/30 backdrop-blur-md rounded-2xl h-12 w-12 shadow-sm cursor-pointer">
            <ChevronLeft className="size-6" />
          </Button>
          <h1 className="text-3xl font-black text-[#2F6B3D] tracking-tighter">{t.editProfile}</h1>
        </div>

        {saveSuccess && (
          <div className="mb-6 p-4 bg-green-100 border border-green-300 rounded-2xl flex items-center gap-3 animate-in fade-in duration-300">
            <Check className="size-5 text-green-600" />
            <span className="font-bold text-green-700 text-sm">{t.profileSaved}</span>
          </div>
        )}

        <div className="space-y-5">
          <div className="space-y-1">
            <Label className="text-[10px] font-black text-[#2F6B3D]/50 ml-2 uppercase">{t.fullName}</Label>
            <Input value={editForm.fullName} onChange={e => setEditForm({...editForm, fullName: e.target.value})} className="rounded-2xl h-14 bg-white border-none font-bold text-[#2F6B3D] shadow-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-black text-[#2F6B3D]/50 ml-2 uppercase">{t.phone}</Label>
            <Input value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} className="rounded-2xl h-14 bg-white border-none font-bold text-[#2F6B3D] shadow-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px] font-black text-[#2F6B3D]/50 ml-2 uppercase">{t.region}</Label>
              <Input value={editForm.region} onChange={e => setEditForm({...editForm, region: e.target.value})} className="rounded-2xl h-14 bg-white border-none font-bold text-[#2F6B3D] shadow-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-black text-[#2F6B3D]/50 ml-2 uppercase">{t.district}</Label>
              <Input value={editForm.district} onChange={e => setEditForm({...editForm, district: e.target.value})} className="rounded-2xl h-14 bg-white border-none font-bold text-[#2F6B3D] shadow-sm" />
            </div>
          </div>

          {/* Avatar */}
          <div className="space-y-2">
            <Label className="text-[10px] font-black text-[#2F6B3D]/50 ml-2 uppercase">{t.avatarUpdated?.replace("!", "") || "Фото"}</Label>
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-2xl bg-white overflow-hidden shadow-md flex items-center justify-center">
                {avatar ? <img src={avatar} className="w-full h-full object-cover" /> : <User className="size-8 text-[#2F6B3D]/20" />}
              </div>
              <label className="px-4 py-2 bg-[#F5F9F4] text-[#2F6B3D] rounded-xl text-sm font-bold cursor-pointer hover:bg-[#E8F0E5] transition-colors">
                {t.change}
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </label>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-10">
          <Button onClick={() => setSubView("main")} variant="outline" className="flex-1 h-14 rounded-2xl border-[#2F6B3D]/20 text-[#2F6B3D] font-black">
            <X className="size-4 mr-2" /> {t.cancelDrawing}
          </Button>
          <Button onClick={handleSaveProfile} disabled={savingProfile} className="flex-1 h-14 rounded-2xl bg-[#2F6B3D] text-white font-black shadow-lg active:scale-95 transition-all disabled:opacity-50">
            <Save className="size-4 mr-2" /> {savingProfile ? t.wait : t.saveChanges}
          </Button>
        </div>
      </div>
    );
  }

  // My Plots sub-view
  if (subView === "plots") {
    return (
      <div className="absolute inset-0 z-10 bg-[#FAF8F2] pt-8 px-6 pb-32 overflow-y-auto w-full h-full animate-in fade-in slide-in-from-right-4 duration-300 pointer-events-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => setSubView("main")} className="text-[#2F6B3D] hover:bg-white/60 bg-white/30 backdrop-blur-md rounded-2xl h-12 w-12 shadow-sm cursor-pointer">
            <ChevronLeft className="size-6" />
          </Button>
          <h1 className="text-3xl font-black text-[#2F6B3D] tracking-tighter">{t.myPlots}</h1>
        </div>
        {loadingPlots ? (
          <div className="text-center py-20"><div className="size-8 border-3 border-[#2F6B3D]/20 border-t-[#2F6B3D] animate-spin rounded-full mx-auto" /></div>
        ) : plots.length > 0 ? (
          <div className="space-y-3">
            {plots.map((plot: any) => (
              <Card key={plot.id} className="border-none shadow-md shadow-green-900/5 rounded-[1.5rem] bg-white/80 overflow-hidden">
                <CardContent className="p-4 flex gap-4">
                  <div className="h-16 w-16 rounded-2xl bg-[#F5F9F4] flex items-center justify-center text-2xl shadow-inner shrink-0">🌾</div>
                  <div className="flex flex-col justify-center flex-1">
                    <h3 className="font-extrabold text-[#2F6B3D] text-lg leading-none">{plot.title}</h3>
                    <p className="text-muted-foreground text-xs font-bold mt-1">{plot.cropType} • {plot.areaSizeHectares} {t.hectares}</p>
                    <p className="text-muted-foreground/60 text-[10px] font-bold mt-1 uppercase">{plot.region}, {plot.district}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 opacity-40 select-none">
            <MapIcon className="size-16 mx-auto mb-4 text-[#2F6B3D]" />
            <p className="font-black text-[#2F6B3D] text-lg">{t.noPlots}</p>
            <p className="text-sm font-medium text-[#2F6B3D]/60 mt-2">{t.noPlotsHint}</p>
          </div>
        )}
      </div>
    );
  }

  // Deal History sub-view (real orders)
  if (subView === "deals") {
    return (
      <div className="absolute inset-0 z-10 bg-[#FAF8F2] pt-8 px-6 pb-32 overflow-y-auto w-full h-full animate-in fade-in slide-in-from-right-4 duration-300 pointer-events-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => setSubView("main")} className="text-[#2F6B3D] hover:bg-white/60 bg-white/30 backdrop-blur-md rounded-2xl h-12 w-12 shadow-sm cursor-pointer">
            <ChevronLeft className="size-6" />
          </Button>
          <h1 className="text-3xl font-black text-[#2F6B3D] tracking-tighter">{t.dealsHistory}</h1>
        </div>
        {loadingOrders ? (
          <div className="text-center py-20"><div className="size-8 border-3 border-[#2F6B3D]/20 border-t-[#2F6B3D] animate-spin rounded-full mx-auto" /></div>
        ) : orders.length > 0 ? (
          <div className="space-y-3">
            {orders.map((order: any) => (
              <Card key={order.id} className="border-none shadow-md rounded-[1.5rem] bg-white/80 overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[10px] font-black text-[#2F6B3D]/40 uppercase">{t.orderDate}: {new Date(order.createdAt).toLocaleDateString()}</span>
                    <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase ${order.status === 'completed' ? 'bg-green-100 text-green-700' : order.status === 'cancelled' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
                      {order.status}
                    </span>
                  </div>
                  {order.items?.map((item: any) => (
                    <div key={item.id} className="flex justify-between items-center py-1.5 border-t border-[#F5F9F4]">
                      <span className="text-sm font-bold text-[#2F6B3D]">{item.title}</span>
                      <span className="text-xs font-bold text-muted-foreground">{item.quantity} {item.unit} × {Number(item.priceAtPurchase).toLocaleString()} {t.pricePer}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center mt-3 pt-3 border-t border-[#E8F0E5]">
                    <span className="font-black text-[#2F6B3D] text-sm">{t.orderTotal}:</span>
                    <span className="font-black text-[#C6A85E] text-lg">{Number(order.totalPrice).toLocaleString()} {t.pricePer}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 opacity-40 select-none">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-4 text-[#C6A85E]">
              <path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
            <p className="font-black text-[#2F6B3D] text-lg">{t.noDeals}</p>
            <p className="text-sm font-medium text-[#2F6B3D]/60 mt-2">{t.noDealsHint}</p>
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
