// frontend/src/hooks/useAuth.tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../services/api';
import type { User } from '../types/api';

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('accessToken');
      const storedUser = localStorage.getItem('user');
      
      if (storedToken && storedUser) {
        try {
          setAccessToken(storedToken);
          setUser(JSON.parse(storedUser));
          api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
          
          // Verify token still valid
          const { data } = await api.get('/auth/me');
          setUser(data);
        } catch {
          // Token invalid, clear storage
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
        }
      }
      setIsLoading(false);
    };
    
    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    
    setAccessToken(data.accessToken);
    setUser(data.user);
    api.defaults.headers.common['Authorization'] = `Bearer ${data.accessToken}`;
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setAccessToken(null);
    setUser(null);
    delete api.defaults.headers.common['Authorization'];
  };

  return (
    <AuthContext.Provider value={{ user, accessToken, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}