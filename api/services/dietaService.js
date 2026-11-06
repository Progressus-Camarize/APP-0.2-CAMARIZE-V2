import mongoose from "mongoose";
import Dietas from "../models/Dietas.js";
import DietasxCativeiros from "../models/DietasxCativeiros.js";
import Cativeiros from "../models/Cativeiros.js";

// Cada cativeiro tem a própria dieta (Dietas.cativeiro). A ligação ativa em DietasxCativeiros
// continua sendo o que vale para o ESP32 (/dietas/atual) e guarda o histórico.

const HORARIO_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Dados de dieta: gramas por refeição e horários válidos (a placa só entende HH:MM)
export function erroNaDieta(dados) {
  const gramas = Number(dados?.quantidade);
  if (!Number.isFinite(gramas) || gramas <= 0) return "A quantidade de ração (g) deve ser maior que zero";
  const horarios = Array.isArray(dados?.horarios) ? dados.horarios.filter(Boolean) : [];
  if (!horarios.length) return "Informe ao menos um horário de alimentação";
  if (horarios.some(h => !HORARIO_RE.test(String(h)))) return "Horários devem estar no formato HH:MM";
  if (new Set(horarios).size !== horarios.length) return "Há horários repetidos";
  return null;
}

const ordenarHorarios = (horarios) =>
  [...horarios].sort((a, b) => a.localeCompare(b));

function dadosDaDieta(dados) {
  const horarios = ordenarHorarios((dados.horarios || []).filter(Boolean).map(String));
  return {
    descricao: String(dados.descricao || "").trim().slice(0, 100),
    quantidade: Number(dados.quantidade),
    horarios,
    quantidadeRefeicoes: horarios.length,
    horaAlimentacao: horarios[0] || "",
  };
}

// Ligação ativa mais recente do cativeiro (a mesma que /dietas/atual usa)
export const ligacaoAtiva = (cativeiroId) =>
  DietasxCativeiros.findOne({ cativeiro: cativeiroId, ativo: true }).sort({ atualizadoEm: -1, _id: -1 }).lean();

// Define a dieta do cativeiro: edita a dele no lugar; se ainda não tem (ou a ativa é de outro
// cativeiro, caso de dados antigos), cria uma própria e passa a usá-la.
export async function definirDietaDoCativeiro(cativeiroId, dados) {
  const data = dadosDaDieta(dados);
  const atual = await ligacaoAtiva(cativeiroId);
  if (atual) {
    const dieta = await Dietas.findById(atual.dieta).lean();
    const compartilhada = !dieta || (dieta.cativeiro && String(dieta.cativeiro) !== String(cativeiroId))
      || await DietasxCativeiros.exists({ dieta: atual.dieta, ativo: true, cativeiro: { $ne: atual.cativeiro } });
    if (!compartilhada) {
      return Dietas.findByIdAndUpdate(atual.dieta, { ...data, cativeiro: cativeiroId }, { returnDocument: "after" }).lean();
    }
  }
  const nova = await Dietas.create({ ...data, cativeiro: cativeiroId });
  await DietasxCativeiros.updateMany({ cativeiro: cativeiroId, ativo: true }, { $set: { ativo: false, fimVigencia: new Date() } });
  await DietasxCativeiros.create({ cativeiro: cativeiroId, dieta: nova._id, ativo: true });
  return nova.toObject();
}

// Remove a dieta do cativeiro: a placa recebe 404 e para de alimentar
export async function removerDietaDoCativeiro(cativeiroId) {
  const ligacoes = await DietasxCativeiros.find({ cativeiro: cativeiroId }).select("dieta").lean();
  const dietaIds = [...new Set(ligacoes.map(l => String(l.dieta)))];
  await DietasxCativeiros.deleteMany({ cativeiro: cativeiroId });
  // Só apaga as dietas que nenhum outro cativeiro usa
  const emUso = await DietasxCativeiros.distinct("dieta", { dieta: { $in: dietaIds } });
  const usadas = new Set(emUso.map(String));
  const apagar = dietaIds.filter(id => !usadas.has(id));
  if (apagar.length) await Dietas.deleteMany({ _id: { $in: apagar } });
  return { removida: ligacoes.length > 0 };
}

/**
 * Migração para "uma dieta por cativeiro" (scripts/migrar-dietas-por-cativeiro.js).
 * - Ligações de cativeiros que já foram excluídos são apagadas.
 * - Cativeiro com mais de uma ligação ativa: fica só a mais recente.
 * - Dieta ativa em vários cativeiros: o primeiro fica com ela; cada um dos outros ganha uma cópia.
 * - Toda dieta ativa passa a ter o campo cativeiro.
 * - Dietas sem ligação ativa (soltas) são apagadas, com as ligações antigas que apontam para elas.
 * Com aplicar=false só calcula o relatório, sem gravar nada.
 */
