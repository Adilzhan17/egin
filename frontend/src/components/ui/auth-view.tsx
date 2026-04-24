"use client";

import { useState, useRef, useEffect } from "react";
import { Eye, EyeOff, ChevronLeft, CheckCircle2, Smartphone, Mail, Lock, User, MapPin } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PlatformLanguage, ui } from "@/lib/i18n";
import { apiUrl } from "@/lib/api";

interface AuthViewProps {
  onSuccess: (authData: unknown) => void;
  language: PlatformLanguage;
}

type AuthStage = "login" | "forgot" | "verify" | "register";

export default function AuthView({ onSuccess, language }: AuthViewProps) {
  const t = ui[language];
  const [stage, setStage] = useState<AuthStage>("login");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [timer, setTimer] = useState(0);

  const [formData, setFormData] = useState({
    phone: "",
    email: "",
    password: "",
    confirmPassword: "",
    fullName: "",
    otp: ["", "", "", ""],
    region: "Алматинская",
    district: "Талгар",
    role: "farmer",
  });

  const otpRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  useEffect(() => {
    let interval: any;
    if (timer > 0) {
      interval = setInterval(() => setTimer((t) => t - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) value = value[value.length - 1];
    const newOtp = [...formData.otp];
    newOtp[index] = value;
    setFormData({ ...formData, otp: newOtp });

    if (value && index < 3) {
      otpRefs[index + 1].current?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !formData.otp[index] && index > 0) {
      otpRefs[index - 1].current?.focus();
    }
  };

  const normalizePhone = (raw: string): string => {
    let clean = raw.replace(/\D/g, "");
    if (clean.startsWith("8") && clean.length === 11) clean = "7" + clean.substring(1);
    if (!clean.startsWith("7") && clean.length === 10) clean = "7" + clean;
    if (!clean.startsWith("7")) clean = "7" + clean;
    return "+" + clean;
  };

  const validatePhone = (p: string) => {
    const normalized = normalizePhone(p);
    return /^\+7\d{10}$/.test(normalized) ? normalized : null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const phone = validatePhone(formData.phone);

    if (stage === "login") {
      if (!phone) { setErrorMsg("Введите корректный номер телефона"); return; }
      if (formData.password.length < 6) { setErrorMsg("Пароль минимум 6 символов"); return; }
      setLoading(true);
      try {
        const res = await fetch(apiUrl("/auth/login"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, password: formData.password }),
        });
        const data = await res.json();
        if (res.ok) {
          onSuccess(data.data || data);
        } else {
          setErrorMsg(data.message || "Ошибка входа");
        }
      } catch { setErrorMsg("Не удалось связаться с сервером"); }
      finally { setLoading(false); }
    }

    if (stage === "forgot") {
      if (!phone) { setErrorMsg("Введите корректный номер телефона"); return; }
      setLoading(true);
      try {
        const res = await fetch(apiUrl("/auth/otp/send"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        });
        if (res.ok) {
          setStage("verify");
          setTimer(60);
        } else {
          const data = await res.json();
          setErrorMsg(data.message || "Ошибка отправки OTP");
        }
      } catch { setErrorMsg("Ошибка сервера"); }
      finally { setLoading(false); }
    }

    if (stage === "verify") {
      const code = formData.otp.join("");
      if (code.length < 4) { setErrorMsg("Введите полный код"); return; }
      setLoading(true);
      try {
        const res = await fetch(apiUrl("/auth/otp/verify"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, code }),
        });
        if (res.ok) {
          setErrorMsg(null);
          alert("Код подтвержден! Теперь вы можете сбросить пароль (функция в разработке)");
          setStage("login");
        } else {
          setErrorMsg("Неверный код подтверждения");
        }
      } catch { setErrorMsg("Ошибка сервера"); }
      finally { setLoading(false); }
    }

    if (stage === "register") {
      if (!phone) { setErrorMsg("Введите корректный номер телефона"); return; }
      if (formData.password.length < 6) { setErrorMsg("Пароль минимум 6 символов"); return; }
      if (formData.password !== formData.confirmPassword) { setErrorMsg("Пароли не совпадают"); return; }
      setLoading(true);
      try {
        const res = await fetch(apiUrl("/auth/register"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone,
            email: formData.email,
            password: formData.password,
            fullName: formData.fullName,
            region: formData.region,
            district: formData.district,
            role: formData.role
          }),
        });
        const data = await res.json();
        if (res.ok) {
          onSuccess(data.data || data);
        } else {
          setErrorMsg(data.message || "Ошибка регистрации");
        }
      } catch { setErrorMsg("Ошибка сервера"); }
      finally { setLoading(false); }
    }
  };

  const stageData = {
    login: {
      title: "Login",
      subtitle: "",
      button: "Login",
      footer: (
        <p className="mt-6 text-center text-sm text-neutral-500">
          Don't have an account?{" "}
          <button onClick={() => setStage("register")} className="font-bold text-black hover:underline">
            Sign Up
          </button>
        </p>
      ),
    },
    forgot: {
      title: "Forgot",
      subtitle: "Forgot Password?\nDon't worry! it happens. Please enter phone number associated with your account",
      button: "Get OTP",
      footer: null,
    },
    verify: {
      title: "Verify",
      subtitle: `Enter OTP\nAn 4 digit OTP has been sent to\n${formData.phone}`,
      button: "Verify",
      footer: (
        <p className="mt-6 text-center text-sm text-neutral-500">
          Resend OTP {timer > 0 ? `(${timer.toString().padStart(2, "0")})` : (
            <button onClick={() => setTimer(60)} className="font-bold text-black hover:underline">теперь</button>
          )}
        </p>
      ),
    },
    register: {
      title: "Register",
      subtitle: "",
      button: "Sign Up",
      footer: (
        <p className="mt-6 text-center text-sm text-neutral-500">
          Already have an account?{" "}
          <button onClick={() => setStage("login")} className="font-bold text-black hover:underline">
            Sign in
          </button>
        </p>
      ),
    },
  };

  const current = stageData[stage];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white font-sans text-neutral-900 overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={stage}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="relative flex h-full w-full max-w-[440px] flex-col px-8 py-12 sm:h-auto sm:rounded-[40px] sm:bg-white sm:shadow-2xl"
        >
          {/* Header */}
          <div className="mb-12 flex items-center justify-between">
            {stage !== "login" ? (
              <button onClick={() => setStage("login")} className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-100 bg-white shadow-sm transition hover:bg-neutral-50">
                <ChevronLeft className="h-5 w-5" />
              </button>
            ) : <div className="w-10" />}
            <h1 className="text-2xl font-black tracking-tight">{current.title}</h1>
            <div className="w-10" />
          </div>

          {/* Illustration Placeholders (simplified to match mockup vibes) */}
          {(stage === "forgot" || stage === "verify") && (
            <div className="mb-10 flex flex-col items-center">
               <div className="relative mb-6 flex h-40 w-40 items-center justify-center rounded-full bg-neutral-50">
                  {stage === "forgot" ? (
                    <div className="flex flex-col items-center gap-2">
                       <Smartphone className="h-16 w-16 text-neutral-800" />
                       <div className="absolute -top-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black text-white text-xs font-bold">?</div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                       <CheckCircle2 className="h-16 w-16 text-neutral-800" />
                    </div>
                  )}
               </div>
               <div className="text-center">
                  <h2 className="mb-2 text-xl font-bold whitespace-pre-line">{current.subtitle.split('\n')[0]}</h2>
                  <p className="text-sm text-neutral-500 whitespace-pre-line">{current.subtitle.split('\n').slice(1).join('\n')}</p>
               </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            {/* Form Fields Based on Stage */}
            {stage === "register" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-neutral-500">Enter your full name</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                    <input
                      type="text"
                      placeholder="John Doe"
                      className="w-full rounded-2xl border border-neutral-200 bg-neutral-50/50 py-3.5 pl-11 pr-4 text-sm font-medium outline-none transition focus:border-black focus:ring-1 focus:ring-black/5"
                      value={formData.fullName}
                      onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {(stage === "login" || stage === "forgot" || stage === "register") && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-500">Enter your mobile number</label>
                <div className="relative flex items-center">
                  <div className="absolute left-4 flex items-center gap-1.5 border-r border-neutral-200 pr-3">
                    <span className="text-sm font-bold text-neutral-800">+91</span>
                    <div className="h-2 w-2 rounded-full bg-neutral-200" />
                  </div>
                  <input
                    type="tel"
                    placeholder="1712345678"
                    className="w-full rounded-2xl border border-neutral-200 bg-neutral-50/50 py-3.5 pl-[84px] pr-4 text-sm font-bold tracking-wider outline-none transition focus:border-black focus:ring-1 focus:ring-black/5"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    required
                  />
                  <CheckCircle2 className="absolute right-4 h-4 w-4 text-neutral-300" />
                </div>
              </div>
            )}

            {stage === "register" && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-500">Enter your email</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="email"
                    placeholder="abc12@gmail.com"
                    className="w-full rounded-2xl border border-neutral-200 bg-neutral-50/50 py-3.5 pl-11 pr-4 text-sm font-medium outline-none transition focus:border-black focus:ring-1 focus:ring-black/5"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    required
                  />
                </div>
              </div>
            )}

            {(stage === "login" || stage === "register") && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-500">Enter your password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••••••"
                    className="w-full rounded-2xl border border-neutral-200 bg-neutral-50/50 py-3.5 pl-11 pr-11 text-sm outline-none transition focus:border-black focus:ring-1 focus:ring-black/5"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    required
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-black">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {stage === "login" && (
                  <button type="button" onClick={() => setStage("forgot")} className="block w-full text-right text-[11px] font-bold text-neutral-500 hover:text-black">
                    forgot password?
                  </button>
                )}
              </div>
            )}

            {stage === "register" && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-500">Re-Enter your password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••••••"
                    className="w-full rounded-2xl border border-neutral-200 bg-neutral-50/50 py-3.5 pl-11 pr-11 text-sm outline-none transition focus:border-black focus:ring-1 focus:ring-black/5"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                    required
                  />
                </div>
              </div>
            )}

            {stage === "verify" && (
              <div className="flex justify-between gap-3 px-2">
                {formData.otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={otpRefs[i]}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    className="h-16 w-14 rounded-2xl border border-neutral-200 bg-neutral-50/50 text-center text-2xl font-bold outline-none transition focus:border-black focus:ring-1 focus:ring-black/5"
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  />
                ))}
              </div>
            )}

            {errorMsg && (
              <p className="rounded-xl bg-red-50 p-3 text-center text-xs font-bold text-red-500">
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-4 flex h-14 w-full items-center justify-center rounded-2xl bg-neutral-900 text-[15px] font-black text-white transition hover:bg-black active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              ) : current.button}
            </button>
          </form>

          {current.footer}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
