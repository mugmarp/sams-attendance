// frontend/src/services/api.ts
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');
        
        const { data } = await axios.post(`${api.defaults.baseURL}/auth/refresh`, {
          refreshToken,
        });
        
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        localStorage.setItem('user', JSON.stringify(data.user));
        
        api.defaults.headers.common['Authorization'] = `Bearer ${data.accessToken}`;
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        
        return api(originalRequest);
      } catch {
        // Refresh failed, logout
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        delete api.defaults.headers.common['Authorization'];
        window.location.href = '/login';
      }
    }
    
    return Promise.reject(error);
  }
);

export default api;