export async function migrarDietasPorCativeiro({ aplicar = false } = {}) {
  const relatorio = { ligacoesDeCativeiroExcluido: [], ligacoesDuplicadasDesativadas: [], copias: [], donosDefinidos: 0, ligacoesSemDieta: [], dietasApagadas: [], ligacoesAntigasApagadas: 0 };

  // Cativeiro excluído antes desta versão deixava a dieta para trás
  const cativeirosComLigacao = await DietasxCativeiros.distinct("cativeiro");
  const existentes = new Set((await Cativeiros.find({ _id: { $in: cativeirosComLigacao } }).select("_id").lean()).map(c => String(c._id)));
  const orfas = cativeirosComLigacao.filter(id => !existentes.has(String(id)));
  if (orfas.length) {
    const ligacoesOrfas = await DietasxCativeiros.find({ cativeiro: { $in: orfas } }).lean();
    relatorio.ligacoesDeCativeiroExcluido = ligacoesOrfas.map(l => ({ cativeiro: String(l.cativeiro), dieta: String(l.dieta), ativa: !!l.ativo }));
  }
  const filtroExistente = orfas.length ? { cativeiro: { $nin: orfas } } : {};

  const ativas = await DietasxCativeiros.find({ ativo: true, ...filtroExistente }).sort({ atualizadoEm: -1, _id: -1 }).lean();
  const vigente = new Map(); // cativeiro -> ligação mais recente
  for (const l of ativas) {
    const c = String(l.cativeiro);
    if (!vigente.has(c)) vigente.set(c, l);
    else relatorio.ligacoesDuplicadasDesativadas.push({ cativeiro: c, dieta: String(l.dieta) });
  }
  if (aplicar && orfas.length) await DietasxCativeiros.deleteMany({ cativeiro: { $in: orfas } });
  if (aplicar && relatorio.ligacoesDuplicadasDesativadas.length) {
    const manter = [...vigente.values()].map(l => l._id);
    await DietasxCativeiros.updateMany({ ativo: true, _id: { $nin: manter } }, { $set: { ativo: false, fimVigencia: new Date() } });
  }

  const dietas = new Map((await Dietas.find({}).lean()).map(d => [String(d._id), d]));
  const porDieta = new Map(); // dieta -> ligações vigentes (mais antiga primeiro: ela fica com a original)
  for (const l of [...vigente.values()].reverse()) {
    const d = String(l.dieta);
    if (!dietas.has(d)) { relatorio.ligacoesSemDieta.push({ cativeiro: String(l.cativeiro), dieta: d }); continue; }
    if (!porDieta.has(d)) porDieta.set(d, []);
    porDieta.get(d).push(l);
  }

  for (const [dietaId, ligacoes] of porDieta) {
    const original = dietas.get(dietaId);
    const [primeira, ...outras] = ligacoes;
    if (String(original.cativeiro || "") !== String(primeira.cativeiro)) {
      relatorio.donosDefinidos++;
      if (aplicar) await Dietas.updateOne({ _id: dietaId }, { $set: { cativeiro: primeira.cativeiro } });
    }
    for (const l of outras) {
      relatorio.copias.push({ dieta: dietaId, descricao: original.descricao || "", cativeiro: String(l.cativeiro) });
      if (aplicar) {
        // eslint-disable-next-line no-unused-vars
        const { _id, __v, ...campos } = original;
        const copia = await Dietas.create({ ...campos, cativeiro: l.cativeiro });
        await DietasxCativeiros.updateOne({ _id: l._id }, { $set: { dieta: copia._id } });
      }
    }
  }
  if (aplicar && relatorio.ligacoesSemDieta.length) {
    await DietasxCativeiros.updateMany(
      { ativo: true, dieta: { $in: relatorio.ligacoesSemDieta.map(l => new mongoose.Types.ObjectId(l.dieta)) } },
      { $set: { ativo: false, fimVigencia: new Date() } },
    );
  }

  const emUso = new Set(porDieta.keys());
  const soltas = [...dietas.values()].filter(d => !emUso.has(String(d._id)));
  relatorio.dietasApagadas = soltas.map(d => ({ dieta: String(d._id), descricao: d.descricao || "", quantidade: d.quantidade ?? null }));
  const idsSoltas = soltas.map(d => d._id);
  relatorio.ligacoesAntigasApagadas = idsSoltas.length
    ? await DietasxCativeiros.countDocuments({ dieta: { $in: idsSoltas }, ativo: { $ne: true }, ...filtroExistente })
    : 0;
  if (aplicar && idsSoltas.length) {
    await DietasxCativeiros.deleteMany({ dieta: { $in: idsSoltas }, ativo: { $ne: true } });
    await Dietas.deleteMany({ _id: { $in: idsSoltas } });
  }

  return relatorio;
}
