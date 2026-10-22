import { useEffect, useState } from 'react';

// <img> não envia o header Authorization, então a foto do cativeiro leva o token na URL.
// O token só é lido depois de montar, para o HTML do servidor e do cliente baterem.
export function useAuthToken() {
  const [token, setToken] = useState(null);
  useEffect(() => {
    try {
      setToken(sessionStorage.getItem('token') || localStorage.getItem('token'));
    } catch {
      setToken(null);
    }
  }, []);
  return token;
}

export function fotoCativeiroUrl(apiUrl, cativeiroId, token) {
  if (!cativeiroId || !token) return undefined;
  return `${apiUrl}/cativeiros/${cativeiroId}/foto?token=${encodeURIComponent(token)}`;
}
