import Dietas from "../models/Dietas.js";
import Cativeiros from "../models/Cativeiros.js";
import DietasxCativeiros from "../models/DietasxCativeiros.js";

// Admin: criar dieta (somente descricao é obrigatória; demais campos são opcionais)
const createDieta = async (req, res) => {
  try {
    const { descricao, quantidade, horarios, quantidadeRefeicoes } = req.body;
    if (!descricao || !String(descricao).trim()) {
      return res.status(400).json({ error: "descricao é obrigatória" });
    }
    if (quantidade === undefined || quantidade === null || isNaN(Number(quantidade))) {
      return res.status(400).json({ error: "quantidade (g) é obrigatória" });
    }
    const dietaData = {
      descricao: String(descricao).trim(),
      quantidade: Number(quantidade)
    };
    if (Array.isArray(horarios) && horarios.length > 0) {
      dietaData.horarios = horarios;
    }
    if (quantidadeRefeicoes !== undefined && quantidadeRefeicoes !== null) {
      dietaData.quantidadeRefeicoes = Number(quantidadeRefeicoes);
    }
    const dieta = await Dietas.create(dietaData);
    return res.status(201).json(dieta);
  } catch (err) {
    console.error('Erro ao criar dieta:', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// Admin: listar dietas
const listDietas = async (req, res) => {
  try {
    const dietas = await Dietas.find({}).sort({ _id: -1 });
    return res.json(dietas);
  } catch (err) {
    console.error('Erro ao listar dietas:', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// Admin: atualizar dieta (descricao livre; hora/quantidade opcionais)
const updateDieta = async (req, res) => {
  try {
    const { id } = req.params;
    const { descricao, quantidade, horarios, quantidadeRefeicoes } = req.body;
    const update = {};
    if (typeof descricao !== 'undefined') update.descricao = descricao;
    if (typeof quantidade !== 'undefined') update.quantidade = Number(quantidade);
    if (Array.isArray(horarios)) update.horarios = horarios;
    if (quantidadeRefeicoes !== undefined && quantidadeRefeicoes !== null) update.quantidadeRefeicoes = Number(quantidadeRefeicoes);
    const dieta = await Dietas.findByIdAndUpdate(id, update, { new: true });
    if (!dieta) return res.status(404).json({ error: 'Dieta não encontrada' });
    return res.json(dieta);
  } catch (err) {
    console.error('Erro ao atualizar dieta:', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// Admin: deletar dieta
const deleteDieta = async (req, res) => {
  try {
    const { id } = req.params;
    const dieta = await Dietas.findByIdAndDelete(id);
    if (!dieta) return res.status(404).json({ error: 'Dieta não encontrada' });
    return res.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir dieta:', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// Admin: atribuir dieta a cativeiro (cria ou atualiza relação)
const assignDietaToCativeiro = async (req, res) => {
  try {
    const { cativeiroId } = req.params;
    const { dietaId, inicioVigencia, fimVigencia, ativo = true } = req.body;
    const c = await Cativeiros.findById(cativeiroId);
    if (!c) return res.status(404).json({ error: 'Cativeiro não encontrado' });
    const d = await Dietas.findById(dietaId);
    if (!d) return res.status(404).json({ error: 'Dieta não encontrada' });

    // Desativar outras ativas se esta for marcada ativa
    if (ativo) {
      await DietasxCativeiros.updateMany({ cativeiro: cativeiroId, ativo: true }, { $set: { ativo: false } });
    }

    const rel = await DietasxCativeiros.create({
      cativeiro: cativeiroId,
      dieta: dietaId,
      inicioVigencia: inicioVigencia ? new Date(inicioVigencia) : null,
      fimVigencia: fimVigencia ? new Date(fimVigencia) : null,
      ativo: !!ativo,
    });

    return res.status(201).json(rel);
  } catch (err) {
    console.error('Erro ao atribuir dieta:', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// GET público: dieta atual de um cativeiro
const getDietaAtual = async (req, res) => {
  try {
    const { cativeiroId } = req.params;
    const now = new Date();
    const [rel, cativeiro] = await Promise.all([
      DietasxCativeiros.findOne({
        cativeiro: cativeiroId,
        ativo: true,
        $or: [
          { inicioVigencia: null },
          { inicioVigencia: { $lte: now } }
        ],
      }).sort({ atualizadoEm: -1 }).populate('dieta'),
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
  createDieta,
  listDietas,
  updateDieta,
  deleteDieta,
  assignDietaToCativeiro,
  getDietaAtual,
};


