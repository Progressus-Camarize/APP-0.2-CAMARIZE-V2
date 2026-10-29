import { useCallback } from 'react';
import axios from 'axios';
import { criarContadorCompartilhado } from './contadorCompartilhado';

const apiUrl = () => process.env.NEXT_PUBLIC_API_URL || '/api';

const getToken = () => (typeof window === 'undefined'
  ? null
  : sessionStorage.getItem('token') || localStorage.getItem('token'));

// Contador de avisos não vistos independente de push — funciona mesmo que o
// usuário nunca tenha ativado notificações, o navegador tenha bloqueado push,
// ou a entrega tenha falhado. Faz polling simples; não depende de Service Worker.
// O valor é compartilhado entre telas (barra lateral, painéis, NavBottom).
const useContadorAvisos = criarContadorCompartilhado(async () => {
  const token = getToken();
  if (!token) return null;
  const response = await axios.get(`${apiUrl()}/notifications/nao-vistos`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data?.success ? response.data.naoVistos : null;
});

export function useUnreadAvisos() {
  const { count, refresh, definir } = useContadorAvisos();

  const markSeen = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      await axios.post(`${apiUrl()}/notifications/marcar-visto`, null, {
        headers: { Authorization: `Bearer ${token}` },
      });
      definir(0);
    } catch {
      // Se falhar, só não zera localmente — o próximo refresh corrige.
    }
  }, [definir]);

  return { count, refresh, markSeen };
}
