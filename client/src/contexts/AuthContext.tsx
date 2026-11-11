import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

import { getAccessToken, setAccessToken } from '../lib/accessToken';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

interface User {
  id: string;
  email: string;
  plan: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    isLoading: true,
    isAuthenticated: false,
  });

  useEffect(() => {
    const signedOut = { user: null, accessToken: null, isLoading: false, isAuthenticated: false };
    const initAuth = async () => {
      try {
        if (!getAccessToken()) await refreshToken();
        const token = getAccessToken();
        if (!token) {
          setState(signedOut);
          return;
        }
        const response = await fetch(`${API_BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) {
          setAccessToken(null);
          setState(signedOut);
          return;
        }
        const user = await response.json();
        setState({ user, accessToken: token, isLoading: false, isAuthenticated: true });
      } catch {
        setAccessToken(null);
        setState(signedOut);
      }
    };

    initAuth();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();
    setAccessToken(data.accessToken);
    setState({
      user: data.user,
      accessToken: data.accessToken,
      isLoading: false,
      isAuthenticated: true,
    });
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const response = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Registration failed');
    }

    const data = await response.json();
    setAccessToken(data.accessToken);
    setState({
      user: data.user,
      accessToken: data.accessToken,
      isLoading: false,
      isAuthenticated: true,
    });
  }, []);

  const logout = useCallback(async () => {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
    });
    setAccessToken(null);
    setState({
      user: null,
      accessToken: null,
      isLoading: false,
      isAuthenticated: false,
    });
  }, []);

  const logoutAll = useCallback(async () => {
    const token = getAccessToken();
    await fetch(`${API_BASE}/api/auth/logout-all`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    setAccessToken(null);
    setState({
      user: null,
      accessToken: null,
      isLoading: false,
      isAuthenticated: false,
    });
  }, []);

  const refreshToken = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      setAccessToken(data.accessToken);
      setState(prev => ({ ...prev, accessToken: data.accessToken }));
      return true;
    } catch {
      return false;
    }
  }, []);

  const value: AuthContextType = {
    ...state,
    login,
    register,
    logout,
    logoutAll,
    refreshToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
