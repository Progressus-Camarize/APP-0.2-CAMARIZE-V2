import { useState, useEffect } from 'react';
import axios from 'axios';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);

  // Função para limpar dados de autenticação
  const clearAuthData = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuarioCamarize');
    setIsAuthenticated(false);
    setUser(null);
    setError(null);
  };

  // Removida limpeza automática do token para não interferir no fluxo normal

  const checkAuth = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = (typeof window !== 'undefined' ? (sessionStorage.getItem('token') || localStorage.getItem('token')) : null);
      if (!token) {
        setIsAuthenticated(false);
        setError('You need to be signed in to access this page');
        return;
      }

      // Verificar se o token é válido fazendo uma requisição
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const response = await axios.get(`${apiUrl}/users/me`, {
        headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' }
      });
      
      setIsAuthenticated(true);
      setUser(response.data);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('usuarioCamarize', JSON.stringify(response.data));
      }
    } catch (err) {
      console.error('Erro de autenticação:', err);
      
      if (err.response?.status === 401) {
        setError('Session expired. Please sign in again to continue.');
        // Não limpar imediatamente o storage para evitar loop de redirecionamento
      } else {
        setError('Error verifying authentication. Please try again.');
      }
      
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const logout = () => {
    clearAuthData();
  };

  return {
    isAuthenticated,
    loading,
    error,
    user,
    checkAuth,
    logout,
    clearAuthData
  };
} 