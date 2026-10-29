import { useCallback, useEffect, useState } from 'react';

const POLL_INTERVAL_MS = 60_000;

const idDoUsuario = () => {
  try {
    const raw = sessionStorage.getItem('usuarioCamarize') || localStorage.getItem('usuarioCamarize');
    return raw ? JSON.parse(raw)?._id || null : null;
  } catch {
    return null;
  }
};

// Contador da barra lateral compartilhado entre todas as telas: o valor sobrevive à troca
// de página (não volta a 0 e "pisca") e uma única consulta periódica atende todo mundo.
// `buscar` devolve o número atual (ou null se não deu para saber).
export function criarContadorCompartilhado(buscar) {
  let valor = 0;
  let dono = null; // usuário a quem o valor pertence
  let timer = null;
  let versao = 0; // muda a cada valor definido na tela (ex.: marcar como visto)
  const ouvintes = new Set();

  const publicar = (novo) => {
    versao += 1;
    dono = idDoUsuario();
    valor = novo;
    ouvintes.forEach(ouvir => ouvir(novo));
  };

  const atualizar = async () => {
    const versaoNoInicio = versao;
    try {
      const novo = await buscar();
      // Se o valor mudou na tela enquanto a consulta estava no ar, a resposta já está velha
      if (typeof novo === 'number' && versao === versaoNoInicio) publicar(novo);
    } catch {
      // Falha silenciosa: é só um contador auxiliar, não deve quebrar a navegação.
    }
  };

  const valorAtual = () => (dono && dono === idDoUsuario() ? valor : 0);

  return function useContador({ ativo = true } = {}) {
    const [count, setCount] = useState(0);

    useEffect(() => {
      if (!ativo) return undefined;
      setCount(valorAtual());
      ouvintes.add(setCount);
      if (!timer) {
        atualizar();
        timer = setInterval(atualizar, POLL_INTERVAL_MS);
      }
      return () => {
        ouvintes.delete(setCount);
        if (ouvintes.size === 0) {
          clearInterval(timer);
          timer = null;
        }
      };
    }, [ativo]);

    const definir = useCallback((novo) => publicar(novo), []);
    return { count: ativo ? count : 0, refresh: atualizar, definir };
  };
}
