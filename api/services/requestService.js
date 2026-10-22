import mongoose from "mongoose";
import Request from "../models/Requests.js";
import userService from "../services/userService.js";
import Fazendas from "../models/Fazendas.js";
import UsuariosxFazendas from "../models/UsuariosxFazendas.js";
import Cativeiros from "../models/Cativeiros.js";
import CondicoesIdeais from "../models/Condicoes_ideais.js";
import Dietas from "../models/Dietas.js";
import DietasxCativeiros from "../models/DietasxCativeiros.js";
import Sensores from "../models/Sensores.js";
import SensoresxCativeiros from "../models/SensoresxCativeiros.js";
import FazendasxCativeiros from "../models/FazendasxCativeiros.js";

class RequestService {
  async create({ requesterUser, requesterRole, targetRole, type, action, payload, fazenda }) {
    const req = new Request({ requesterUser, requesterRole, targetRole, type, action, payload, fazenda });
    return await req.save();
  }

  // Fazendas do usuário (vínculo ativo ou legado sem o campo) e todos os usuários ligados a elas
  async getFazendaScope(userId) {
    const ativo = { $or: [{ ativo: true }, { ativo: { $exists: false } }] };
    const fazendaIds = await UsuariosxFazendas.find({ usuario: userId, ...ativo }).distinct('fazenda');
    if (fazendaIds.length === 0) return { fazendaIds: [], userIds: [] };
    const userIds = await UsuariosxFazendas.find({ fazenda: { $in: fazendaIds }, ...ativo }).distinct('usuario');
    return { fazendaIds, userIds };
  }

  // Filtro das solicitações que um admin pode ver e decidir: destinadas a admin e das fazendas dele.
  // Solicitações sem fazenda (anteriores a essa regra) caem no vínculo de quem pediu.
  // Retorna null quando o admin não tem fazenda (não enxerga nada).
  async adminScopeFilter(adminId) {
    const { fazendaIds, userIds } = await this.getFazendaScope(adminId);
    if (fazendaIds.length === 0) return null;
    return {
      targetRole: 'admin',
      $or: [{ fazenda: { $in: fazendaIds } }, { fazenda: null, requesterUser: { $in: userIds } }],
    };
  }

  // Descobre a qual fazenda a solicitação de um funcionário se refere: a informada no corpo,
  // a do cativeiro ou sensor do payload, ou a única fazenda do funcionário.
  // Sempre confere se o funcionário pertence à fazenda encontrada.
  async resolveMemberFazenda(memberId, { fazenda, action, payload = {} }) {
    const { fazendaIds } = await this.getFazendaScope(memberId);
    const doFuncionario = new Set(fazendaIds.map(String));

    // O alvo do pedido (cativeiro/sensor) manda; a fazenda informada no corpo só vale sem alvo
    let encontrada = null;
    if (mongoose.isValidObjectId(payload.cativeiroId)) {
      encontrada = (await FazendasxCativeiros.findOne({ cativeiro: payload.cativeiroId }).lean())?.fazenda;
    }
    if (!encontrada && action === 'editar_sensor' && mongoose.isValidObjectId(payload.id)) {
      const vinculo = await SensoresxCativeiros.findOne({ id_sensor: payload.id }).lean();
      if (vinculo) encontrada = (await FazendasxCativeiros.findOne({ cativeiro: vinculo.id_cativeiro }).lean())?.fazenda;
    }
    if (!encontrada) encontrada = fazenda || payload.fazendaId || null;

    if (encontrada) {
      if (!doFuncionario.has(String(encontrada))) {
        throw Object.assign(new Error('Você não pertence à fazenda desta solicitação'), { status: 403 });
      }
      return encontrada;
    }
    if (fazendaIds.length === 1) return fazendaIds[0];
    throw Object.assign(new Error('Informe a fazenda desta solicitação'), { status: 400 });
  }

  async hasPending(requesterUser, action) {
    return !!(await Request.exists({ requesterUser, action, status: 'pendente' }));
  }

