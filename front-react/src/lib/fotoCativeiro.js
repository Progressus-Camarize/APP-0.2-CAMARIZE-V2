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

// `versao` (foto_versao do cativeiro) muda a cada foto nova: com ela na URL o navegador guarda
// a foto em cache e só baixa de novo quando ela for trocada. Sem ela, a API confere pela ETag.
export function fotoCativeiroUrl(apiUrl, cativeiroId, token, versao) {
  if (!cativeiroId || !token) return undefined;
  const v = versao ? new Date(versao).getTime() : null;
  return `${apiUrl}/cativeiros/${cativeiroId}/foto?${v ? `v=${v}&` : ''}token=${encodeURIComponent(token)}`;
}

const LADO_MAXIMO = 1280;
const QUALIDADE_JPEG = 0.82;

// Reduz a foto antes de enviar (lado maior até 1280 px, JPEG): de vários MB para centenas de KB.
// Se o navegador não conseguir (formato não suportado etc.), envia o arquivo original.
export async function comprimirFoto(arquivo) {
  if (!arquivo || typeof window === 'undefined' || !arquivo.type?.startsWith('image/') || arquivo.type === 'image/gif') {
    return arquivo;
  }
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // PNG com transparência vira fundo branco no JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', QUALIDADE_JPEG));
    if (!blob || blob.size >= arquivo.size) return arquivo;
    const nome = (arquivo.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], nome, { type: 'image/jpeg' });
  } catch {
    return arquivo;
  }
}
