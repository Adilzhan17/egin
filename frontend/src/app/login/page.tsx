'use client';

import AuthView from '@/components/ui/auth-view';
import { useRouter } from 'next/navigation';
import { PlatformLanguage } from '@/lib/i18n';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const [language, setLanguage] = useState<PlatformLanguage>('ru');

  const { isLoggedIn } = useAuth();

  useEffect(() => {
    const savedLang = localStorage.getItem('platform_language') as PlatformLanguage;
    if (savedLang) setLanguage(savedLang);
  }, []);

  useEffect(() => {
    if (isLoggedIn === true) {
      router.push('/');
    }
  }, [isLoggedIn, router]);

  if (isLoggedIn === true) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#F5F5F5]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#2F6B3D]"></div>
      </div>
    );
  }

  const handleAuthSuccess = (data: any) => {
    // We also set localStorage for legacy/compatibility if needed, 
    // but the cookie is the primary security mechanism now.
    if (data.access_token) {
      localStorage.setItem('agro_token', data.access_token);
      localStorage.setItem('user_data', JSON.stringify(data.user));
    }
    // Redirect to home with full reload to ensure AuthContext updates
    window.location.href = '/';
  };

  return (
    <main className="min-h-screen bg-[#F5F5F5]">
      <AuthView onSuccess={handleAuthSuccess} language={language} />
    </main>
  );
}
