import cativeiroService from "../services/cativeiroService.js";
import TiposCamarao from "../models/Camaroes.js";
import CondicoesIdeais from "../models/Condicoes_ideais.js";
import FazendasxCativeiros from "../models/FazendasxCativeiros.js";
import SensoresxCativeiros from "../models/SensoresxCativeiros.js";
import Cativeiros from "../models/Cativeiros.js";
import ParametrosAtuais from "../models/Parametros_atuais.js";
import Dietas from "../models/Dietas.js";
import DietasxCativeiros from "../models/DietasxCativeiros.js";
import UsuariosxFazendas from "../models/UsuariosxFazendas.js";
import Sensores from "../models/Sensores.js";
import mongoose from "mongoose";
import accessService from "../services/accessService.js";

// Campos que só o servidor define: dono, calibração e condições ideais (criadas a partir do tipo de camarão)
const CAMPOS_PROTEGIDOS = ['_id', 'user', 'gramas_por_rotacao', 'tensao_ph7', 'tensao_ph4', 'condicoes_ideais', 'createdAt', 'updatedAt'];
const semCamposProtegidos = (body) => {
  const data = { ...body };
  for (const campo of CAMPOS_PROTEGIDOS) delete data[campo];
  return data;
};

// Mantém só os sensores que o usuário pode vincular (master: qualquer um; demais: os próprios)
const sensoresPermitidos = async (ids, loggedUser) => {
  const validos = [...new Set(ids.filter(id => mongoose.isValidObjectId(id)).map(String))];
  if (validos.length === 0 || loggedUser.role === 'master') return validos;
  const proprios = await Sensores.find({ _id: { $in: validos }, user: loggedUser.id }).distinct('_id');
  return proprios.map(String);
};
import Aviso from '../models/Aviso.js';
import { freshness, VALID_READING_FILTER } from '../services/avisoService.js';

/**
 * Verifica se um usuário tem permissão para acessar um cativeiro.
 * @returns {true}  acesso permitido
 * @returns {false} sem permissão
 * @returns {null}  cativeiro não encontrado
 */
const assertCativeiroAccess = async (cativeiroId, userId, role) => {
  if (!mongoose.isValidObjectId(cativeiroId)) return null;
  if (role === 'master') return true;

  const cativeiro = await Cativeiros.findById(cativeiroId).select('user').lean();
  if (!cativeiro) return null;

  // Dono direto do cativeiro
  if (cativeiro.user?.toString() === userId.toString()) return true;

  // Fallback: usuário pertence à fazenda que contém o cativeiro
  const fazendasDoUsuario = await UsuariosxFazendas.find({
    usuario: userId,
    $or: [{ ativo: true }, { ativo: { $exists: false } }]
  }).select('fazenda').lean();

  if (fazendasDoUsuario.length === 0) return false;

  const vinculo = await FazendasxCativeiros.findOne({
    fazenda: { $in: fazendasDoUsuario.map(f => f.fazenda) },
    cativeiro: cativeiroId
  }).lean();

  return vinculo !== null;
};

