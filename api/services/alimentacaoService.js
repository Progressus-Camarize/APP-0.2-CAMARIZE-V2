import Alimentacoes from "../models/Alimentacoes.js";
import Dietas from "../models/Dietas.js";
import DietasxCativeiros from "../models/DietasxCativeiros.js";

// Data e hora de agora no fuso da placa (Brasília), nos formatos que ela usa
export const hojeEmBrasilia = (agora = new Date()) =>
  agora.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
export const horaEmBrasilia = (agora = new Date()) =>
  agora.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });

// Dieta vigente de cada cativeiro (mesma regra de /dietas/atual)
async function dietasVigentes(cativeiroIds, agora) {
  const ligacoes = await DietasxCativeiros.find({
    cativeiro: { $in: cativeiroIds },
    ativo: true,
    $and: [
      { $or: [{ inicioVigencia: null }, { inicioVigencia: { $lte: agora } }] },
      { $or: [{ fimVigencia: null }, { fimVigencia: { $gt: agora } }] },
    ],
  }).sort({ atualizadoEm: -1, _id: -1 }).select("cativeiro dieta").lean();
  const dietaIdPorCativeiro = new Map();
  for (const l of ligacoes) if (!dietaIdPorCativeiro.has(String(l.cativeiro))) dietaIdPorCativeiro.set(String(l.cativeiro), String(l.dieta));
  const dietas = new Map((await Dietas.find({ _id: { $in: [...dietaIdPorCativeiro.values()] } })
    .select("descricao quantidade horarios").lean()).map(d => [String(d._id), d]));
  const resultado = new Map();
  for (const [cativeiro, dietaId] of dietaIdPorCativeiro) {
    const d = dietas.get(dietaId);
    if (d) resultado.set(cativeiro, d);
  }
  return resultado;
}

/**
 * Resumo da alimentação de hoje por cativeiro (Map id -> resumo):
 * { dieta: { descricao, quantidade, horarios } | null, gramasPrevistas, gramasServidas,
 *   refeicoesServidas, refeicoesPrevistas, proximo: { horario, amanha } | null }
 */
export async function resumoAlimentacaoDoDia(cativeiroIds, agora = new Date()) {
  const ids = cativeiroIds.map(String);
  const data = hojeEmBrasilia(agora);
  const hora = horaEmBrasilia(agora);
  const [dietas, registros] = await Promise.all([
    dietasVigentes(ids, agora),
    Alimentacoes.find({ cativeiro: { $in: ids }, data }).select("cativeiro horario status gramas").lean(),
  ]);
  const registrosPorCativeiro = new Map();
  for (const r of registros) {
    const c = String(r.cativeiro);
    if (!registrosPorCativeiro.has(c)) registrosPorCativeiro.set(c, []);
    registrosPorCativeiro.get(c).push(r);
  }

  const resumos = new Map();
  for (const id of ids) {
    const d = dietas.get(id);
    const servidas = (registrosPorCativeiro.get(id) || []).filter(r => r.status === "servida");
    const horarios = d ? [...(d.horarios || [])].filter(Boolean).sort() : [];
    const quantidade = Number(d?.quantidade) || 0;
    const servidosHorarios = new Set(servidas.map(r => r.horario));
    const pendente = horarios.find(h => h > hora && !servidosHorarios.has(h));
    resumos.set(id, {
      dieta: d ? { descricao: d.descricao || "", quantidade, horarios } : null,
      gramasPrevistas: quantidade * horarios.length,
      gramasServidas: servidas.reduce((soma, r) => soma + (Number.isFinite(r.gramas) ? r.gramas : quantidade), 0),
      refeicoesServidas: servidas.length,
      refeicoesPrevistas: horarios.length,
      proximo: pendente ? { horario: pendente, amanha: false } : horarios.length ? { horario: horarios[0], amanha: true } : null,
    });
  }
  return resumos;
}
