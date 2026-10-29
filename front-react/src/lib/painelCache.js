// Últimos dados carregados de cada painel (/admin, /master), em memória.
// Ao voltar de uma página de cativeiro o painel aparece na hora com esses dados e
// atualiza em segundo plano, em vez de mostrar "Carregando..." de novo.
// Vive só durante a navegação dentro do app: recarregar a página ou sair da conta
// (que recarrega a página) limpa tudo.
const caches = {};

function idDoUsuarioSalvo() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem('usuarioCamarize') || localStorage.getItem('usuarioCamarize');
    return raw ? JSON.parse(raw)?._id || null : null;
  } catch {
    return null;
  }
}

// Só devolve o cache se ele for do mesmo usuário logado agora
export function lerCachePainel(painel) {
  const userId = idDoUsuarioSalvo();
  const cache = caches[painel];
  return userId && cache?.userId === userId ? cache.dados : null;
}

export function salvarCachePainel(painel, dados) {
  const userId = idDoUsuarioSalvo();
  if (userId) caches[painel] = { userId, dados };
}
