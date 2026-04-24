'use client';

import AuthView from '@/components/ui/auth-view';
import { useRouter } from 'next/navigation';
import { PlatformLanguage } from '@/lib/i18n';
import { useState, useEffect } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [language, setLanguage] = useState<PlatformLanguage>('ru');

  useEffect(() => {
    const savedLang = localStorage.getItem('platform_language') as PlatformLanguage;
    if (savedLang) setLanguage(savedLang);
  }, []);

  const handleAuthSuccess = (data: any) => {
    // We also set localStorage for legacy/compatibility if needed, 
    // but the cookie is the primary security mechanism now.
    if (data.access_token) {
      localStorage.setItem('agro_token', data.access_token);
      localStorage.setItem('user_data', JSON.stringify(data.user));
    }
    // Redirect to home
    router.push('/');
    router.refresh();
  };

  return (
    <main className="min-h-screen bg-[#F5F5F5]">
      <AuthView onSuccess={handleAuthSuccess} language={language} />
    </main>
  );
}
