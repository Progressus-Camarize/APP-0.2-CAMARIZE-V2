import requestService from "../services/requestService.js";
import userService from "../services/userService.js";

// Criar solicitação
const create = async (req, res) => {
  try {
    const { type, action, payload, fazenda } = req.body;
    const requester = await userService.getById(req.loggedUser.id);
    if (!requester) return res.status(404).json({ error: 'Usuário não encontrado' });

    const requesterRole = requester.role || 'membro';
    console.log('Criando request:', {
      requesterEmail: requester.email,
      requesterRole,
      action,
      requesterId: requester._id
    });
    
    const heavyActions = new Set([
      'cadastrar_cativeiro',
      'excluir_cativeiro',
      'cadastrar_sensor',
      'excluir_sensor',
      'editar_cativeiro_add_sensor',
      'editar_cativeiro_remove_sensor',
    ]);

    // Bloquear funcionário de solicitar ações pesadas
    if (requesterRole === 'membro' && heavyActions.has(action)) {
      return res.status(403).json({ error: 'Funcionário não pode solicitar criação/remoção. Peça ao Admin.' });
    }
    let targetRole = null;
    let fazendaDaSolicitacao = fazenda;
    if (requesterRole === 'membro') {
      if (action === 'associar_funcionario') {
        // Pedido de vínculo vai ao master, que escolhe a fazenda na aprovação
        if (await requestService.hasPending(requester._id, action)) {
          return res.status(409).json({ error: 'Você já tem um pedido de vínculo aguardando aprovação.' });
        }
        targetRole = 'master';
        fazendaDaSolicitacao = null;
      } else {
        // Toda solicitação de funcionário fica presa a uma fazenda dele,
        // para só o admin dessa fazenda vê-la
        const { fazendaIds } = await requestService.getFazendaScope(requester._id);
        if (fazendaIds.length === 0) {
          return res.status(403).json({ error: 'Você ainda não está vinculado a nenhuma fazenda.' });
        }
        fazendaDaSolicitacao = await requestService.resolveMemberFazenda(requester._id, { fazenda, action, payload });
        targetRole = 'admin';
      }
    }
    if (requesterRole === 'admin') targetRole = 'master';
    if (requesterRole === 'master') targetRole = 'master';
    if (!targetRole) return res.status(400).json({ error: 'Role do solicitante inválida' });
    
    console.log('Target role definido:', { requesterRole, targetRole, action });

    const computedType = type || (requesterRole === 'membro' ? 'leve' : (heavyActions.has(action) ? 'pesada' : 'leve'));

    const created = await requestService.create({
      requesterUser: requester._id,
      requesterRole,
      targetRole,
      type: computedType,
      action,
      payload,
      fazenda: fazendaDaSolicitacao
    });
    res.status(201).json(created);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

// Listar solicitações do alvo
const listForTarget = async (req, res) => {
  try {
    const user = await userService.getById(req.loggedUser.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    let filter = { status: 'pendente', targetRole: user.role };
    if (user.role === 'admin') {
      const scope = await requestService.adminScopeFilter(user._id);
      if (!scope) return res.json([]);
      filter = { ...filter, ...scope };
    }
    const items = await requestService.list(filter);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Aprovar
const approve = async (req, res) => {
  try {
    const { id } = req.params;
    const { fazendaId } = req.body; // FazendaId opcional (obrigatório para cadastrar_funcionario)
    const user = await userService.getById(req.loggedUser.id);
    if (!user || !(await requestService.findDecidable(id, user))) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }
    const updated = await requestService.approve(id, req.loggedUser.id, fazendaId);
    if (!updated) return res.status(404).json({ error: 'Solicitação não encontrada' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Rejeitar
const reject = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await userService.getById(req.loggedUser.id);
    if (!user || !(await requestService.findDecidable(id, user))) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }
    const updated = await requestService.reject(id, req.loggedUser.id);
    if (!updated) return res.status(404).json({ error: 'Solicitação não encontrada' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Listar todas as solicitações (apenas para master)
const listAll = async (req, res) => {
  try {
    const user = await userService.getById(req.loggedUser.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    
    if (user.role !== 'master') {
      return res.status(403).json({ error: 'Acesso restrito ao Master' });
    }
    
    // Filtrar APENAS requests de admins para o master (não de membros)
    const items = await requestService.list({ 
      targetRole: { $in: ['admin', 'master'] },
      status: { $in: ['aprovado', 'recusado'] }
    }).then(requests => {
      // Filtrar para mostrar apenas requests de admins para o master
      return requests.filter(request => {
        // Mostrar apenas requests onde o solicitante é admin
        if (request.requesterRole === 'admin') {
          return true;
        }
        
        // Funcionário sem fazenda pedindo vínculo vai direto ao master
        if (request.requesterRole === 'membro' && request.targetRole === 'master') {
          return true;
        }

        // Ignorar requests de membros
        if (request.requesterRole === 'membro') {
          console.log('Request de membro ignorado na aba Requests do master:', {
            requesterRole: request.requesterRole,
            targetRole: request.targetRole,
            action: request.action
          });
          return false;
        }
        
        return true;
      });
    });
    console.log('Requests filtrados para master:', items);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Listar histórico de solicitações dos funcionários (membros) para admins
const listAllForAdmin = async (req, res) => {
  try {
    const user = await userService.getById(req.loggedUser.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    if (user.role !== 'admin' && user.role !== 'master') {
      return res.status(403).json({ error: 'Acesso restrito a Admin/Master' });
    }

    // Mostrar histórico aprovado/recusado de solicitações feitas por membros para admins.
    // Admin só vê as das próprias fazendas; master vê todas.
    let filter = {
      targetRole: 'admin',
      requesterRole: 'membro',
      status: { $in: ['aprovado', 'recusado'] }
    };
    if (user.role === 'admin') {
      const scope = await requestService.adminScopeFilter(user._id);
      if (!scope) return res.json([]);
      filter = { ...filter, ...scope };
    }
    const items = await requestService.list(filter);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Listar solicitações do usuário logado (histórico pessoal)
const listMine = async (req, res) => {
  try {
    const user = await userService.getById(req.loggedUser.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const items = await requestService.list({ requesterUser: user._id });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Excluir solicitação do próprio usuário
const removeMine = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.loggedUser.id;
    const result = await requestService.deleteByIdForRequester(id, userId);
    if (!result) return res.status(404).json({ error: 'Solicitação não encontrada' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default { create, listForTarget, listAll, listAllForAdmin, listMine, approve, reject, removeMine };

