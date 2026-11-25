// Números no padrão brasileiro (vírgula decimal), iguais em todas as telas.
// Temperatura e pH com 1 casa, amônia com 2 (as mesmas casas das mensagens dos avisos, na API).
export const CASAS_PARAMETRO = { temperatura: 1, ph: 1, amonia: 2 };

export function numeroBr(valor, casas, { casasFixas = true } = {}) {
  return Number(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: casasFixas ? casas : 0,
    maximumFractionDigits: casas,
  });
}

// Valor de um parâmetro com a unidade separada por espaço ("29,4 °C"); sem valor, "—".
// casasFixas: false tira zeros à toa, para valores configurados ("28 °C", não "28,0 °C").
export function formatarParametro(tipo, valor, { unidade = '', casasFixas = true } = {}) {
  if (valor === null || valor === undefined || valor === '' || !Number.isFinite(Number(valor))) return '—';
  const numero = numeroBr(valor, CASAS_PARAMETRO[tipo] ?? 1, { casasFixas });
  return unidade ? `${numero} ${unidade}` : numero;
}