  // Busca a solicitação só se o usuário puder decidir sobre ela (master decide qualquer uma)
  async findDecidable(id, user) {
    if (!mongoose.isValidObjectId(id)) return null;
    if (user.role === 'master') return await Request.findById(id);
    if (user.role !== 'admin') return null;
    const scope = await this.adminScopeFilter(user._id);
    if (!scope) return null;
    return await Request.findOne({ _id: id, ...scope });
  }

  async list(filter = {}) {
    return await Request.find(filter)
      .populate('requesterUser', 'nome email')
      .populate('approverUser', 'nome email')
      .populate('fazenda', 'nome codigo')
      .sort({ createdAt: -1 });
  }

  async approve(id, approverUser, fazendaId = null) {
    const request = await Request.findById(id);
    if (!request) return null;

    // Se for cadastro de proprietário, criar usuário e fazenda antes de aprovar
    if (request.action === 'cadastrar_proprietario' && request.payload) {
      try {
        const { nome, email, senha, foto_perfil, fazenda: fazendaData } = request.payload;

        // Verificar se usuário já existe (pode ter sido criado enquanto aguardava aprovação)
        let user = await userService.getOne(email);
        
        // Criar fazenda primeiro (sempre criar, mesmo se usuário já existir)
        let fazendaDoc = null;
        if (fazendaData) {
          fazendaDoc = new Fazendas(fazendaData);
          await fazendaDoc.save();
          console.log('✅ [APPROVE PROPRIETARIO] Fazenda criada:', fazendaDoc._id);
        }
        
        if (!user) {
          // Criar usuário como ADMIN (proprietário)
          user = await userService.Create(nome, email, senha, foto_perfil, fazendaDoc ? fazendaDoc._id : undefined, 'admin');
          console.log('✅ [APPROVE PROPRIETARIO] Usuário criado:', user._id);
        } else {
          // Se usuário já existe, atualizar role para admin se necessário
          if (user.role !== 'admin') {
            await userService.updateRole(user._id, 'admin');
            console.log('✅ [APPROVE PROPRIETARIO] Role atualizado para admin');
          }
        }

        // Criar relacionamento usuário-fazenda (sempre criar se não existir)
        if (fazendaDoc && user) {
          const relExists = await UsuariosxFazendas.findOne({ 
            usuario: user._id, 
            fazenda: fazendaDoc._id 
          });
          
          if (!relExists) {
            await UsuariosxFazendas.create({ usuario: user._id, fazenda: fazendaDoc._id, ativo: true });
            console.log('✅ [APPROVE PROPRIETARIO] Relação usuário-fazenda criada');
          } else {
            console.log('⚠️ [APPROVE PROPRIETARIO] Relação já existe');
          }
        }

        // Atualizar requesterUser na solicitação
        request.requesterUser = user._id;
      } catch (error) {
        console.error('❌ [APPROVE PROPRIETARIO] Erro ao criar usuário/fazenda na aprovação:', error);
        throw error;
      }
    }

    // Se for associação de funcionário, apenas criar o relacionamento com a fazenda
    if (request.action === 'associar_funcionario' && request.payload) {
      try {
        if (!fazendaId) {
          throw new Error('Fazenda é obrigatória para aprovar associação de funcionário');
        }

        const { emailFuncionario } = request.payload;

        // Verificar se fazenda existe
        const fazendaDoc = await Fazendas.findById(fazendaId);
        if (!fazendaDoc) {
          throw new Error('Fazenda não encontrada');
        }

        // Buscar usuário pelo email (pedido feito por admin) ou o próprio solicitante
        // (funcionário sem fazenda pedindo vínculo ao master)
        const user = emailFuncionario
          ? await userService.getOne(emailFuncionario)
          : (request.requesterUser ? await userService.getById(request.requesterUser) : null);
        if (!user) {
          throw new Error(`Funcionário com email '${emailFuncionario || 'do solicitante'}' não encontrado. O funcionário deve se cadastrar primeiro.`);
        }

        // Verificar se o usuário é membro (funcionário)
        if (user.role !== 'membro') {
          throw new Error('Apenas funcionários podem ser associados a fazendas dessa forma');
        }

        // Criar relacionamento usuário-fazenda se não existir
        const relExists = await UsuariosxFazendas.findOne({ usuario: user._id, fazenda: fazendaId });
        if (!relExists) {
          await UsuariosxFazendas.create({ usuario: user._id, fazenda: fazendaId, ativo: true });
          console.log(`✅ Funcionário ${user.email} associado à fazenda ${fazendaId}`);
        } else {
          console.log(`⚠️ Funcionário ${user.email} já está associado à fazenda ${fazendaId}`);
        }

        // Atualizar requesterUser na solicitação
        request.requesterUser = user._id;
      } catch (error) {
        console.error('Erro ao associar funcionário à fazenda:', error);
        throw error;
      }
    }

    // Se for cadastro de funcionário (legado - manter compatibilidade)
    if (request.action === 'cadastrar_funcionario' && request.payload) {
      try {
        if (!fazendaId) {
          throw new Error('Fazenda é obrigatória para aprovar cadastro de funcionário');
        }

        const { nome, email, senha, foto_perfil } = request.payload;

        // Verificar se usuário já existe
        let user = await userService.getOne(email);
        
        if (!user) {
          // Verificar se fazenda existe
          const fazendaDoc = await Fazendas.findById(fazendaId);
          if (!fazendaDoc) {
            throw new Error('Fazenda não encontrada');
          }

          // Criar usuário como MEMBRO (funcionário)
          user = await userService.Create(nome, email, senha, foto_perfil, fazendaId, 'membro');

          // Criar relacionamento usuário-fazenda
          await UsuariosxFazendas.create({ usuario: user._id, fazenda: fazendaId, ativo: true });

          // Atualizar requesterUser na solicitação
          request.requesterUser = user._id;
        } else {
          // Se usuário já existe, apenas criar o relacionamento se não existir
          const relExists = await UsuariosxFazendas.findOne({ usuario: user._id, fazenda: fazendaId });
          if (!relExists) {
            await UsuariosxFazendas.create({ usuario: user._id, fazenda: fazendaId, ativo: true });
          }
        }
      } catch (error) {
        console.error('Erro ao criar usuário/fazenda na aprovação de funcionário:', error);
        throw error;
      }
    }

    // Vincular sensores quando solicitação de vínculo é aprovada
    if (request.action === 'editar_cativeiro_add_sensor' && request.payload?.cativeiroId) {
      try {
        const payload = request.toObject ? request.toObject().payload : request.payload;
        const cativeiroId = payload.cativeiroId;
        const tipos = Array.isArray(payload.tipos) ? payload.tipos : Object.values(payload.tipos || {});

        const normalize = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

        const existingLinks = await SensoresxCativeiros.find({ id_cativeiro: cativeiroId });
        const linkedSensorIds = new Set(existingLinks.map(l => String(l.id_sensor)));

        // Só sensores de usuários da fazenda do cativeiro (nunca de outras fazendas)
        const fazendasDoCativeiro = await FazendasxCativeiros.find({ cativeiro: cativeiroId }).distinct('fazenda');
        const donosPermitidos = await UsuariosxFazendas.find({ fazenda: { $in: fazendasDoCativeiro } }).distinct('usuario');
        const allSensors = await Sensores.find({ user: { $in: donosPermitidos } }).populate('id_tipo_sensor');

        for (const tipoStr of tipos) {
          const tipoNorm = normalize(tipoStr);
          const available = allSensors.find(s => {
            if (linkedSensorIds.has(String(s._id))) return false;
            const desc = s.id_tipo_sensor?.descricao || (typeof s.id_tipo_sensor === 'string' ? s.id_tipo_sensor : '');
            return normalize(desc) === tipoNorm;
          });
          if (!available) {
            console.warn(`⚠️ [APPROVE ADD_SENSOR] Nenhum sensor disponível do tipo: ${tipoStr}`);
            continue;
          }
          await SensoresxCativeiros.create({ id_sensor: available._id, id_cativeiro: cativeiroId });
          linkedSensorIds.add(String(available._id));
          console.log(`✅ [APPROVE ADD_SENSOR] Sensor ${available._id} (${tipoStr}) vinculado ao cativeiro ${cativeiroId}`);
        }
      } catch (error) {
        console.error('❌ [APPROVE ADD_SENSOR] Erro ao vincular sensores:', error);
        throw error;
      }
    }

    // Aplicar edição de cativeiro quando aprovada
    if (request.action === 'editar_cativeiro' && request.payload?.cativeiroId) {
      try {
        const { cativeiroId, nome, id_tipo_camarao, data_instalacao, temp_media_diaria, ph_medio_diario, amonia_media_diaria } = request.payload;
        const catUpdate = {};
        if (typeof nome !== 'undefined') catUpdate.nome = nome;
        if (typeof data_instalacao !== 'undefined') catUpdate.data_instalacao = data_instalacao;

        if (id_tipo_camarao) {
          const toNum = (v, pad) => { const n = parseFloat(v); return isNaN(n) ? pad : n; };
          const condicao = await CondicoesIdeais.create({
            id_tipo_camarao,
            temp_ideal: toNum(temp_media_diaria, 26),
            ph_ideal: toNum(ph_medio_diario, 7.5),
            amonia_ideal: toNum(amonia_media_diaria, 0.05),
          });
          catUpdate.id_tipo_camarao = id_tipo_camarao;
          catUpdate.condicoes_ideais = condicao._id;
        } else if (typeof temp_media_diaria !== 'undefined' || typeof ph_medio_diario !== 'undefined' || typeof amonia_media_diaria !== 'undefined') {
          const cat = await Cativeiros.findById(cativeiroId);
          if (cat?.condicoes_ideais) {
            const ciUpdate = {};
            if (typeof temp_media_diaria !== 'undefined') ciUpdate.temp_ideal = parseFloat(temp_media_diaria);
            if (typeof ph_medio_diario !== 'undefined') ciUpdate.ph_ideal = parseFloat(ph_medio_diario);
            if (typeof amonia_media_diaria !== 'undefined') ciUpdate.amonia_ideal = parseFloat(amonia_media_diaria);
            await CondicoesIdeais.findByIdAndUpdate(cat.condicoes_ideais, ciUpdate);
          }
        }

        if (Object.keys(catUpdate).length > 0) {
          await Cativeiros.findByIdAndUpdate(cativeiroId, catUpdate);
        }
      } catch (error) {
        console.error('❌ [APPROVE EDITAR_CATIVEIRO] Erro ao aplicar edição:', error);
        throw error;
      }
    }

    // Aplicar dieta quando aprovada
    if (request.action === 'editar_dieta' && request.payload?.cativeiroId) {
      try {
        const { cativeiroId, dietaId, descricao, quantidade, quantidadeRefeicoes, horarios } = request.payload;
        const horariosValidos = Array.isArray(horarios) ? horarios.filter(h => h) : [];
        const dietaData = {
          descricao: descricao || '',
          quantidade: Number(quantidade),
          horarios: horariosValidos,
          quantidadeRefeicoes: Number(quantidadeRefeicoes) || horariosValidos.length || 1,
          horaAlimentacao: horariosValidos[0] || '',
        };
        if (dietaId) {
          await Dietas.findByIdAndUpdate(dietaId, dietaData);
        } else {
          const novaDieta = await Dietas.create(dietaData);
          await DietasxCativeiros.updateMany({ cativeiro: cativeiroId, ativo: true }, { $set: { ativo: false } });
          await DietasxCativeiros.create({ cativeiro: cativeiroId, dieta: novaDieta._id, ativo: true });
        }
      } catch (error) {
        console.error('❌ [APPROVE EDITAR_DIETA] Erro ao aplicar dieta:', error);
        throw error;
      }
    }

    // Aprovar solicitação
    return await Request.findByIdAndUpdate(id, { status: 'aprovado', approverUser, requesterUser: request.requesterUser }, { new: true });
  }

  async reject(id, approverUser) {
    return await Request.findByIdAndUpdate(id, { status: 'recusado', approverUser }, { new: true });
  }

  async deleteByIdForRequester(id, requesterUserId) {
    const found = await Request.findOne({ _id: id, requesterUser: requesterUserId });
    if (!found) return null;
    await Request.deleteOne({ _id: id });
    return { success: true };
  }
}

export default new RequestService();

