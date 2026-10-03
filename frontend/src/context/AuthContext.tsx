'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiUrl } from '@/lib/api';

interface AuthContextType {
  isLoggedIn: boolean | null;
  user: any;
  logout: () => Promise<void>;
  checkAuth: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  const checkAuth = () => {
    const token = localStorage.getItem('agro_token');
    const userData = localStorage.getItem('user_data');
    
    if (token) {
      setIsLoggedIn(true);
      if (userData) setUser(JSON.parse(userData));
    } else {
      setIsLoggedIn(false);
      setUser(null);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const logout = async () => {
    try {
      await fetch(apiUrl('/auth/logout'), {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    }

    // Clean up local storage
    localStorage.removeItem('agro_token');
    localStorage.removeItem('agro_user_id');
    localStorage.removeItem('agro_user_role');
    localStorage.removeItem('agro_user_name');
    localStorage.removeItem('agro_user_phone');
    localStorage.removeItem('agro_user_region');
    localStorage.removeItem('agro_user_district');
    localStorage.removeItem('agro_avatar');
    localStorage.removeItem('user_data');

    // Clean up cookies (client-side fallback)
    document.cookie = "agro_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie = "is_logged_in=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

    setIsLoggedIn(false);
    setUser(null);
    
    router.push('/login');
    router.refresh();
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, user, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
