import mongoose from "mongoose";
import Cativeiros, { SEM_FOTO } from "../models/Cativeiros.js";
import Fazendas, { SEM_FOTO_FAZENDA } from "../models/Fazendas.js";
import FazendasxCativeiros from "../models/FazendasxCativeiros.js";
import DietasxCativeiros from "../models/DietasxCativeiros.js";
import Dietas from "../models/Dietas.js";
import { erroNaDieta, definirDietaDoCativeiro, removerDietaDoCativeiro } from "../services/dietaService.js";

const resumoDaDieta = (dieta) => dieta && ({
  _id: dieta._id,
  descricao: dieta.descricao || "",
  quantidade: dieta.quantidade,
  horarios: dieta.horarios || [],
  quantidadeRefeicoes: dieta.quantidadeRefeicoes || (dieta.horarios || []).length || null,
});

// GET /dietas/fazendas — master: todas as fazendas, com os cativeiros e a dieta de cada um
const visaoPorFazenda = async (req, res) => {
  try {
    const [fazendas, relFazendas, cativeiros, ligacoes] = await Promise.all([
      Fazendas.find({}).select(SEM_FOTO_FAZENDA).select("nome codigo cidade").sort({ nome: 1 }).lean(),
      FazendasxCativeiros.find({}).select("fazenda cativeiro").lean(),
      Cativeiros.find({}).select(SEM_FOTO).select("nome").sort({ nome: 1 }).lean(),
      DietasxCativeiros.find({ ativo: true }).sort({ atualizadoEm: -1, _id: -1 }).lean(),
    ]);
    const dietaIdPorCativeiro = new Map();
    for (const l of ligacoes) if (!dietaIdPorCativeiro.has(String(l.cativeiro))) dietaIdPorCativeiro.set(String(l.cativeiro), l.dieta);
    const dietas = new Map((await Dietas.find({ _id: { $in: [...dietaIdPorCativeiro.values()] } }).lean())
      .map(d => [String(d._id), d]));
    const fazendaDoCativeiro = new Map(relFazendas.map(r => [String(r.cativeiro), String(r.fazenda)]));

    const grupos = new Map(fazendas.map(f => [String(f._id), { _id: f._id, nome: f.nome, codigo: f.codigo, cidade: f.cidade, cativeiros: [] }]));
    const semFazenda = { _id: null, nome: "Sem fazenda", cativeiros: [] };
    for (const c of cativeiros) {
      const dietaId = dietaIdPorCativeiro.get(String(c._id));
      const item = { _id: c._id, nome: c.nome, dieta: resumoDaDieta(dietaId && dietas.get(String(dietaId))) || null };
      (grupos.get(fazendaDoCativeiro.get(String(c._id))) || semFazenda).cativeiros.push(item);
    }
    const resultado = [...grupos.values()];
    if (semFazenda.cativeiros.length) resultado.push(semFazenda);
    return res.json(resultado);
  } catch (err) {
    console.error("Erro ao montar dietas por fazenda:", err);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// PUT /dietas/cativeiro/:cativeiroId — master define a dieta do cativeiro direto
const definirDieta = async (req, res) => {
  try {
    const { cativeiroId } = req.params;
    if (!mongoose.isValidObjectId(cativeiroId) || !(await Cativeiros.exists({ _id: cativeiroId }))) {
      return res.status(404).json({ error: "Cativeiro não encontrado" });
    }
    const erro = erroNaDieta(req.body);
    if (erro) return res.status(400).json({ error: erro });
    const dieta = await definirDietaDoCativeiro(cativeiroId, req.body);
    return res.json(resumoDaDieta(dieta));
  } catch (err) {
    console.error("Erro ao definir dieta:", err);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// DELETE /dietas/cativeiro/:cativeiroId — master remove a dieta (o alimentador para)
const removerDieta = async (req, res) => {
  try {
    const { cativeiroId } = req.params;
    if (!mongoose.isValidObjectId(cativeiroId)) return res.status(404).json({ error: "Cativeiro não encontrado" });
    const { removida } = await removerDietaDoCativeiro(cativeiroId);
    if (!removida) return res.status(404).json({ error: "Este cativeiro não tem dieta" });
    return res.json({ sucesso: true });
  } catch (err) {
    console.error("Erro ao remover dieta:", err);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// GET público: dieta atual de um cativeiro (consultada pelo ESP32 a cada minuto)
const getDietaAtual = async (req, res) => {
  try {
    const { cativeiroId } = req.params;
    if (!mongoose.isValidObjectId(cativeiroId)) return res.status(404).json({ error: 'Dieta atual não encontrada' });
    const now = new Date();
    const [rel, cativeiro] = await Promise.all([
      DietasxCativeiros.findOne({
        cativeiro: cativeiroId,
        ativo: true,
        $and: [
          { $or: [{ inicioVigencia: null }, { inicioVigencia: { $lte: now } }] },
          { $or: [{ fimVigencia: null }, { fimVigencia: { $gt: now } }] },
        ],
      }).sort({ atualizadoEm: -1, _id: -1 }).populate('dieta'),
      Cativeiros.findById(cativeiroId).select('gramas_por_rotacao').lean(),
    ]);

    if (!rel || !rel.dieta) return res.status(404).json({ error: 'Dieta atual não encontrada' });

    return res.json({
      cativeiroId,
      dietaId: rel.dieta._id,
      horaAlimentacao: rel.dieta.horaAlimentacao,
      horarios: rel.dieta.horarios || [],
      quantidadeRefeicoes: rel.dieta.quantidadeRefeicoes || null,
      quantidade: rel.dieta.quantidade,
      descricao: rel.dieta.descricao || null,
      gramas_por_rotacao: cativeiro?.gramas_por_rotacao ?? null,
    });
  } catch (err) {
    console.error('Erro ao buscar dieta atual:', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

export default {
  visaoPorFazenda,
  definirDieta,
  removerDieta,
  getDietaAtual,
};
