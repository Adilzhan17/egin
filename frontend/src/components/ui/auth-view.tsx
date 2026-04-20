"use client";

import { useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import { PlatformLanguage, ui } from "@/lib/i18n";
import { apiUrl } from "@/lib/api";

interface AuthViewProps {
  onSuccess: (authData: unknown) => void;
  language: PlatformLanguage;
  /** Optional custom logo URL. If omitted, shows the default leaf SVG. */
  logoUrl?: string;
}

type IdentifierMode = "phone" | "iin";

// Autofill color override – injects a dark bg via box-shadow trick
const INPUT_AUTOFILL_STYLE: React.CSSProperties = {
  WebkitBoxShadow: "0 0 0 1000px #0a1f13 inset",
  WebkitTextFillColor: "rgba(255,255,255,0.88)",
  caretColor: "white",
};

const inputCls =
  "w-full rounded-[0.875rem] border border-white/10 bg-[#0a1f13] px-4 text-[0.875rem] font-semibold text-white/90 placeholder-white/20 outline-none transition-all duration-200 focus:border-[#4ADE80]/50 focus:ring-1 focus:ring-[#4ADE80]/20";

export default function AuthView({ onSuccess, language, logoUrl }: AuthViewProps) {
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
    <div className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto"
      style={{ background: "radial-gradient(ellipse 120% 80% at 50% 0%, #0d3320 0%, #001a0f 45%, #000e08 100%)" }}
    >
      {/* Subtle noise texture */}
      <div className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E\")",
          backgroundRepeat: "repeat",
          opacity: 0.6,
        }}
      />
      {/* Bottom glow */}
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-64 w-96 -translate-x-1/2 translate-y-1/2 rounded-full bg-[#4ADE80]/6 blur-3xl" />

      <div className="relative w-full max-w-sm px-5 py-12">
        {/* Logo + brand */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-[68px] w-[68px] items-center justify-center overflow-hidden rounded-[1.5rem] bg-[#0a2416] ring-1 ring-white/10">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" />
            ) : (
              <svg viewBox="0 0 32 32" className="h-9 w-9" fill="none">
                <path d="M16 3C9.5 3 4 8.5 4 16c0 5.2 2.9 9.8 7.2 12.1" stroke="#4ADE80" strokeWidth="1.8" strokeLinecap="round"/>
                <path d="M16 3c4.8 3.2 8 9 8 13 0 4.8-2.8 9-7 11.2" stroke="#4ADE80" strokeWidth="1.8" strokeLinecap="round"/>
                <line x1="16" y1="7" x2="16" y2="27" stroke="#4ADE80" strokeWidth="1" strokeOpacity="0.25" strokeLinecap="round"/>
                <path d="M9 13c1.8-3.5 4.5-6 7-7" stroke="#4ADE80" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.4"/>
              </svg>
            )}
          </div>
          <div className="text-center">
            <h1 className="text-[1.6rem] font-black tracking-tight text-white">E-gin</h1>
            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.3em] text-white/25">
              {isKk ? "Қазақстан агроплатформасы" : "Агроплатформа Казахстана"}
            </p>
          </div>
          {/* Server status */}
          <div className="flex items-center gap-1.5">
            <span className={`inline-block h-[6px] w-[6px] rounded-full ${
              serverStatus === "online"
                ? "bg-[#4ADE80] shadow-[0_0_8px_rgba(74,222,128,0.8)] animate-pulse"
                : serverStatus === "offline"
                ? "bg-red-400"
                : "bg-white/20"
            }`} />
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/20">
              {serverStatus === "online"
                ? (isKk ? "Онлайн" : "Онлайн")
                : serverStatus === "offline"
                ? (isKk ? "Сервер қолжетімсіз" : "Сервер недоступен")
                : (isKk ? "Тексерілуде" : "Проверка")}
            </span>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-[1.75rem] border border-white/[0.07] bg-[#071510]/80 p-7 shadow-[0_32px_80px_rgba(0,0,0,0.5)] backdrop-blur-md">
          <h2 className="mb-1 text-[1.25rem] font-black text-white">
            {isLogin
              ? (isKk ? "Қош келдіңіз" : "Добро пожаловать")
              : (isKk ? "Тіркелу" : "Регистрация")}
          </h2>
          <p className="mb-6 text-[11px] text-white/35">
            {isLogin
              ? (isKk ? "Жүйеге кіру үшін деректерді енгізіңіз" : "Введите данные для входа в систему")
              : (isKk ? "Жаңа аккаунт жасаңыз" : "Создайте новый аккаунт")}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Registration-only */}
            {!isLogin && (
              <>
                <div className="space-y-1.5">
                  <label className="ml-1 block text-[10px] font-black uppercase tracking-widest text-white/30">
                    {isKk ? "Толық аты-жөні" : "Полное имя"}
                  </label>
                  <input
                    type="text"
                    placeholder={isKk ? "Еділ Таласбеков" : "Едиль Таласбеков"}
                    className={`${inputCls} h-12`}
                    style={INPUT_AUTOFILL_STYLE}
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="ml-1 block text-[10px] font-black uppercase tracking-widest text-white/30">
                    {isKk ? "Рөл" : "Роль"}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {roleOptions.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, role: r.value })}
                        className={`flex flex-col items-center gap-1 rounded-[0.75rem] py-2.5 text-center transition-all active:scale-95 ${
                          formData.role === r.value
                            ? "bg-[#4ADE80]/12 ring-1 ring-[#4ADE80]/35 text-[#4ADE80]"
                            : "bg-white/4 text-white/40 hover:bg-white/7"
                        }`}
                      >
                        <span className="text-base leading-none">{r.emoji}</span>
                        <span className="mt-0.5 text-[9px] font-black uppercase leading-none">{r.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: "region" as const, label: isKk ? "Облыс" : "Область", placeholder: "Алматинская" },
                    { key: "district" as const, label: isKk ? "Аудан" : "Район", placeholder: "Талгар" },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key} className="space-y-1.5">
                      <label className="ml-1 block text-[10px] font-black uppercase tracking-widest text-white/30">{label}</label>
                      <input
                        type="text"
                        placeholder={placeholder}
                        className={`${inputCls} h-12`}
                        style={INPUT_AUTOFILL_STYLE}
                        value={formData[key]}
                        onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                        required
                      />
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Identifier */}
            <div className="space-y-1.5">
              <div className="ml-1 flex items-center gap-1">
                {(["phone", "iin"] as IdentifierMode[]).map((mode, i) => (
                  <span key={mode} className="flex items-center gap-1">
                    {i > 0 && <span className="text-white/15 text-xs">·</span>}
                    <button
                      type="button"
                      onClick={() => { setIdMode(mode); setFormData({ ...formData, identifier: "" }); }}
                      className={`text-[10px] font-black uppercase tracking-widest transition ${
                        idMode === mode ? "text-[#4ADE80]" : "text-white/25 hover:text-white/45"
                      }`}
                    >
                      {mode === "phone" ? (isKk ? "Телефон" : "Телефон") : "ИИН"}
                    </button>
                  </span>
                ))}
              </div>
              <div className="relative">
                {idMode === "phone" && (
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-white/30 select-none">
                    +7
                  </span>
                )}
                <input
                  type={idMode === "iin" ? "text" : "tel"}
                  inputMode={idMode === "iin" ? "numeric" : "tel"}
                  maxLength={idMode === "iin" ? 12 : 18}
                  placeholder={idMode === "phone" ? "700 000-00-00" : (isKk ? "12 сан" : "12 цифр")}
                  className={`${inputCls} h-12 ${idMode === "phone" ? "pl-10" : ""}`}
                  style={INPUT_AUTOFILL_STYLE}
                  value={formData.identifier}
                  onChange={(e) => {
                    const v = idMode === "iin"
                      ? e.target.value.replace(/\D/g, "").slice(0, 12)
                      : e.target.value;
                    setFormData({ ...formData, identifier: v });
                  }}
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="ml-1 flex items-center justify-between">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/30">
                  {isKk ? "Құпия сөз" : "Пароль"}
                </label>
                {isLogin && (
                  <button type="button" className="text-[10px] font-semibold text-[#4ADE80]/50 transition hover:text-[#4ADE80]">
                    {isKk ? "Ұмыттым" : "Забыл пароль"}
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className={`${inputCls} h-12 pr-11`}
                  style={INPUT_AUTOFILL_STYLE}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 transition hover:text-white/55"
                >
                  {showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {errorMsg && (
              <div className="rounded-[0.75rem] border border-red-500/15 bg-red-500/8 px-4 py-2.5 text-[11px] font-semibold text-red-400 animate-in fade-in duration-200">
                {errorMsg}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || serverStatus === "offline"}
              className="mt-1 flex h-[52px] w-full items-center justify-center gap-2 rounded-[0.875rem] bg-[#4ADE80] font-black text-[0.875rem] text-[#001710] shadow-[0_4px_24px_rgba(74,222,128,0.2)] transition-all duration-200 hover:bg-[#5ee890] active:scale-[0.98] disabled:opacity-35 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#001710]/20 border-t-[#001710]" />
                  {isKk ? "Күте тұрыңыз..." : "Подождите..."}
                </>
              ) : (
                <>
                  {isLogin ? (isKk ? "Жүйеге кіру" : "Войти в систему") : (isKk ? "Аккаунт жасау" : "Создать аккаунт")}
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M3 8h10M9 4l4 4-4 4" />
                  </svg>
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/[0.06]" />
            <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-white/15">
              {isKk ? "немесе" : "или"}
            </span>
            <div className="h-px flex-1 bg-white/[0.06]" />
          </div>

          {/* eGov */}
          <button
            type="button"
            onClick={() => alert(isKk
              ? "eGov арқылы кіру жақында қосылады"
              : "Вход через eGov будет доступен в ближайшем обновлении"
            )}
            className="flex h-12 w-full items-center justify-center gap-2.5 rounded-[0.875rem] border border-white/10 bg-white/[0.03] text-[0.8125rem] font-bold text-white/50 transition-all hover:border-white/15 hover:bg-white/[0.06] hover:text-white/70 active:scale-[0.98]"
          >
            <svg viewBox="0 0 20 20" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <rect x="1.5" y="3" width="17" height="12" rx="1.5"/>
              <path d="M7 15v2.5M13 15v2.5M4.5 18h11"/>
              <path d="M10 6.5v3M8.5 8h3"/>
            </svg>
            {isKk ? "eGov арқылы кіру" : "Войти через eGov"}
          </button>

          {/* Toggle */}
          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => { setIsLogin(!isLogin); setErrorMsg(null); }}
              className="text-[11px] font-semibold text-white/25 transition hover:text-white/50"
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
