"use client";

import { useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import { PlatformLanguage, ui } from "@/lib/i18n";
import { apiUrl } from "@/lib/api";

interface AuthViewProps {
  onSuccess: (authData: unknown) => void;
  language: PlatformLanguage;
}

type IdentifierMode = "phone" | "iin";

export default function AuthView({ onSuccess, language }: AuthViewProps) {
  const t = ui[language];
  const isKk = language === "kk";

  const [isLogin, setIsLogin] = useState(true);
  const [idMode, setIdMode] = useState<IdentifierMode>("phone");
  const [formData, setFormData] = useState({
    identifier: "",
    password: "",
    fullName: "",
    region: "Алматинская",
    district: "Талгар",
    role: "farmer",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverStatus, setServerStatus] = useState<"checking" | "online" | "offline">("checking");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const normalizePhone = (raw: string): string => {
    let clean = raw.replace(/\D/g, "");
    if (clean.startsWith("8") && clean.length === 11) clean = "7" + clean.substring(1);
    if (!clean.startsWith("7") && clean.length === 10) clean = "7" + clean;
    return "+" + clean;
  };

  const resolveIdentifier = (): { value: string; error: string | null } => {
    if (idMode === "phone") {
      const normalized = normalizePhone(formData.identifier);
      if (!/^\+7\d{10}$/.test(normalized))
        return { value: "", error: isKk ? "Телефон форматы қате" : "Неверный формат телефона" };
      return { value: normalized, error: null };
    }
    const digits = formData.identifier.replace(/\D/g, "");
    if (digits.length !== 12)
      return { value: "", error: isKk ? "ИИН 12 саннан тұрады" : "ИИН должен содержать 12 цифр" };
    return { value: digits, error: null };
  };

  useEffect(() => {
    fetch(apiUrl("/"))
      .then((r) => setServerStatus(r.ok ? "online" : "offline"))
      .catch(() => setServerStatus("offline"));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password.length < 6) {
      setErrorMsg(isKk ? "Құпия сөз кем дегенде 6 таңба" : "Пароль минимум 6 символов");
      return;
    }
    const { value: identifier, error: idError } = resolveIdentifier();
    if (idError) { setErrorMsg(idError); return; }
    setLoading(true);
    setErrorMsg(null);

    const phoneField = idMode === "phone" ? identifier : `IIN:${identifier}`;
    const endpoint = isLogin ? "/auth/login" : "/auth/register";
    const payload = isLogin
      ? { phone: phoneField, password: formData.password }
      : {
          phone: phoneField,
          password: formData.password,
          fullName: formData.fullName,
          region: formData.region,
          district: formData.district,
          role: formData.role,
        };

    try {
      const res = await fetch(apiUrl(endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        const authData = data.data || data;
        if (authData.access_token) {
          if (authData.user) {
            localStorage.setItem("agro_user_id", authData.user.id || "");
            localStorage.setItem("agro_user_phone", authData.user.phone || phoneField);
            localStorage.setItem("agro_user_role", authData.user.role || "farmer");
            localStorage.setItem("agro_user_region", authData.user.region || "");
            localStorage.setItem("agro_user_district", authData.user.district || "");
          }
          onSuccess(authData);
        } else {
          setErrorMsg(t.noAccessToken);
        }
      } else {
        if (res.status === 401 && isLogin) setErrorMsg(t.invalidCredentials);
        else if (res.status === 409 && !isLogin) { setErrorMsg(t.alreadyRegistered); setIsLogin(true); }
        else {
          const msg = Array.isArray(data.message) ? data.message.join("\n") : data.message;
          setErrorMsg(msg || `Ошибка (${res.status})`);
        }
      }
    } catch {
      setErrorMsg(t.cannotReachServer);
    } finally {
      setLoading(false);
    }
  };

  const roleOptions = [
    { value: "farmer", label: isKk ? "Фермер" : "Фермер", emoji: "🌾" },
    { value: "seller", label: isKk ? "Сатушы" : "Продавец", emoji: "🏪" },
    { value: "buyer", label: isKk ? "Сатып алушы" : "Покупатель", emoji: "🛒" },
  ];

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#001710]">
      {/* Background texture */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #4ADE80 1px, transparent 0)", backgroundSize: "32px 32px" }}
      />
      {/* Glow */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-[400px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#4ADE80]/8 blur-3xl" />

      <div className="relative w-full max-w-sm px-5 py-10">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-[#4ADE80]/10 ring-1 ring-[#4ADE80]/20">
            <svg viewBox="0 0 32 32" className="h-8 w-8" fill="none">
              <path d="M16 4C10 4 5 9 5 16c0 5 3 9.5 7.5 11.5" stroke="#4ADE80" strokeWidth="1.8" strokeLinecap="round"/>
              <path d="M16 4c4 3 7 8 7 12 0 4.5-2.5 8.5-6.5 10.5" stroke="#4ADE80" strokeWidth="1.8" strokeLinecap="round"/>
              <path d="M8 16c2-4 5-7 8-8" stroke="#4ADE80" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5"/>
              <path d="M16 8v16" stroke="#4ADE80" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.3"/>
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-black tracking-tight text-white">EGIN</h1>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.25em] text-white/30">
              {isKk ? "Қазақстан агроплатформасы" : "Агроплатформа Казахстана"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${
              serverStatus === "online" ? "bg-[#4ADE80] shadow-[0_0_6px_#4ADE80]" :
              serverStatus === "offline" ? "bg-red-400" : "bg-white/20"
            } ${serverStatus === "online" ? "animate-pulse" : ""}`} />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/25">
              {serverStatus === "online" ? (isKk ? "Сервер қосылды" : "Сервер онлайн") :
               serverStatus === "offline" ? (isKk ? "Сервер офлайн" : "Сервер недоступен") :
               (isKk ? "Тексерілуде..." : "Проверка...")}
            </span>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-[2rem] border border-white/8 bg-white/4 p-6 backdrop-blur-sm">
          <h2 className="mb-1 text-xl font-black text-white">
            {isLogin
              ? (isKk ? "Қош келдіңіз" : "Добро пожаловать")
              : (isKk ? "Тіркелу" : "Регистрация")}
          </h2>
          <p className="mb-6 text-[11px] font-medium text-white/40">
            {isLogin
              ? (isKk ? "Жүйеге кіру үшін деректерді енгізіңіз" : "Введите данные для входа в систему")
              : (isKk ? "Жаңа аккаунт жасаңыз" : "Создайте новый аккаунт")}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Registration-only fields */}
            {!isLogin && (
              <>
                <div className="space-y-1.5">
                  <label className="ml-1 text-[10px] font-bold uppercase tracking-wider text-white/40">
                    {isKk ? "Толық аты-жөні" : "Полное имя"}
                  </label>
                  <input
                    type="text"
                    placeholder={isKk ? "Еділ Таласбеков" : "Едиль Таласбеков"}
                    className="h-13 w-full rounded-[1rem] border border-white/8 bg-white/6 px-4 text-sm font-semibold text-white placeholder-white/25 outline-none transition focus:border-[#4ADE80]/40 focus:bg-white/8"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="ml-1 text-[10px] font-bold uppercase tracking-wider text-white/40">
                    {isKk ? "Рөл" : "Роль"}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {roleOptions.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, role: r.value })}
                        className={`flex flex-col items-center gap-1 rounded-[0.875rem] py-2.5 text-center transition-all active:scale-95 ${
                          formData.role === r.value
                            ? "bg-[#4ADE80]/15 ring-1 ring-[#4ADE80]/40 text-[#4ADE80]"
                            : "bg-white/4 text-white/50 hover:bg-white/8"
                        }`}
                      >
                        <span className="text-base">{r.emoji}</span>
                        <span className="text-[9px] font-black uppercase leading-tight">{r.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="ml-1 text-[10px] font-bold uppercase tracking-wider text-white/40">
                      {isKk ? "Облыс" : "Область"}
                    </label>
                    <input
                      type="text"
                      placeholder="Алматинская"
                      className="h-13 w-full rounded-[1rem] border border-white/8 bg-white/6 px-4 text-sm font-semibold text-white placeholder-white/25 outline-none transition focus:border-[#4ADE80]/40 focus:bg-white/8"
                      value={formData.region}
                      onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="ml-1 text-[10px] font-bold uppercase tracking-wider text-white/40">
                      {isKk ? "Аудан" : "Район"}
                    </label>
                    <input
                      type="text"
                      placeholder="Талгар"
                      className="h-13 w-full rounded-[1rem] border border-white/8 bg-white/6 px-4 text-sm font-semibold text-white placeholder-white/25 outline-none transition focus:border-[#4ADE80]/40 focus:bg-white/8"
                      value={formData.district}
                      onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                      required
                    />
                  </div>
                </div>
              </>
            )}

            {/* Identifier: Phone or IIN */}
            <div className="space-y-1.5">
              <div className="ml-1 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => { setIdMode("phone"); setFormData({ ...formData, identifier: "" }); }}
                  className={`text-[10px] font-black uppercase tracking-wider transition ${
                    idMode === "phone" ? "text-[#4ADE80]" : "text-white/30 hover:text-white/50"
                  }`}
                >
                  {isKk ? "Телефон" : "Телефон"}
                </button>
                <span className="text-white/15 text-[10px]">·</span>
                <button
                  type="button"
                  onClick={() => { setIdMode("iin"); setFormData({ ...formData, identifier: "" }); }}
                  className={`text-[10px] font-black uppercase tracking-wider transition ${
                    idMode === "iin" ? "text-[#4ADE80]" : "text-white/30 hover:text-white/50"
                  }`}
                >
                  ИИН
                </button>
              </div>
              <div className="relative">
                {idMode === "phone" && (
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-white/30 select-none">
                    +7
                  </span>
                )}
                <input
                  type={idMode === "iin" ? "text" : "tel"}
                  inputMode={idMode === "iin" ? "numeric" : "tel"}
                  maxLength={idMode === "iin" ? 12 : 18}
                  placeholder={idMode === "phone"
                    ? "(700) 000-00-00"
                    : (isKk ? "12 сан" : "12 цифр")}
                  className={`h-13 w-full rounded-[1rem] border border-white/8 bg-white/6 text-sm font-semibold text-white placeholder-white/25 outline-none transition focus:border-[#4ADE80]/40 focus:bg-white/8 ${
                    idMode === "phone" ? "pl-10 pr-4" : "px-4"
                  }`}
                  value={formData.identifier}
                  onChange={(e) => {
                    const v = idMode === "iin" ? e.target.value.replace(/\D/g, "").slice(0, 12) : e.target.value;
                    setFormData({ ...formData, identifier: v });
                  }}
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="ml-1 flex items-center justify-between">
                <label className="text-[10px] font-black uppercase tracking-wider text-white/40">
                  {isKk ? "Құпия сөз" : "Пароль"}
                </label>
                {isLogin && (
                  <button type="button" className="text-[10px] font-bold text-[#4ADE80]/60 hover:text-[#4ADE80] transition">
                    {isKk ? "Ұмыттым" : "Забыл пароль"}
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="h-13 w-full rounded-[1rem] border border-white/8 bg-white/6 px-4 pr-12 text-sm font-semibold text-white placeholder-white/25 outline-none transition focus:border-[#4ADE80]/40 focus:bg-white/8"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {errorMsg && (
              <div className="rounded-[0.875rem] border border-red-500/20 bg-red-500/10 px-4 py-3 text-[11px] font-bold text-red-400 animate-in fade-in duration-200">
                {errorMsg}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || serverStatus === "offline"}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-[1rem] bg-[#4ADE80] font-black text-[#001710] text-sm shadow-[0_8px_32px_rgba(74,222,128,0.25)] transition-all duration-200 hover:bg-[#3ecb70] active:scale-98 disabled:opacity-40"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#001710]/20 border-t-[#001710]" />
                  <span>{isKk ? "Күте тұрыңыз..." : "Подождите..."}</span>
                </>
              ) : (
                <>
                  <span>{isLogin ? (isKk ? "Жүйеге кіру" : "Войти в систему") : (isKk ? "Аккаунт жасау" : "Создать аккаунт")}</span>
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M3 8h10M9 4l4 4-4 4" />
                  </svg>
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/8" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/20">
              {isKk ? "немесе" : "или"}
            </span>
            <div className="h-px flex-1 bg-white/8" />
          </div>

          {/* eGov button */}
          <button
            type="button"
            onClick={() => alert(isKk ? "eGov арқылы кіру жақында қосылады" : "Вход через eGov будет доступен в ближайшем обновлении")}
            className="flex h-13 w-full items-center justify-center gap-3 rounded-[1rem] border border-white/10 bg-white/4 font-bold text-sm text-white/70 transition-all hover:bg-white/8 hover:text-white active:scale-98"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none">
              <rect x="2" y="3" width="20" height="15" rx="2" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 18v3M16 18v3M5 21h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M12 7v4M10 9h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="12" cy="7" r="1" fill="currentColor"/>
            </svg>
            <span>{isKk ? "eGov арқылы кіру" : "Войти через eGov"}</span>
          </button>

          {/* Toggle */}
          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => { setIsLogin(!isLogin); setErrorMsg(null); }}
              className="text-[11px] font-bold text-white/30 transition hover:text-white/60"
            >
              {isLogin
                ? (isKk ? "Аккаунт жоқ па? Тіркелу →" : "Нет аккаунта? Зарегистрироваться →")
                : (isKk ? "Аккаунт бар ма? Кіру →" : "Уже есть аккаунт? Войти →")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
