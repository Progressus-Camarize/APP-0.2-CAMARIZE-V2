// Push no navegador: chave pública VAPID, conversão e sincronização da inscrição com a API.
// Compartilhado pelo hook useNotifications e pela revalidação feita ao abrir o site (_app).

const apiUrl = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Sem fallback: inscrever com uma chave que não é a do servidor faz todo envio ser recusado
export const chavePublicaVapid = () => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;

export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// A inscrição do aparelho foi feita com a chave atual do servidor?
// Se o navegador não informa a chave usada, não arrisca reinscrever.
export function usaChaveAtual(subscription, chave = chavePublicaVapid()) {
  const usada = subscription?.options?.applicationServerKey;
  if (!usada || !chave) return true;
  const a = new Uint8Array(usada);
  const b = urlBase64ToUint8Array(chave);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function autenticacao() {
  const token = sessionStorage.getItem('token') || localStorage.getItem('token');
  try {
    const u = JSON.parse(sessionStorage.getItem('usuarioCamarize') || localStorage.getItem('usuarioCamarize'));
    return { token, userId: u?._id || u?.id || null };
  } catch {
    return { token, userId: null };
  }
}

async function chamarApi(caminho, corpo) {
  const { token, userId } = autenticacao();
  const response = await fetch(`${apiUrl()}${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...corpo, userId }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Erro ao chamar ${caminho}`);
  }
}

export const enviarInscricao = (subscription) => chamarApi('/notifications/push/subscribe', {
  subscription,
  deviceInfo: { userAgent: navigator.userAgent, platform: navigator.platform },
});

export const removerInscricao = (subscription) => chamarApi('/notifications/push/unsubscribe', { subscription });

let revalidado = false;

// Ao abrir o site: se o aparelho tem uma inscrição feita com uma chave antiga (ex.: antes de as
// chaves do servidor serem trocadas), troca por uma inscrição com a chave atual. Só age para quem
// já permitiu notificações e está logado; nunca pede permissão sozinho.
export async function revalidarInscricaoPush() {
  if (revalidado || typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  const chave = chavePublicaVapid();
  if (!chave || !autenticacao().token) return; // tenta de novo depois do login
  revalidado = true;

  const registration = await navigator.serviceWorker.getRegistration();
  const antiga = await registration?.pushManager.getSubscription();
  if (!antiga || usaChaveAtual(antiga, chave)) return;

  await antiga.unsubscribe();
  await removerInscricao(antiga).catch(() => {}); // a API também a desativa no próximo envio
  const nova = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(chave) });
  await enviarInscricao(nova);
  console.log('[Camarize Push] Inscrição renovada com a chave atual do servidor');
}
