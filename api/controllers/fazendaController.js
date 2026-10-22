import fazendaService from "../services/fazendaService.js";
import UsuariosxFazendas from "../models/UsuariosxFazendas.js";
import mongoose from "mongoose";
import userService from "../services/userService.js";
import accessService from "../services/accessService.js";

// Função para cadastrar fazenda (padrão Express)
const createFazenda = async (req, res) => {
  try {
    console.log("🔍 [FAZENDA] Body recebido:", req.body);
    console.log("🔍 [FAZENDA] Usuário logado:", req.loggedUser);
    
    const usuarioId = req.loggedUser?.id;
    if (!usuarioId) {
      console.log("❌ [FAZENDA] Usuário não autenticado");
      return res.status(401).json({ error: "Usuário não autenticado" });
    }
    
    console.log("📝 [FAZENDA] Criando fazenda...");
    const result = await fazendaService.Create(
      req.body.nome,
      req.body.rua,
      req.body.bairro,
      req.body.cidade,
      req.body.numero
    );
    
    if (!result) {
      console.log("❌ [FAZENDA] Falha ao salvar fazenda no banco");
      return res.status(500).json({ error: "Falha ao salvar no banco." });
    }
    
    console.log("✅ [FAZENDA] Fazenda criada:", result._id);

    // Cria o relacionamento do master com a fazenda
    console.log("🔗 [FAZENDA] Criando relacionamento master-fazenda...");
    await UsuariosxFazendas.create({ usuario: usuarioId, fazenda: result._id, ativo: true });
    console.log("✅ [FAZENDA] Relacionamento master criado");

    // Se um adminId foi informado, cria também o vínculo com o admin
    const { adminId } = req.body;
    if (adminId) {
      const admin = await userService.getById(adminId);
      if (admin && admin.role === 'admin') {
        const relExists = await UsuariosxFazendas.findOne({ usuario: adminId, fazenda: result._id });
        if (!relExists) {
          await UsuariosxFazendas.create({ usuario: adminId, fazenda: result._id, ativo: true });
          console.log("✅ [FAZENDA] Relacionamento admin criado:", adminId);
        }
      } else {
        console.log("⚠️ [FAZENDA] adminId inválido ou usuário não é admin:", adminId);
      }
    }

    res.status(201).json({ message: "Fazenda criada com sucesso!" });
  } catch (error) {
    console.error("❌ [FAZENDA] Erro no controller:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
};

// Endpoint público para listar todas as fazendas (para cadastro de funcionário)
const getAllFazendasPublic = async (req, res) => {
  try {
    const farms = await fazendaService.getAll();
    res.status(200).json(farms);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Erro ao buscar fazendas." });
  }
};

const getAllFazendas = async (req, res) => {
  try {
    const usuarioId = req.loggedUser?.id;
    const userRole = req.loggedUser?.role;
    
    console.log('🔍 [GET ALL FAZENDAS] UsuarioId:', usuarioId, 'Role:', userRole);
    
    // Se for master, retorna todas as fazendas enriquecidas com admins
    if (userRole === 'master') {
      const farms = await fazendaService.getAll();

      // Busca todos os vínculos ativos e popula dados do usuário
      const rels = await UsuariosxFazendas.find({ ativo: true })
        .populate({ path: 'usuario', select: 'nome email role' })
        .lean();

      // Agrupa admins por fazendaId
      const adminsByFazenda = {};
      for (const rel of rels) {
        if (rel.usuario?.role === 'admin') {
          const fzId = String(rel.fazenda);
          if (!adminsByFazenda[fzId]) adminsByFazenda[fzId] = [];
          adminsByFazenda[fzId].push({
            id: String(rel.usuario._id),
            nome: rel.usuario.nome,
            email: rel.usuario.email,
          });
        }
      }

      const enriched = farms.map(f => ({
        ...f.toObject(),
        admins: adminsByFazenda[String(f._id)] || [],
      }));

      console.log('✅ [GET ALL FAZENDAS] Master - retornando', enriched.length, 'fazendas');
      return res.status(200).json(enriched);
    }
    
    // Se não for master, retorna apenas as fazendas do usuário logado
    if (usuarioId) {
      // Buscar todas as relações do usuário (tentar com string e ObjectId)
      let rels = [];
      
      try {
        // Tentar buscar com ObjectId se for uma string válida
        // Filtrar apenas relacionamentos ATIVOS
        const filtroAtivo = {
          $or: [
            { ativo: true },
            { ativo: { $exists: false } } // Compatibilidade com registros antigos sem campo ativo
          ]
        };
        
        if (mongoose.Types.ObjectId.isValid(usuarioId)) {
          const userIdObj = new mongoose.Types.ObjectId(usuarioId);
          rels = await UsuariosxFazendas.find({ 
            usuario: userIdObj,
            ...filtroAtivo
          }).populate('fazenda').lean();
          console.log('🔍 [GET ALL FAZENDAS] Busca com ObjectId - encontradas', rels?.length || 0, 'relações');
          
          // Se não encontrou com ObjectId, tentar também como string (caso o banco tenha salvo como string)
          if (!rels || rels.length === 0) {
            rels = await UsuariosxFazendas.find({ 
              usuario: usuarioId,
              ...filtroAtivo
            }).populate('fazenda').lean();
            console.log('🔍 [GET ALL FAZENDAS] Busca com string (fallback) - encontradas', rels?.length || 0, 'relações');
          }
        } else {
          // Tentar buscar como string também
          rels = await UsuariosxFazendas.find({ 
            usuario: usuarioId,
            ...filtroAtivo
          }).populate('fazenda').lean();
          console.log('🔍 [GET ALL FAZENDAS] Busca com string - encontradas', rels?.length || 0, 'relações');
        }
      } catch (searchError) {
        console.error('❌ [GET ALL FAZENDAS] Erro na busca:', searchError);
        rels = [];
      }
      
      // Se não encontrou relações, verificar se o usuário tem fazenda no campo direto (legado)
      if (!rels || rels.length === 0) {
        try {
          const user = await userService.getById(usuarioId);
          
          if (user && user.fazenda) {
            console.log('⚠️ [GET ALL FAZENDAS] Usuário tem fazenda no campo direto (legado), criando relação...');
            
            // Buscar a fazenda
            const fazenda = await fazendaService.getById(user.fazenda);
            if (fazenda) {
              // Criar relação se não existir
              const relExists = await UsuariosxFazendas.findOne({ 
                usuario: mongoose.Types.ObjectId.isValid(usuarioId) ? new mongoose.Types.ObjectId(usuarioId) : usuarioId,
                fazenda: user.fazenda 
              });
              
              if (!relExists) {
                await UsuariosxFazendas.create({ 
                  usuario: mongoose.Types.ObjectId.isValid(usuarioId) ? new mongoose.Types.ObjectId(usuarioId) : usuarioId,
                  fazenda: user.fazenda,
                  ativo: true
                });
                console.log('✅ [GET ALL FAZENDAS] Relação criada automaticamente');
                
                // Buscar novamente após criar
                const userIdObj = mongoose.Types.ObjectId.isValid(usuarioId) ? new mongoose.Types.ObjectId(usuarioId) : usuarioId;
                rels = await UsuariosxFazendas.find({ usuario: userIdObj }).populate('fazenda').lean();
              } else {
                // Se já existe, buscar novamente
                const userIdObj = mongoose.Types.ObjectId.isValid(usuarioId) ? new mongoose.Types.ObjectId(usuarioId) : usuarioId;
                rels = await UsuariosxFazendas.find({ usuario: userIdObj }).populate('fazenda').lean();
              }
            }
          }
        } catch (legacyError) {
          console.error('❌ [GET ALL FAZENDAS] Erro ao verificar fazenda legado:', legacyError);
        }
      }
      
      // Se ainda não encontrou nada, tentar buscar todas as relações para debug
      if (!rels || rels.length === 0) {
        try {
          const allRels = await UsuariosxFazendas.find({}).populate('usuario').populate('fazenda').lean();
          console.log('⚠️ [GET ALL FAZENDAS] Nenhuma relação encontrada. Total de relações no banco:', allRels?.length || 0);
          if (allRels && allRels.length > 0) {
            console.log('⚠️ [GET ALL FAZENDAS] Relações existentes:', allRels.map(r => ({
              usuarioId: String(r.usuario?._id || r.usuario),
              usuarioEmail: r.usuario?.email,
              fazendaId: String(r.fazenda?._id || r.fazenda),
              fazendaNome: r.fazenda?.nome
            })));
            console.log('⚠️ [GET ALL FAZENDAS] UsuarioId buscado:', usuarioId, 'Tipo:', typeof usuarioId);
          }
        } catch (debugError) {
          console.error('❌ [GET ALL FAZENDAS] Erro no debug:', debugError);
        }
      }
      
      const fazendasDoUsuario = (rels || [])
        .map(rel => rel?.fazenda)
        .filter(f => f !== null && f !== undefined);
      
      console.log('✅ [GET ALL FAZENDAS] Retornando', fazendasDoUsuario.length, 'fazendas para o usuário');
      return res.status(200).json(fazendasDoUsuario);
    }
    
    // Se não houver usuário logado, retorna array vazio
    console.log('⚠️ [GET ALL FAZENDAS] Nenhum usuarioId encontrado');
    return res.status(200).json([]);
  } catch (error) {
    console.error('❌ [GET ALL FAZENDAS] Erro:', error);
    res.status(500).json({ error: "Erro ao buscar fazendas." });
  }
};

const getFazendaById = async (req, res) => {
  try {
    if (!(await accessService.podeAcessarFazenda(req.loggedUser, req.params.id))) {
      return res.status(404).json({ error: "Fazenda não encontrada" });
    }
    const fazenda = await fazendaService.getById(req.params.id);
    if (!fazenda) return res.status(404).json({ error: "Fazenda não encontrada" });
    res.json(fazenda);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Atualizar dados de uma fazenda — apenas master
const updateFazenda = async (req, res) => {
  try {
    const { id } = req.params;
    const fazenda = await fazendaService.getById(id);
    if (!fazenda) return res.status(404).json({ error: 'Fazenda não encontrada' });

    // Mantém valores atuais para campos não informados (atualização parcial)
    const nome   = req.body.nome   ?? fazenda.nome;
    const rua    = req.body.rua    ?? fazenda.rua;
    const bairro = req.body.bairro ?? fazenda.bairro;
    const cidade = req.body.cidade ?? fazenda.cidade;
    const numero = req.body.numero ?? fazenda.numero;

    await fazendaService.Update(id, nome, rua, bairro, cidade, numero);

    // Vincula um admin à fazenda se adminId foi informado e ainda não está vinculado
    const { adminId } = req.body;
    if (adminId) {
      const admin = await userService.getById(adminId);
      if (!admin || admin.role !== 'admin') {
        return res.status(400).json({ error: 'adminId inválido ou usuário não é admin.' });
      }
      const relExists = await UsuariosxFazendas.findOne({ usuario: adminId, fazenda: id });
      if (!relExists) {
        await UsuariosxFazendas.create({ usuario: adminId, fazenda: id, ativo: true });
        console.log('✅ [FAZENDA] Admin vinculado:', adminId);
      }
    }

    const updated = await fazendaService.getById(id);
    console.log('✅ [FAZENDA] Atualizada:', id);
    res.json({ message: 'Fazenda atualizada com sucesso!', fazenda: updated });
  } catch (error) {
    console.error('❌ [FAZENDA] Erro ao atualizar:', error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// Remover fazenda e seus vínculos — apenas master
const deleteFazenda = async (req, res) => {
  try {
    const { id } = req.params;
    const fazenda = await fazendaService.getById(id);
    if (!fazenda) return res.status(404).json({ error: 'Fazenda não encontrada' });

    // Remove todos os vínculos de usuários com esta fazenda antes de deletar
    await UsuariosxFazendas.deleteMany({ fazenda: id });
    await fazendaService.Delete(id);
    console.log('✅ [FAZENDA] Removida:', id);
    res.json({ message: 'Fazenda removida com sucesso!' });
  } catch (error) {
    console.error('❌ [FAZENDA] Erro ao remover:', error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

// Atualizar foto da fazenda
const updateFotoFazenda = async (req, res) => {
  try {
    const { id } = req.params;
    const { foto_sitio } = req.body;
    if (!(await accessService.podeAcessarFazenda(req.loggedUser, id))) {
      return res.status(404).json({ error: "Fazenda não encontrada" });
    }
    if (typeof foto_sitio !== 'string' || !/^data:image\/[a-z0-9.+-]+;base64,/i.test(foto_sitio)) {
      return res.status(400).json({ error: "Foto inválida." });
    }
    const fazenda = await fazendaService.updateFoto(id, foto_sitio);
    if (!fazenda) return res.status(404).json({ error: "Fazenda não encontrada" });
    res.json({ message: "Foto da fazenda atualizada com sucesso!", fazenda });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET foto da fazenda
const getFotoFazenda = async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await accessService.podeAcessarFazenda(req.loggedUser, id))) {
      return res.status(404).send("Sem foto");
    }
    const fazenda = await fazendaService.getById(id);
    if (!fazenda || !fazenda.foto_sitio) {
      return res.status(404).send("Sem foto");
    }
    res.json({ foto: fazenda.foto_sitio });
  } catch (err) {
    res.status(500).send("Erro ao buscar foto");
  }
};

export default { createFazenda, getAllFazendas, getAllFazendasPublic, getFazendaById, updateFazenda, deleteFazenda, updateFotoFazenda, getFotoFazenda }; 