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
    
    // Handle leading 8 or 7
    if (clean.startsWith("8") && clean.length > 0) {
      clean = clean.substring(1);
    } else if (clean.startsWith("7") && clean.length > 0) {
      clean = clean.substring(1);
    }

    // Limit to 10 digits
    clean = clean.substring(0, 10);

    // Format: XXX XXX XX XX
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
    setPhone(formatPhoneNumber(e.target.value));
  };

  const normalizePhone = (raw: string): string => {
    let clean = raw.replace(/\D/g, "");
    // If it's already 11 digits and starts with 7 or 8, it's a full number
    if (clean.length === 11 && (clean.startsWith("7") || clean.startsWith("8"))) {
      return "+7" + clean.substring(1);
    }
    // If it's 10 digits (the formatted result), add +7
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
        else { setErrorMsg(data.message || "Ошибка входа"); }
      } catch { setErrorMsg("Ошибка сервера"); }
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
            region: 'Алматинская', // Default for now to match mockup simplicity
            district: 'Талгар'    // Default for now
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
            <h1 className="text-[30px] font-bold text-[#292929] mt-[54px] mb-[100px]">Login</h1>
            
            <div className="w-full space-y-6 px-10">
              <div className="space-y-2">
                <label className="text-[16px] text-[#292929] block">Enter your mobile number</label>
                <div className="relative flex items-center bg-[#FCFCFC] border border-[#D1D1D1] rounded-[17px] px-6 py-5 group focus-within:border-[#151515] transition-all">
                  <div className="flex items-center gap-2 pr-4 border-r border-[#D1D1D1]">
                    <span className="text-[16px] text-[#292929] font-bold">+7</span>
                  </div>
                  <input 
                    type="tel" 
                    placeholder="702 123 45 67"
                    className="flex-1 bg-transparent border-none outline-none pl-4 text-[16px] text-[#292929] placeholder:text-[#696969]/30"
                    value={phone}
                    onChange={handlePhoneChange}
                  />
                  <CheckCircle2 className={`w-5 h-5 transition-colors ${phone.length >= 13 ? 'text-green-500' : 'text-[#292929]/20'}`} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[16px] text-[#292929] block">Enter your password</label>
                <div className="relative flex items-center bg-[#FCFCFC] border border-[#D1D1D1] rounded-[17px] px-6 py-5 group focus-within:border-[#151515] transition-all">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    placeholder="**************"
                    className="flex-1 bg-transparent border-none outline-none text-[16px] text-[#292929] placeholder:text-[#696969]"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button onClick={() => setShowPassword(!showPassword)} className="text-[#292929]/40 hover:text-[#292929]">
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                <div className="flex justify-end">
                  <button onClick={() => setStage('forgot')} className="text-[16px] text-[#292929] hover:underline">
                    forgot password?
                  </button>
                </div>
              </div>

              {errorMsg && <p className="text-red-500 text-xs text-center">{errorMsg}</p>}

              <button 
                onClick={handleAction}
                disabled={isLoading}
                className="w-full bg-[#151515] text-white py-5 rounded-[17px] text-[18px] font-bold hover:bg-black transition-colors flex justify-center items-center gap-2 mt-4"
              >
                {isLoading ? "Loading..." : "Login"}
              </button>

              <div className="text-center pt-4">
                <p className="text-[16px] text-[#696969]">
                  Don’t have an account?{' '}
                  <button onClick={() => setStage('register')} className="text-[#292929] font-bold hover:underline">
                    Sign Up
                  </button>
                </p>
              </div>
            </div>
          </div>
        );

      case 'forgot':
        return (
          <div className="w-full flex flex-col items-center">
            <div className="w-full flex items-center px-6 mt-10">
              <button onClick={() => setStage('login')} className="p-2 hover:bg-neutral-100 rounded-full">
                <ChevronLeft className="w-6 h-6 text-[#292929]" />
              </button>
              <h1 className="flex-1 text-center text-[24px] font-bold text-[#292929] mr-10">Forgot</h1>
            </div>

            <div className="mt-12 flex flex-col items-center px-10 text-center">
              <div className="w-48 h-48 bg-[#FCFCFC] rounded-full flex items-center justify-center mb-8 overflow-hidden">
                <Smartphone className="w-24 h-24 text-[#292929]/10" />
              </div>
              <h2 className="text-[24px] font-bold text-[#292929] mb-2">Forgot Password?</h2>
              <p className="text-[14px] text-[#696969] mb-12">
                Don't worry! it happens. Please enter phone number associated with your account
              </p>

              <div className="w-full space-y-2 text-left mb-8">
                <label className="text-[16px] text-[#292929]">Enter your mobile number</label>
                <div className="relative flex items-center bg-[#FCFCFC] border border-[#D1D1D1] rounded-[17px] px-6 py-5">
                  <div className="flex items-center gap-2 pr-4 border-r border-[#D1D1D1]">
                    <span className="text-[16px] text-[#292929] font-medium">+7</span>
                  </div>
                  <input 
                    type="tel" 
                    placeholder="702 123 45 67"
                    className="flex-1 bg-transparent border-none outline-none pl-4 text-[16px] text-[#292929]"
                    value={phone}
                    onChange={handlePhoneChange}
                  />
                </div>
              </div>
              
              {errorMsg && <p className="text-red-500 text-xs mb-4">{errorMsg}</p>}

              <button 
                onClick={handleAction}
                disabled={isLoading}
                className="w-full bg-[#151515] text-white py-5 rounded-[17px] text-[18px] font-bold hover:bg-black transition-all"
              >
                {isLoading ? "Loading..." : "Get OTP"}
              </button>
            </div>
          </div>
        );

      case 'verify':
        return (
          <div className="w-full flex flex-col items-center">
            <div className="w-full flex items-center px-6 mt-10">
              <button onClick={() => setStage('forgot')} className="p-2 hover:bg-neutral-100 rounded-full">
                <ChevronLeft className="w-6 h-6 text-[#292929]" />
              </button>
              <h1 className="flex-1 text-center text-[24px] font-bold text-[#292929] mr-10">Verify</h1>
            </div>

            <div className="mt-12 flex flex-col items-center px-10 text-center">
              <div className="w-48 h-48 bg-[#FCFCFC] rounded-full flex items-center justify-center mb-8">
                <Lock className="w-24 h-24 text-[#292929]/10" />
              </div>
              <h2 className="text-[24px] font-bold text-[#292929] mb-2">Enter OTP</h2>
              <p className="text-[14px] text-[#696969] mb-12">
                An 4 digit OTP has been sent to<br/>
                <span className="font-bold text-[#292929]">{phone || "+7 700 000 00 00"}</span>
              </p>

              <div className="flex gap-4 mb-12">
                {[0, 1, 2, 3].map((i) => (
                  <input
                    key={i}
                    ref={otpRefs[i]}
                    id={`otp-${i}`}
                    type="text"
                    maxLength={1}
                    className="w-16 h-16 text-center text-[24px] font-bold bg-[#FCFCFC] border border-[#D1D1D1] rounded-[17px] outline-none focus:border-[#151515] transition-all"
                    value={otp[i]}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  />
                ))}
              </div>

              {errorMsg && <p className="text-red-500 text-xs mb-4">{errorMsg}</p>}

              <button 
                onClick={handleAction}
                disabled={isLoading}
                className="w-full bg-[#151515] text-white py-5 rounded-[17px] text-[18px] font-bold hover:bg-black transition-all mb-6"
              >
                {isLoading ? "Verifying..." : "Verify"}
              </button>

              <div className="text-[14px] text-[#696969]">
                {timer > 0 ? (
                  <span>Resend OTP <span className="text-[#292929] font-bold">(00:{timer.toString().padStart(2, '0')})</span></span>
                ) : (
                  <button onClick={handleResendOtp} className="text-[#292929] font-bold hover:underline">
                    Resend OTP
                  </button>
                )}
              </div>
            </div>
          </div>
        );

      case 'register':
        return (
          <div className="w-full flex flex-col items-center">
            <h1 className="text-[30px] font-bold text-[#292929] mt-[54px] mb-[40px]">Register</h1>
            
            <div className="w-full space-y-4 px-10 max-h-[70vh] overflow-y-auto no-scrollbar pb-10">
              <div className="space-y-2">
                <label className="text-[16px] text-[#292929] block">Enter your Full Name</label>
                <div className="relative flex items-center bg-[#FCFCFC] border border-[#D1D1D1] rounded-[17px] px-6 py-5">
                  <input 
                    type="text" 
                    placeholder="Едиль Таласбеков"
                    className="flex-1 bg-transparent border-none outline-none text-[16px] text-[#292929]"
                    value={regData.fullName}
                    onChange={(e) => setRegData({...regData, fullName: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[16px] text-[#292929] block">Enter your mobile number</label>
                <div className="relative flex items-center bg-[#FCFCFC] border border-[#D1D1D1] rounded-[17px] px-6 py-5">
                  <div className="flex items-center gap-2 pr-4 border-r border-[#D1D1D1]">
                    <span className="text-[16px] text-[#292929] font-bold">+7</span>
                  </div>
                  <input 
                    type="tel" 
                    placeholder="702 123 45 67"
                    className="flex-1 bg-transparent border-none outline-none pl-4 text-[16px] text-[#292929] placeholder:text-[#696969]/30"
                    value={phone}
                    onChange={handlePhoneChange}
                  />
                  <CheckCircle2 className={`w-5 h-5 transition-colors ${phone.length >= 13 ? 'text-green-500' : 'text-[#292929]/20'}`} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[16px] text-[#292929] block">Enter your Email</label>
                <div className="relative flex items-center bg-[#FCFCFC] border border-[#D1D1D1] rounded-[17px] px-6 py-5">
                  <input 
                    type="email" 
                    placeholder="abc12@gmail.com"
                    className="flex-1 bg-transparent border-none outline-none text-[16px] text-[#292929]"
                    value={regData.email}
                    onChange={(e) => setRegData({...regData, email: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[16px] text-[#292929] block">Enter your password</label>
                <div className="relative flex items-center bg-[#FCFCFC] border border-[#D1D1D1] rounded-[17px] px-6 py-5">
                  <input 
                    type={showRegPassword ? "text" : "password"} 
                    placeholder="**************"
                    className="flex-1 bg-transparent border-none outline-none text-[16px] text-[#292929]"
                    value={regData.password}
                    onChange={(e) => setRegData({...regData, password: e.target.value})}
                  />
                  <button type="button" onClick={() => setShowRegPassword(!showRegPassword)} className="text-[#292929]/40 hover:text-[#292929]">
                    {showRegPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[16px] text-[#292929] block">Re-Enter your password</label>
                <div className="relative flex items-center bg-[#FCFCFC] border border-[#D1D1D1] rounded-[17px] px-6 py-5">
                  <input 
                    type={showConfirmPassword ? "text" : "password"} 
                    placeholder="**************"
                    className="flex-1 bg-transparent border-none outline-none text-[16px] text-[#292929]"
                    value={regData.confirmPassword}
                    onChange={(e) => setRegData({...regData, confirmPassword: e.target.value})}
                  />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="text-[#292929]/40 hover:text-[#292929]">
                    {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              {errorMsg && <p className="text-red-500 text-xs text-center">{errorMsg}</p>}

              <button 
                onClick={handleAction}
                disabled={isLoading}
                className="w-full bg-[#151515] text-white py-5 rounded-[17px] text-[18px] font-bold hover:bg-black transition-all mt-4"
              >
                {isLoading ? "Loading..." : "sign up"}
              </button>

              <div className="text-center pt-4 space-y-2">
                <p className="text-[16px] text-[#696969]">
                  Already have an account?{' '}
                  <button onClick={() => setStage('login')} className="text-[#292929] font-bold hover:underline">
                    Sign in
                  </button>
                </p>
                <p className="text-[16px] text-[#696969] font-bold">or</p>
              </div>
            </div>
          </div>
        );

      case 'reset-password':
        return (
          <div className="w-full flex flex-col items-center">
            <h1 className="text-[30px] font-bold text-[#292929] mt-[54px] mb-[60px]">Reset Password</h1>
            
            <div className="w-full space-y-6 px-10">
              <div className="space-y-2">
                <label className="text-[16px] text-[#292929] block">New Password</label>
                <div className="relative flex items-center bg-[#FCFCFC] border border-[#D1D1D1] rounded-[17px] px-6 py-5">
                  <input 
                    type={showRegPassword ? "text" : "password"} 
                    placeholder="**************"
                    className="flex-1 bg-transparent border-none outline-none text-[16px] text-[#292929]"
                    value={regData.password}
                    onChange={(e) => setRegData({...regData, password: e.target.value})}
                  />
                  <button type="button" onClick={() => setShowRegPassword(!showRegPassword)} className="text-[#292929]/40 hover:text-[#292929]">
                    {showRegPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[16px] text-[#292929] block">Confirm New Password</label>
                <div className="relative flex items-center bg-[#FCFCFC] border border-[#D1D1D1] rounded-[17px] px-6 py-5">
                  <input 
                    type={showConfirmPassword ? "text" : "password"} 
                    placeholder="**************"
                    className="flex-1 bg-transparent border-none outline-none text-[16px] text-[#292929]"
                    value={regData.confirmPassword}
                    onChange={(e) => setRegData({...regData, confirmPassword: e.target.value})}
                  />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="text-[#292929]/40 hover:text-[#292929]">
                    {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              {errorMsg && <p className="text-red-500 text-xs text-center">{errorMsg}</p>}

              <button 
                onClick={handleAction}
                disabled={isLoading}
                className="w-full bg-[#151515] text-white py-5 rounded-[17px] text-[18px] font-bold hover:bg-black transition-all mt-4"
              >
                {isLoading ? "Updating..." : "Update Password"}
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center p-4 font-sans">
      <style dangerouslySetInnerHTML={{ __html: `
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 1000px #FCFCFC inset !important;
          -webkit-text-fill-color: #292929 !important;
          transition: background-color 5000s ease-in-out 0s;
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
      
      <div className="w-full max-w-[420px] bg-white rounded-[30px] shadow-2xl min-h-[820px] overflow-hidden relative flex flex-col border border-neutral-100">
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

        <div className="w-full flex justify-center pb-4 mt-auto">
          <div className="w-[134px] h-[5px] bg-black rounded-full" />
        </div>
      </div>
    </div>
  );
}
