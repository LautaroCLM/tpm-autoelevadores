'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { getCurrentSessionAndProfile, signOutUser } from '../lib/api/auth';
import { createClient } from '../lib/supabase/client';
import { Perfil } from '../lib/types/tpm';

export interface AuthContextType {
  user: any | null;
  perfil: Perfil | null;
  loading: boolean;
  isSupervisorOrMaint: boolean;
  refreshAuth: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  perfil: null,
  loading: true,
  isSupervisorOrMaint: false,
  refreshAuth: async () => {},
  signOut: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const isFetchingRef = useRef<boolean>(false);

  const loadAuth = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const { user: currentUser, perfil: currentPerfil } = await getCurrentSessionAndProfile();
      setUser(currentUser);
      setPerfil(currentPerfil);
    } catch (err) {
      console.error('Error cargando autenticación centralizada:', err);
      setUser(null);
      setPerfil(null);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    loadAuth();

    // 1. Escuchar cambios de autenticación nativos de Supabase
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
        loadAuth();
      }
    });

    // 2. Escuchar evento personalizado tpm_auth_changed (usado para login rápido u offline)
    const handleCustomAuthChange = () => {
      loadAuth();
    };
    window.addEventListener('tpm_auth_changed', handleCustomAuthChange);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('tpm_auth_changed', handleCustomAuthChange);
    };
  }, [loadAuth]);

  const signOut = useCallback(async () => {
    await signOutUser();
    setUser(null);
    setPerfil(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tpm_auth_changed'));
    }
  }, []);

  const isSupervisorOrMaint = perfil?.rol === 'supervisor' || perfil?.rol === 'mantenimiento';

  return (
    <AuthContext.Provider
      value={{
        user,
        perfil,
        loading,
        isSupervisorOrMaint,
        refreshAuth: loadAuth,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
