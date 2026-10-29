const MINUTOS_POR_HORA = 60;
const MINUTOS_POR_DIA = 24 * MINUTOS_POR_HORA;

const plural = (n, singular, pluralForma) => `${n} ${n === 1 ? singular : pluralForma}`;

// Tempo decorrido em texto amigável: "há 12 min", "há 5 horas", "há 2 dias".
// Até 1 hora em minutos, até 48 horas em horas, depois em dias (acima de 30 dias, "há mais de 1 mês").
export function formatarTempoDesde(minutos) {
  if (minutos === null || minutos === undefined || !Number.isFinite(Number(minutos))) return null;
  const total = Math.max(0, Math.floor(Number(minutos)));

  if (total < 1) return 'agora há pouco';
  if (total < MINUTOS_POR_HORA) return `há ${total} min`;
  if (total < 48 * MINUTOS_POR_HORA) {
    // Arredonda para a hora mais próxima, sem passar para "48 horas" (a partir daí vira dias)
    return `há ${plural(Math.min(47, Math.max(1, Math.round(total / MINUTOS_POR_HORA))), 'hora', 'horas')}`;
  }
  if (total <= 30 * MINUTOS_POR_DIA) {
    return `há ${plural(Math.round(total / MINUTOS_POR_DIA), 'dia', 'dias')}`;
  }
  return 'há mais de 1 mês';
}