const createCativeiro = async (req, res) => {
  try {
    // Só cria cativeiro em fazenda à qual o usuário pertence
    if (!(await accessService.podeAcessarFazenda(req.loggedUser, req.body.fazendaId))) {
      return res.status(403).json({ error: 'Você não tem acesso a esta fazenda.' });
    }

    const data = semCamposProtegidos(req.body);
    if (req.file) {
      data.foto_cativeiro = req.file.buffer;
    }

    // Valida e converte os valores das condições ideais
    const validarEConverter = (valor, padrao) => {
      if (!valor || valor === '') return padrao;
      const num = parseFloat(valor);
      if (isNaN(num)) return padrao;
      return num;
    };

    const tempIdeal = validarEConverter(data.temp_media_diaria, 26);
    const phIdeal = validarEConverter(data.ph_medio_diario, 7.5);
    const amoniaIdeal = validarEConverter(data.amonia_media_diaria, 0.05);

    // Cria a condição ideal usando os valores validados
    const condicao = await CondicoesIdeais.create({
      id_tipo_camarao: data.id_tipo_camarao,
      temp_ideal: tempIdeal,
      ph_ideal: phIdeal,
      amonia_ideal: amoniaIdeal
    });
    data.condicoes_ideais = condicao._id;

    // Deixa os campos de monitoramento diário do cativeiro como null
    data.temp_media_diaria = null;
    data.ph_medio_diario = null;
    data.amonia_media_diaria = null;

    // Associar o usuário logado ao cativeiro
    if (req.loggedUser?.id) {
      data.user = req.loggedUser.id;
    }

    // dieta (string) pode vir do body
    // dieta como texto pode vir no request (dieta_texto) apenas para conveniência de criação

    const result = await cativeiroService.Create(data);
    if (!result) {
      return res.status(500).json({ error: "Falha ao salvar no banco." });
    }

    // Cria o relacionamento na tabela intermediária fazenda-cativeiro
    await FazendasxCativeiros.create({ fazenda: req.body.fazendaId, cativeiro: result._id });

    // Cria os relacionamentos sensor-cativeiro para todos os sensores fornecidos
    console.log('🔍 Verificando sensores na criação:', {
      sensorIds: req.body.sensorIds,
      sensorId: req.body.sensorId,
      isArray: Array.isArray(req.body.sensorIds),
      bodyKeys: Object.keys(req.body)
    });

    // Processa os sensores fornecidos
    let sensoresParaProcessar = [];

    // Verifica se sensorIds é um array (JSON) ou string única (FormData)
    if (req.body.sensorIds) {
      if (Array.isArray(req.body.sensorIds)) {
        // Dados enviados como JSON
        sensoresParaProcessar = req.body.sensorIds;
        console.log('📦 Processando sensorIds como array JSON:', sensoresParaProcessar);
      } else if (typeof req.body.sensorIds === 'string') {
        // Dados enviados como FormData - pode ser string única ou múltiplas
        sensoresParaProcessar = [req.body.sensorIds];
        console.log('📦 Processando sensorIds como string FormData:', sensoresParaProcessar);
      }
    }

         if (sensoresParaProcessar.length > 0) {
       try {
         // Filtra apenas sensores válidos, do próprio usuário, e remove duplicatas
         const sensoresValidos = await sensoresPermitidos(sensoresParaProcessar, req.loggedUser);

         if (sensoresValidos.length > 0) {
           // Cria novas relações para todos os sensores válidos
           const relacoes = [];
           for (const sensorId of sensoresValidos) {
             const relacao = await SensoresxCativeiros.create({
               id_sensor: sensorId,
               id_cativeiro: result._id
             });
             relacoes.push(relacao);
             console.log(`✅ Relação sensor-cativeiro criada: Sensor ${sensorId} -> Cativeiro ${result._id}`);
           }
           console.log(`📝 Total de relações criadas: ${relacoes.length}`);
         } else {
           console.log('⚠️  Nenhum sensor válido fornecido no cadastro');
         }
      } catch (error) {
        console.error('❌ Erro ao criar relações sensor-cativeiro:', error.message);
      }
    } else if (req.body.sensorId && req.body.sensorId !== "") {
      // Fallback para compatibilidade com sensorId único
      try {
        const [sensorPermitido] = await sensoresPermitidos([req.body.sensorId], req.loggedUser);
        if (!sensorPermitido) throw new Error('Sensor não pertence ao usuário');
        await SensoresxCativeiros.create({
          id_sensor: sensorPermitido,
          id_cativeiro: result._id
        });
        console.log(`✅ Relação sensor-cativeiro criada: Sensor ${req.body.sensorId} -> Cativeiro ${result._id}`);
      } catch (error) {
        console.error('❌ Erro ao criar relação sensor-cativeiro:', error.message);
      }
    } else {
      console.log('⚠️  Nenhum sensor fornecido no cadastro');
    }

    // Se vier dieta (descrição), registra também em Dietas e relaciona
    // dieta inicial: somente masters podem criar/atribuir na criação
    try {
      const role = req.loggedUser?.role;
      if (role === 'master' && req.body.dieta_texto && String(req.body.dieta_texto).trim()) {
        const dietaDoc = await Dietas.create({ descricao: String(req.body.dieta_texto).trim() });
        await DietasxCativeiros.create({ cativeiro: result._id, dieta: dietaDoc._id, ativo: true });
      }
    } catch (e) {
      console.error('Erro ao criar/atribuir dieta_texto na criação:', e.message);
    }

    res.status(201).json({
      message: "Cativeiro criado com sucesso!",
      cativeiroId: result._id,
      sensorRelacionado: req.body.sensorId ? true : false
    });
  } catch (error) {
    console.log("Erro no controller:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
};

const getAllCativeiros = async (req, res) => {
  try {
    const usuarioId = req.loggedUser?.id;
    const role = req.loggedUser?.role;

    console.log('🔍 DEBUG getAllCativeiros - usuarioId:', usuarioId, 'role:', role);
    console.log('🔍 DEBUG req.loggedUser completo:', req.loggedUser);

    let cativeiros = [];
    if (role === 'master') {
      // Master enxerga todos os cativeiros
      console.log('🔍 DEBUG - Buscando todos os cativeiros para master');
      cativeiros = await cativeiroService.getAll();
      console.log('🔍 DEBUG - Cativeiros encontrados:', cativeiros.length);
    } else {
      // Admin e Membro veem apenas seus próprios cativeiros pelos relacionamentos das suas fazendas
      console.log('🔍 DEBUG - Buscando cativeiros por relacionamentos para role:', role);
      cativeiros = await cativeiroService.getAllByUsuarioViaRelacionamentos(usuarioId);
      console.log('🔍 DEBUG - Cativeiros encontrados por relacionamento:', cativeiros.length);
    }

    console.log('🔍 DEBUG - Retornando cativeiros:', cativeiros.length);
    res.status(200).json(cativeiros);
  } catch (error) {
    console.error('❌ Erro em getAllCativeiros:', error);
    res.status(500).json({ error: "Erro ao buscar cativeiros." });
  }
};

const getAllTiposCamarao = async (req, res) => {
  try {
    const tipos = await TiposCamarao.find().lean(); // Usa lean() para melhor performance
    res.status(200).json(tipos);
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar tipos de camarão." });
  }
};

const getCativeiroById = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🔍 Buscando cativeiro por ID:', id);

    const cativeiro = await cativeiroService.getById(id);
    if (!cativeiro) {
      return res.status(404).json({ error: 'Cativeiro não encontrado.' });
    }

    // Ownership check — só roda quando chamado via HTTP (req.loggedUser existe).
    // Quando chamado internamente pelo endpoint de foto (req falso sem loggedUser), é ignorado.
    if (req.loggedUser) {
      const access = await assertCativeiroAccess(id, req.loggedUser.id, req.loggedUser.role);
      if (access === null) return res.status(404).json({ error: 'Cativeiro não encontrado.' });
      if (access === false) return res.status(403).json({ error: 'Acesso negado. Você não tem permissão para visualizar este cativeiro.' });
    }

    console.log('📊 Dados do cativeiro antes do JSON:');
    console.log('  ID:', cativeiro._id);
    console.log('  Fazenda:', cativeiro.fazenda);
    console.log('  Sensores:', cativeiro.sensores ? cativeiro.sensores.length : 0);

    if (cativeiro.sensores && cativeiro.sensores.length > 0) {
      console.log('  Detalhes dos sensores:');
      cativeiro.sensores.forEach((sensor, index) => {
        console.log(`    ${index + 1}. ${sensor.apelido} (${sensor.id_tipo_sensor}) - ID: ${sensor._id}`);
      });
    }

    res.status(200).json(cativeiro);
  } catch (error) {
    console.error('❌ Erro no getCativeiroById:', error);
    res.status(500).json({ error: 'Erro ao buscar cativeiro.' });
  }
};

