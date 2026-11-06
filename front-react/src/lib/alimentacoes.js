// Situação das refeições do dia de um cativeiro: horários da dieta + o que a placa informou
// (POST /alimentacoes). Usado pelos painéis do admin e do master.

// Mesma janela do firmware: a placa ainda serve a refeição até 15 min depois do horário
export const JANELA_ATRASO_ALIMENTACAO_MIN = 15;
export const COR_ALIMENTACAO = { servida: '#15803d', falhou: '#b91c1c', sem_registro: '#b45309', prevista: '#64748b' };
const minutosDoHorario = (h) => { const [hh, mm] = String(h).split(':').map(Number); return hh * 60 + mm; };

// Junta os horários da dieta com o que a placa informou hoje (horário de Brasília, como a placa)
export function linhasAlimentacaoDoDia(horariosDieta, registros) {
  const agora = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });
  const minutoAgora = minutosDoHorario(agora);
  const porHorario = new Map((registros || []).map(r => [r.horario, r]));
  const horarios = [...new Set([...(horariosDieta || []).filter(Boolean), ...porHorario.keys()])]
    .sort((a, b) => minutosDoHorario(a) - minutosDoHorario(b));
  return horarios.map(horario => {
    const r = porHorario.get(horario);
    if (r?.status === 'servida') {
      const hora = new Date(r.registradoEm).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
      const gramas = r.gramas != null ? ` · ${Number(r.gramas).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} g` : '';
      const atraso = r.atrasoMin > 0 ? ` (${r.atrasoMin} min de atraso)` : '';
      return { horario, situacao: 'servida', texto: `Servida às ${hora}${gramas}${atraso}` };
    }
    if (r?.status === 'falhou') {
      const aindaTenta = minutoAgora <= minutosDoHorario(horario) + JANELA_ATRASO_ALIMENTACAO_MIN;
      return { horario, situacao: 'falhou', texto: `Não servida${r.motivo ? `: ${r.motivo}` : ''}${aindaTenta ? ' · a placa ainda vai tentar' : ''}` };
    }
    if (minutoAgora > minutosDoHorario(horario) + JANELA_ATRASO_ALIMENTACAO_MIN) {
      return { horario, situacao: 'sem_registro', texto: 'Sem registro da placa (desligada, sem internet ou firmware antigo)' };
    }
    return { horario, situacao: 'prevista', texto: minutoAgora >= minutosDoHorario(horario) ? 'Aguardando a placa' : 'Prevista' };
  });
}
