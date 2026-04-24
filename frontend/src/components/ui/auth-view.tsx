'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronLeft, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  Smartphone,
  Lock,
} from 'lucide-react';
import { PlatformLanguage, ui } from "@/lib/i18n";
import { apiUrl } from "@/lib/api";

type AuthStage = 'login' | 'forgot' | 'verify' | 'register' | 'reset-password';

interface AuthViewProps {
  onSuccess: (authData: unknown) => void;
  language: PlatformLanguage;
}

export default function AuthView({ onSuccess, language }: AuthViewProps) {
  const t = ui[language];
  const [stage, setStage] = useState<AuthStage>('login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '']);
  const [timer, setTimer] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const otpRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  // Registration states
  const [regData, setRegData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  useEffect(() => {
    let interval: any;
    if (timer > 0) {
      interval = setInterval(() => setTimer(prev => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) value = value[value.length - 1];
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 3) {
      otpRefs[index + 1].current?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs[index - 1].current?.focus();
    }
  };

  const formatPhoneNumber = (value: string) => {
    // Only allow digits
    let clean = value.replace(/\D/g, "");
    
    // Handle leading 8 or 7 (Kazakhstan standards)
    if (clean.length > 10) {
      if (clean.startsWith("8") || clean.startsWith("7")) {
        clean = clean.substring(1);
      }
    } else if (clean.length === 11 && (clean.startsWith("8") || clean.startsWith("7"))) {
       clean = clean.substring(1);
    }

    // Limit to 10 digits
    clean = clean.substring(0, 10);

    // Format: 777 777 77 77
    let formatted = "";
    if (clean.length > 0) {
      formatted += clean.substring(0, 3);
      if (clean.length > 3) {
        formatted += " " + clean.substring(3, 6);
      }
      if (clean.length > 6) {
        formatted += " " + clean.substring(6, 8);
      }
      if (clean.length > 8) {
        formatted += " " + clean.substring(8, 10);
      }
    }
    return formatted;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhone(formatted);
  };

  const normalizePhone = (raw: string): string => {
    let clean = raw.replace(/\D/g, "");
    if (clean.length === 11 && (clean.startsWith("7") || clean.startsWith("8"))) {
      return "+7" + clean.substring(1);
    }
    if (clean.length === 10) {
      return "+7" + clean;
    }
    return "+" + clean;
  };

  const validatePhone = (p: string) => {
    const normalized = normalizePhone(p);
    return /^\+7\d{10}$/.test(normalized) ? normalized : null;
  };

  const handleAction = async () => {
    setErrorMsg(null);
    const normalizedPhone = validatePhone(phone);

    if (stage === 'login') {
      if (!normalizedPhone) { setErrorMsg("Введите корректный номер телефона"); return; }
      if (password.length < 6) { setErrorMsg("Пароль минимум 6 символов"); return; }
      setIsLoading(true);
      try {
        const res = await fetch(apiUrl("/auth/login"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ phone: normalizedPhone, password }),
        });
        const data = await res.json();
        if (res.ok) { onSuccess(data.data || data); }
        else { setErrorMsg(data.message || "Ошибка входа. Проверьте данные."); }
      } catch { setErrorMsg("Ошибка соединения с сервером"); }
      finally { setIsLoading(false); }
    } else if (stage === 'forgot') {
      if (!normalizedPhone) { setErrorMsg("Введите корректный номер телефона"); return; }
      setIsLoading(true);
      try {
        const res = await fetch(apiUrl("/auth/otp/send"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ phone: normalizedPhone }),
        });
        if (res.ok) { setStage('verify'); setTimer(60); }
        else { const data = await res.json(); setErrorMsg(data.message || "Ошибка"); }
      } catch { setErrorMsg("Ошибка сервера"); }
      finally { setIsLoading(false); }
    } else if (stage === 'verify') {
      const code = otp.join("");
      if (code.length < 4) { setErrorMsg("Введите полный код"); return; }
      setIsLoading(true);
      try {
        const res = await fetch(apiUrl("/auth/otp/verify"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ phone: normalizedPhone, code }),
        });
        if (res.ok) { setStage('reset-password'); }
        else { setErrorMsg("Неверный код"); }
      } catch { setErrorMsg("Ошибка сервера"); }
      finally { setIsLoading(false); }
    } else if (stage === 'reset-password') {
      if (regData.password.length < 6) { setErrorMsg("Пароль минимум 6 символов"); return; }
      if (regData.password !== regData.confirmPassword) { setErrorMsg("Пароли не совпадают"); return; }
      setIsLoading(true);
      try {
        const res = await fetch(apiUrl("/auth/password/reset"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ phone: normalizedPhone, code: otp.join(""), newPassword: regData.password }),
        });
        if (res.ok) { setStage('login'); }
        else { const data = await res.json(); setErrorMsg(data.message || "Ошибка сброса"); }
      } catch { setErrorMsg("Ошибка сервера"); }
      finally { setIsLoading(false); }
    } else if (stage === 'register') {
      if (!normalizedPhone) { setErrorMsg("Введите корректный номер телефона"); return; }
      if (regData.password.length < 6) { setErrorMsg("Пароль минимум 6 символов"); return; }
      if (regData.password !== regData.confirmPassword) { setErrorMsg("Пароли не совпадают"); return; }
      setIsLoading(true);
      try {
        const res = await fetch(apiUrl("/auth/register"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            phone: normalizedPhone,
            email: regData.email,
            password: regData.password,
            fullName: regData.fullName || "Пользователь",
            role: 'farmer',
            region: 'Алматинская',
            district: 'Талгар'
          }),
        });
        const data = await res.json();
        if (res.ok) { onSuccess(data.data || data); }
        else { setErrorMsg(data.message || "Ошибка регистрации"); }
      } catch { setErrorMsg("Ошибка сервера"); }
      finally { setIsLoading(false); }
    }
  };

  const handleResendOtp = async () => {
    if (timer > 0) return;
    setIsLoading(true);
    try {
      const normalizedPhone = validatePhone(phone);
      const res = await fetch(apiUrl("/auth/otp/send"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: normalizedPhone }),
      });
      if (res.ok) { setTimer(60); }
      else { setErrorMsg("Ошибка повторной отправки"); }
    } catch { setErrorMsg("Ошибка сервера"); }
    finally { setIsLoading(false); }
  };

  const renderStage = () => {
    switch (stage) {
      case 'login':
        return (
          <div className="w-full flex flex-col items-center">
            <h1 className="text-[30px] font-bold text-[#292929] mt-[54px] mb-[80px]">Login</h1>
            <div className="w-full space-y-6 px-10">
              <div className="space-y-2">
                <label className="text-[14px] font-semibold text-[#292929]/60 block uppercase tracking-wider ml-1">Мобильный номер</label>
                <div className="relative flex items-center bg-[#F9F9F9] border-2 border-transparent rounded-[20px] px-6 py-5 focus-within:border-[#151515] focus-within:bg-white transition-all shadow-sm">
                  <div className="flex items-center gap-2 pr-4 border-r border-[#D1D1D1]">
                    <span className="text-[18px] text-[#151515] font-bold">+7</span>
                  </div>
                  <input 
                    type="tel" 
                    placeholder="700 000 00 00"
                    className="flex-1 bg-transparent border-none outline-none pl-4 text-[18px] text-[#151515] placeholder:text-[#292929]/20 font-medium"
                    value={phone}
                    onChange={handlePhoneChange}
                  />
                  <CheckCircle2 className={`w-5 h-5 transition-colors ${phone.length >= 13 ? 'text-green-500' : 'text-[#292929]/10'}`} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[14px] font-semibold text-[#292929]/60 block uppercase tracking-wider ml-1">Ваш пароль</label>
                <div className="relative flex items-center bg-[#F9F9F9] border-2 border-transparent rounded-[20px] px-6 py-5 focus-within:border-[#151515] focus-within:bg-white transition-all shadow-sm">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    placeholder="Минимум 6 символов"
                    className="flex-1 bg-transparent border-none outline-none text-[18px] text-[#151515] placeholder:text-[#292929]/20 font-medium"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button onClick={() => setShowPassword(!showPassword)} className="text-[#292929]/30 hover:text-[#151515] transition-colors">
                    {showPassword ? <EyeOff size={22} /> : <Eye size={22} />}
                  </button>
                </div>
                <div className="flex justify-end">
                  <button onClick={() => setStage('forgot')} className="text-[14px] text-[#151515]/60 hover:text-[#151515] font-medium transition-colors">
                    Забыли пароль?
                  </button>
                </div>
              </div>
              {errorMsg && (
                <motion.p 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-red-500 text-[14px] text-center font-medium bg-red-50 py-2 rounded-lg"
                >
                  {errorMsg}
                </motion.p>
              )}
              <button 
                onClick={handleAction}
                disabled={isLoading}
                className="w-full bg-[#151515] text-white py-5 rounded-[20px] text-[18px] font-bold hover:bg-black active:scale-[0.98] transition-all shadow-lg shadow-black/10 flex justify-center items-center gap-2 mt-4"
              >
                {isLoading ? (
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : "Войти"}
              </button>
              <div className="text-center pt-4">
                <p className="text-[16px] text-[#696969]">
                  Нет аккаунта?{' '}
                  <button onClick={() => setStage('register')} className="text-[#151515] font-bold hover:underline transition-all">
                    Создать
                  </button>
                </p>
              </div>
            </div>
          </div>
        );
      case 'register':
        return (
          <div className="w-full flex flex-col items-center">
            <h1 className="text-[30px] font-bold text-[#292929] mt-[54px] mb-[40px]">Регистрация</h1>
            <div className="w-full space-y-5 px-10 max-h-[70vh] overflow-y-auto no-scrollbar pb-10">
              <div className="space-y-1.5">
                <label className="text-[13px] font-bold text-[#292929]/50 uppercase ml-1">Имя и Фамилия</label>
                <div className="relative flex items-center bg-[#F9F9F9] border-2 border-transparent rounded-[18px] px-6 py-4 focus-within:border-[#151515] focus-within:bg-white transition-all shadow-sm">
                  <input 
                    type="text" 
                    placeholder="Имя Фамилия"
                    className="flex-1 bg-transparent border-none outline-none text-[16px] text-[#151515] font-medium"
                    value={regData.fullName}
                    onChange={(e) => setRegData({...regData, fullName: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-bold text-[#292929]/50 uppercase ml-1">Мобильный номер</label>
                <div className="relative flex items-center bg-[#F9F9F9] border-2 border-transparent rounded-[18px] px-6 py-4 focus-within:border-[#151515] focus-within:bg-white transition-all shadow-sm">
                  <div className="flex items-center gap-2 pr-3 border-r border-[#D1D1D1]">
                    <span className="text-[16px] text-[#151515] font-bold">+7</span>
                  </div>
                  <input 
                    type="tel" 
                    placeholder="700 000 00 00"
                    className="flex-1 bg-transparent border-none outline-none pl-3 text-[16px] text-[#151515] font-medium"
                    value={phone}
                    onChange={handlePhoneChange}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-bold text-[#292929]/50 uppercase ml-1">Email (необязательно)</label>
                <div className="relative flex items-center bg-[#F9F9F9] border-2 border-transparent rounded-[18px] px-6 py-4 focus-within:border-[#151515] focus-within:bg-white transition-all shadow-sm">
                  <input 
                    type="email" 
                    placeholder="Электронная почта"
                    className="flex-1 bg-transparent border-none outline-none text-[16px] text-[#151515] font-medium"
                    value={regData.email}
                    onChange={(e) => setRegData({...regData, email: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-bold text-[#292929]/50 uppercase ml-1">Пароль</label>
                <div className="relative flex items-center bg-[#F9F9F9] border-2 border-transparent rounded-[18px] px-6 py-4 focus-within:border-[#151515] focus-within:bg-white transition-all shadow-sm">
                  <input 
                    type={showRegPassword ? "text" : "password"} 
                    placeholder="Придумайте пароль"
                    className="flex-1 bg-transparent border-none outline-none text-[16px] text-[#151515] font-medium"
                    value={regData.password}
                    onChange={(e) => setRegData({...regData, password: e.target.value})}
                  />
                  <button type="button" onClick={() => setShowRegPassword(!showRegPassword)} className="text-[#292929]/30 hover:text-[#151515]">
                    {showRegPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-bold text-[#292929]/50 uppercase ml-1">Повтор пароля</label>
                <div className="relative flex items-center bg-[#F9F9F9] border-2 border-transparent rounded-[18px] px-6 py-4 focus-within:border-[#151515] focus-within:bg-white transition-all shadow-sm">
                  <input 
                    type={showConfirmPassword ? "text" : "password"} 
                    placeholder="Повторите пароль"
                    className="flex-1 bg-transparent border-none outline-none text-[16px] text-[#151515] font-medium"
                    value={regData.confirmPassword}
                    onChange={(e) => setRegData({...regData, confirmPassword: e.target.value})}
                  />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="text-[#292929]/30 hover:text-[#151515]">
                    {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
              {errorMsg && <p className="text-red-500 text-[14px] text-center font-medium">{errorMsg}</p>}
              <button 
                onClick={handleAction}
                disabled={isLoading}
                className="w-full bg-[#151515] text-white py-5 rounded-[20px] text-[18px] font-bold hover:bg-black active:scale-[0.98] transition-all shadow-lg mt-4"
              >
                {isLoading ? "Загрузка..." : "Создать аккаунт"}
              </button>
              <div className="text-center pt-4">
                <button onClick={() => setStage('login')} className="text-[16px] text-[#696969] hover:text-[#151515] transition-all">
                  Уже есть аккаунт? <span className="text-[#151515] font-bold">Войти</span>
                </button>
              </div>
            </div>
          </div>
        );
      case 'forgot':
        return (
          <div className="w-full flex flex-col items-center">
            <div className="w-full flex items-center px-6 mt-10">
              <button onClick={() => setStage('login')} className="p-2 hover:bg-neutral-100 rounded-full transition-all">
                <ChevronLeft className="w-6 h-6 text-[#292929]" />
              </button>
              <h1 className="flex-1 text-center text-[22px] font-bold text-[#292929] mr-10">Сброс пароля</h1>
            </div>
            <div className="mt-12 flex flex-col items-center px-10 text-center">
              <div className="w-32 h-32 bg-[#F9F9F9] rounded-full flex items-center justify-center mb-8">
                <Smartphone className="w-16 h-16 text-[#292929]/10" />
              </div>
              <h2 className="text-[24px] font-bold text-[#292929] mb-3">Забыли пароль?</h2>
              <p className="text-[15px] text-[#696969] mb-10 leading-relaxed">
                Ничего страшного! Введите номер телефона, и мы отправим вам код для восстановления.
              </p>
              <div className="w-full space-y-2 text-left mb-8">
                <label className="text-[13px] font-bold text-[#292929]/50 uppercase ml-1">Мобильный номер</label>
                <div className="relative flex items-center bg-[#F9F9F9] border-2 border-transparent rounded-[18px] px-6 py-4 focus-within:border-[#151515] focus-within:bg-white transition-all shadow-sm">
                  <div className="flex items-center gap-2 pr-3 border-r border-[#D1D1D1]">
                    <span className="text-[16px] text-[#151515] font-bold">+7</span>
                  </div>
                  <input 
                    type="tel" 
                    placeholder="700 000 00 00"
                    className="flex-1 bg-transparent border-none outline-none pl-3 text-[16px] text-[#151515] font-medium"
                    value={phone}
                    onChange={handlePhoneChange}
                  />
                </div>
              </div>
              {errorMsg && <p className="text-red-500 text-[14px] mb-4 font-medium">{errorMsg}</p>}
              <button 
                onClick={handleAction}
                disabled={isLoading}
                className="w-full bg-[#151515] text-white py-5 rounded-[20px] text-[18px] font-bold hover:bg-black active:scale-[0.98] transition-all shadow-lg"
              >
                {isLoading ? "Отправка..." : "Получить код"}
              </button>
            </div>
          </div>
        );
      case 'verify':
        return (
          <div className="w-full flex flex-col items-center">
            <div className="w-full flex items-center px-6 mt-10">
              <button onClick={() => setStage('forgot')} className="p-2 hover:bg-neutral-100 rounded-full transition-all">
                <ChevronLeft className="w-6 h-6 text-[#292929]" />
              </button>
              <h1 className="flex-1 text-center text-[22px] font-bold text-[#292929] mr-10">Проверка</h1>
            </div>
            <div className="mt-12 flex flex-col items-center px-10 text-center">
              <div className="w-32 h-32 bg-[#F9F9F9] rounded-full flex items-center justify-center mb-8">
                <Lock className="w-16 h-16 text-[#292929]/10" />
              </div>
              <h2 className="text-[24px] font-bold text-[#292929] mb-3">Код подтверждения</h2>
              <p className="text-[15px] text-[#696969] mb-10 leading-relaxed">
                Мы отправили 4-значный код на номер<br/>
                <span className="font-bold text-[#151515]">+7 {phone}</span>
              </p>
              <div className="flex gap-4 mb-10">
                {[0, 1, 2, 3].map((i) => (
                  <input
                    key={i}
                    ref={otpRefs[i]}
                    id={`otp-${i}`}
                    type="text"
                    maxLength={1}
                    className="w-14 h-16 text-center text-[26px] font-bold bg-[#F9F9F9] border-2 border-transparent rounded-[16px] outline-none focus:border-[#151515] focus:bg-white transition-all shadow-sm"
                    value={otp[i]}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  />
                ))}
              </div>
              {errorMsg && <p className="text-red-500 text-[14px] mb-4 font-medium">{errorMsg}</p>}
              <button 
                onClick={handleAction}
                disabled={isLoading}
                className="w-full bg-[#151515] text-white py-5 rounded-[20px] text-[18px] font-bold hover:bg-black active:scale-[0.98] transition-all shadow-lg mb-6"
              >
                {isLoading ? "Проверка..." : "Подтвердить"}
              </button>
              <div className="text-[14px] text-[#696969]">
                {timer > 0 ? (
                  <span>Отправить снова через <span className="text-[#151515] font-bold">00:{timer.toString().padStart(2, '0')}</span></span>
                ) : (
                  <button onClick={handleResendOtp} className="text-[#151515] font-bold hover:underline">
                    Отправить код снова
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      case 'reset-password':
        return (
          <div className="w-full flex flex-col items-center">
            <h1 className="text-[26px] font-bold text-[#292929] mt-[54px] mb-[50px]">Новый пароль</h1>
            <div className="w-full space-y-6 px-10">
              <div className="space-y-2">
                <label className="text-[13px] font-bold text-[#292929]/50 uppercase ml-1">Новый пароль</label>
                <div className="relative flex items-center bg-[#F9F9F9] border-2 border-transparent rounded-[18px] px-6 py-4 focus-within:border-[#151515] focus-within:bg-white transition-all shadow-sm">
                  <input 
                    type={showRegPassword ? "text" : "password"} 
                    placeholder="Придумайте пароль"
                    className="flex-1 bg-transparent border-none outline-none text-[16px] text-[#151515] font-medium"
                    value={regData.password}
                    onChange={(e) => setRegData({...regData, password: e.target.value})}
                  />
                  <button type="button" onClick={() => setShowRegPassword(!showRegPassword)} className="text-[#292929]/30 hover:text-[#151515]">
                    {showRegPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[13px] font-bold text-[#292929]/50 uppercase ml-1">Повторите пароль</label>
                <div className="relative flex items-center bg-[#F9F9F9] border-2 border-transparent rounded-[18px] px-6 py-4 focus-within:border-[#151515] focus-within:bg-white transition-all shadow-sm">
                  <input 
                    type={showConfirmPassword ? "text" : "password"} 
                    placeholder="Повторите еще раз"
                    className="flex-1 bg-transparent border-none outline-none text-[16px] text-[#151515] font-medium"
                    value={regData.confirmPassword}
                    onChange={(e) => setRegData({...regData, confirmPassword: e.target.value})}
                  />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="text-[#292929]/30 hover:text-[#151515]">
                    {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
              {errorMsg && <p className="text-red-500 text-[14px] text-center font-medium">{errorMsg}</p>}
              <button 
                onClick={handleAction}
                disabled={isLoading}
                className="w-full bg-[#151515] text-white py-5 rounded-[20px] text-[18px] font-bold hover:bg-black active:scale-[0.98] transition-all shadow-lg mt-4"
              >
                {isLoading ? "Обновление..." : "Сохранить и войти"}
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center font-sans">
      <style dangerouslySetInnerHTML={{ __html: `
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 1000px #F9F9F9 inset !important;
          -webkit-text-fill-color: #151515 !important;
          transition: background-color 5000s ease-in-out 0s;
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
      <div className="w-full max-w-[420px] bg-white h-screen overflow-hidden relative flex flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={stage}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="flex-1 flex flex-col"
          >
            {renderStage()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
