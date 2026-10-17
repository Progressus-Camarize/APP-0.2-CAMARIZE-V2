import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

const POLL_INTERVAL_MS = 60_000;

const getToken = () => (typeof window === 'undefined'
  ? null
  : sessionStorage.getItem('token') || localStorage.getItem('token'));

// Contador de avisos não vistos independente de push — funciona mesmo que o
// usuário nunca tenha ativado notificações, o navegador tenha bloqueado push,
// ou a entrega tenha falhado. Faz polling simples; não depende de Service Worker.
export function useUnreadAvisos() {
  const [count, setCount] = useState(0);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const response = await axios.get(`${apiUrl}/notifications/nao-vistos`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data?.success) setCount(response.data.naoVistos);
    } catch {
      // Falha silenciosa: é só um contador auxiliar, não deve quebrar a navegação.
    }
  }, [apiUrl]);

  const markSeen = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      await axios.post(`${apiUrl}/notifications/marcar-visto`, null, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCount(0);
    } catch {
      // Se falhar, só não zera localmente — o próximo refresh corrige.
    }
  }, [apiUrl]);

  useEffect(() => {
    refresh();
    timerRef.current = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(timerRef.current);
  }, [refresh]);

  return { count, refresh, markSeen };
}