const updateCativeiro = async (req, res) => {
  try {
    const { id } = req.params;
    const acesso = await assertCativeiroAccess(id, req.loggedUser.id, req.loggedUser.role);
    if (acesso === null) return res.status(404).json({ error: 'Cativeiro não encontrado.' });
    if (!acesso) return res.status(403).json({ error: 'Acesso negado a este cativeiro.' });

    const data = semCamposProtegidos(req.body);

    if (req.file) {
      data.foto_cativeiro = req.file.buffer;
    }

    // Se houver mudança no tipo de camarão, atualizar as condições ideais
    if (data.id_tipo_camarao) {
      // Valida e converte os valores das condições ideais
      const validarEConverter = (valor, padrao) => {
        if (!valor || valor === '') return padrao;
        const num = parseFloat(valor);
        if (isNaN(num)) return padrao;
        return num;
      };

      const tempIdeal = validarEConverter(data.temp_media_diaria, 26);
      const phIdeal = validarEConverter(data.ph_medio_diario, 7.5);
      const amoniaIdeal = validarEConverter(data.amonia_media_diaria, 0.05);

      const condicao = await CondicoesIdeais.create({
        id_tipo_camarao: data.id_tipo_camarao,
        temp_ideal: tempIdeal,
        ph_ideal: phIdeal,
        amonia_ideal: amoniaIdeal
      });
      data.condicoes_ideais = condicao._id;
      // Remove os campos de monitoramento diário
      data.temp_media_diaria = null;
      data.ph_medio_diario = null;
      data.amonia_media_diaria = null;
    }

    const result = await cativeiroService.update(id, data);
    if (!result) {
      return res.status(404).json({ error: 'Cativeiro não encontrado.' });
    }

    // Atualiza as relações sensor-cativeiro se sensores foram fornecidos
    console.log('🔍 Dados recebidos na edição:', {
      sensorIds: req.body.sensorIds,
      sensorId: req.body.sensorId,
      isArray: Array.isArray(req.body.sensorIds),
      bodyKeys: Object.keys(req.body)
    });

    // Só mexe nas relações de sensores se houver payload relacionado a sensores
    const hasSensorPayload = typeof req.body.sensorIds !== 'undefined' || typeof req.body.sensorId !== 'undefined';
    if (hasSensorPayload) {
      // Remove relações anteriores para recriar
      await SensoresxCativeiros.deleteMany({ id_cativeiro: id });
      console.log(`🗑️  Relações anteriores removidas para cativeiro ${id}`);

      // Processa os sensores fornecidos
      let sensoresParaProcessar = [];

      // Verifica se sensorIds é um array (JSON) ou string única (FormData)
      if (req.body.sensorIds) {
        if (Array.isArray(req.body.sensorIds)) {
          // Dados enviados como JSON
          sensoresParaProcessar = req.body.sensorIds;
          console.log('📦 Processando sensorIds como array JSON:', sensoresParaProcessar);
        } else if (typeof req.body.sensorIds === 'string') {
          // Dados enviados como FormData - pode ser string única ou múltiplas
          sensoresParaProcessar = [req.body.sensorIds];
          console.log('📦 Processando sensorIds como string FormData:', sensoresParaProcessar);
        }
      }

      if (sensoresParaProcessar.length > 0) {
        // Filtra apenas sensores válidos, do próprio usuário, e remove duplicatas
        const sensoresValidos = await sensoresPermitidos(sensoresParaProcessar, req.loggedUser);

        if (sensoresValidos.length > 0) {
          // Cria novas relações para todos os sensores válidos
          const relacoes = [];
          for (const sensorId of sensoresValidos) {
            const relacao = await SensoresxCativeiros.create({
              id_sensor: sensorId,
              id_cativeiro: id
            });
            relacoes.push(relacao);
            console.log(`✅ Relação sensor-cativeiro atualizada: Sensor ${sensorId} -> Cativeiro ${id}`);
          }
          console.log(`📝 Total de relações atualizadas: ${relacoes.length}`);
        } else {
          console.log('⚠️  Nenhum sensor válido fornecido na edição');
        }
      }
    } else if (req.body.sensorId && req.body.sensorId !== "") {
      // Fallback para compatibilidade com sensorId único
      try {
        const [sensorPermitido] = await sensoresPermitidos([req.body.sensorId], req.loggedUser);
        if (!sensorPermitido) throw new Error('Sensor não pertence ao usuário');
        await SensoresxCativeiros.create({
          id_sensor: sensorPermitido,
          id_cativeiro: id
        });
        console.log(`✅ Relação sensor-cativeiro atualizada: Sensor ${req.body.sensorId} -> Cativeiro ${id}`);
      } catch (error) {
        console.error('❌ Erro ao atualizar relação sensor-cativeiro:', error.message);
      }
    } else {
      console.log('ℹ️  Edição sem payload de sensores - mantendo vínculos existentes.');
    }

    // Se alterar dieta (descrição), cria nova Dieta e marca relação ativa
    // dieta removida do fluxo de patch do cativeiro; usar /dietas/assign/:cativeiroId

    res.status(200).json({
      message: 'Cativeiro atualizado com sucesso!',
      cativeiro: result,
      sensorRelacionado: req.body.sensorId ? true : false
    });
  } catch (error) {
    console.log("Erro no controller:", error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};


const deleteCativeiro = async (req, res) => {
  try {
    const { id } = req.params;
    const acesso = await assertCativeiroAccess(id, req.loggedUser.id, req.loggedUser.role);
    if (acesso === null) return res.status(404).json({ error: 'Cativeiro não encontrado.' });
    if (!acesso) return res.status(403).json({ error: 'Acesso negado a este cativeiro.' });
    const result = await cativeiroService.delete(id);
    if (!result) {
      return res.status(404).json({ error: 'Cativeiro não encontrado.' });
    }
    res.status(200).json({ message: 'Cativeiro deletado com sucesso!' });
  } catch (error) {
    console.log("Erro no controller:", error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

const getAllCondicoesIdeais = async (req, res) => {
  try {
    const condicoes = await CondicoesIdeais.find().populate('id_tipo_camarao').lean(); // Usa lean() para melhor performance
    res.status(200).json(condicoes);
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar condições ideais." });
  }
};

const getSensoresCativeiro = async (req, res) => {
  try {
    const { cativeiroId } = req.params;

    const access = await assertCativeiroAccess(cativeiroId, req.loggedUser.id, req.loggedUser.role);
    if (access === null) return res.status(404).json({ error: 'Cativeiro não encontrado.' });
    if (access === false) return res.status(403).json({ error: 'Acesso negado. Você não tem permissão para visualizar os sensores deste cativeiro.' });

    // Popula id_sensor e também o id_tipo_sensor interno para que o frontend receba
    // a descrição do tipo do sensor (TiposSensor.descricao)
    const sensores = await SensoresxCativeiros.find({ id_cativeiro: cativeiroId })
      .populate({
        path: 'id_sensor',
        populate: {
          path: 'id_tipo_sensor',
          select: 'descricao'
        }
      })
      .populate('id_cativeiro');

    // Converter para objetos simples manualmente para manter performance
    const sensoresSimplificados = sensores.map(s => {
      const sObj = s.toObject ? s.toObject() : s;
      return sObj;
    });

    res.status(200).json(sensoresSimplificados);
  } catch (error) {
    console.error('Erro ao buscar sensores do cativeiro:', error);
    res.status(500).json({ error: "Erro ao buscar sensores do cativeiro." });
  }
};

// Buscar status geral de todos os cativeiros do usuário
const getCativeirosStatus = async (req, res) => {
  try {
    const cativeiros = await cativeiroService.getAllByUsuarioViaRelacionamentos(req.loggedUser.id);
    const items = await Promise.all(cativeiros.map(async cativeiro => {
      const [reading, avisos] = await Promise.all([
        ParametrosAtuais.findOne({ id_cativeiro: cativeiro._id, ...VALID_READING_FILTER }).sort({ datahora: -1 }).lean(),
        Aviso.find({ cativeiro: cativeiro._id, estado: 'ativo' }).lean(),
      ]);
      const frescor = freshness(reading);
      const status = frescor.estado !== 'recente' ? 'sem_dados' : avisos.length ? 'alerta' : 'ok';
      const alertasDetalhados = avisos.map(a => ({
        tipo: a.tipo, severidade: 'media', mensagem: a.mensagem,
        valorAtual: a.valorAtual, valorIdeal: a.tipo === 'temperatura' ? a.limite : a.valorInicial,
        datahora: a.criadoEm, experimental: a.experimental,
      }));
      return {
        id: cativeiro._id,
        nome: cativeiro.nome || `Cativeiro ${cativeiro._id}`,
        tipo_camarao: cativeiro.id_tipo_camarao?.nome || 'Tipo não informado',
        status,
        statusText: status === 'alerta' ? 'AVISO' : status === 'ok' ? 'SEM AVISO' : 'DADOS ANTIGOS OU AUSENTES',
        statusColor: status === 'alerta' ? '#f59e0b' : status === 'ok' ? '#10b981' : '#9ca3af',
        alertas: avisos.length ? ['media'] : [],
        alertasDetalhados,
        totalAlertas: avisos.length,
        ultimaAtualizacao: reading?.datahora,
        frescor,
      };
    }));
    res.json({ success: true, cativeiros: items, resumo: {
      total: items.length,
      ok: items.filter(i => i.status === 'ok').length,
      alerta: items.filter(i => i.status === 'alerta').length,
      critico: 0,
      semDados: items.filter(i => i.status === 'sem_dados').length,
    } });
  } catch (error) {
    console.error('Erro ao buscar status dos cativeiros:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
};

// Método específico para atualizar dados do cativeiro sem enviar resposta
const updateCativeiroData = async (id, data) => {
  const result = await cativeiroService.update(id, data);
  if (!result) throw new Error('Cativeiro não encontrado.');
  return result;
};

export default {
  createCativeiro,
  getAllCativeiros,
  getAllTiposCamarao,
  getCativeiroById,
  updateCativeiro,
  updateCativeiroData,
  deleteCativeiro,
  getAllCondicoesIdeais,
  getSensoresCativeiro,
  getCativeirosStatus,
  assertCativeiroAccess,
};
