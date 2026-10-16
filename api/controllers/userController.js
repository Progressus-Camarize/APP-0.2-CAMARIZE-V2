import userService from "../services/userService.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import Fazendas from "../models/Fazendas.js";
import UsuariosxFazendas from "../models/UsuariosxFazendas.js";

// JWTSecret — obrigatório no .env, sem fallback
const JWTSecret = process.env.JWT_SECRET;
if (!JWTSecret) {
  throw new Error("JWT_SECRET não definido no .env. A API não pode iniciar sem ele.");
}


// No userController.js
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await userService.getById(id);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    

    
    res.json(user);
  } catch (err) {
    console.error('Erro ao buscar usuário:', err);
    res.status(500).json({ error: err.message });
  }
};

// Buscar usuário atual (baseado no token)
const getCurrentUser = async (req, res) => {
  try {
    // O middleware de autenticação já adicionou req.loggedUser
    const userId = req.loggedUser.id;
    
    const user = await userService.getById(userId);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    
    // Remove a senha do objeto retornado por segurança
    const userWithoutPassword = user.toObject();
    delete userWithoutPassword.senha;
    
    res.json(userWithoutPassword);
  } catch (err) {
    console.error('Erro ao buscar usuário atual:', err);
    res.status(500).json({ error: err.message });
  }
};


// Cadastrando um usuário
const createUser = async (req, res) => {
  try {

    const { nome, email, senha, foto_perfil, fazenda, role } = req.body;
    await userService.Create(nome, email, senha, foto_perfil, fazenda, role);
    res.sendStatus(201); // Cod. 201 (CREATED)
  } catch (error) {
    console.log("Erro ao salvar usuário:", error); // Log do erro
    res.sendStatus(500); // Erro interno do servidor
  }
};

// Cadastro completo (usuário + fazenda)
const register = async (req, res) => {
  try {

    const { nome, email, senha, foto_perfil, fazenda } = req.body;
    
    // Verificar se o usuário já existe
    const existingUser = await userService.getOne(email);
    if (existingUser) {
      console.log("❌ [REGISTER] Usuário já existe:", email);
      return res.status(400).json({ 
        error: `Usuário com o email '${email}' já existe. Tente usar um email diferente ou faça login.` 
      });
    }
    
    let fazendaDoc = null;
    if (fazenda) {
      fazendaDoc = new Fazendas(fazenda);
      await fazendaDoc.save();
      console.log("✅ [REGISTER] Fazenda criada:", fazendaDoc._id);
    }
    
    console.log("📝 [REGISTER] Criando usuário...");
    const user = await userService.Create(nome, email, senha, foto_perfil, fazendaDoc ? fazendaDoc._id : undefined, 'membro');
    console.log("✅ [REGISTER] Usuário criado:", user._id);
    
    res.status(201).json(user);
  } catch (err) {
    console.error("❌ [REGISTER] Erro:", err);
    res.status(500).json({ error: err.message });
  }
};

// Removido o método registerUser, pois não será mais usado

// Autenticando um usuário
const loginUser = async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email) {
      return res.status(400).json({ error: "O e-mail enviado é inválido." });
    }

    const user = await userService.getOne(email);
    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    // Detecta se a senha armazenada é um hash bcrypt ou texto puro (banco legado)
    const isBcryptHash = /^\$2[aby]\$/.test(user.senha);
    let senhaCorreta = false;

    if (isBcryptHash) {
      senhaCorreta = await bcrypt.compare(senha, user.senha);
    } else {
      senhaCorreta = senha === user.senha;
      if (senhaCorreta) {
        // Migra a senha para bcrypt de forma transparente no primeiro login
        await userService.updateUser(user._id, { senha });
      }
    }

    if (!senhaCorreta) {
      return res.status(401).json({ error: "Credenciais inválidas" });
    }

    // Payload inclui role e tokenVersion para evitar queries extras no middleware
    const payload = {
      id: user._id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion ?? 0,
    };

    jwt.sign(payload, JWTSecret, { expiresIn: "48h" }, (error, token) => {
      if (error) {
        return res.status(400).json({ error: "Erro ao gerar o token." });
      }
      res.status(200).json({ token });
    });
  } catch (error) {
    console.error("Erro no login:", error);
    res.sendStatus(500);
  }
};

// Logout — invalida todos os tokens ativos incrementando tokenVersion
const logoutUser = async (req, res) => {
  try {
    await userService.incrementTokenVersion(req.loggedUser.id);
    res.status(200).json({ message: "Logout realizado com sucesso." });
  } catch (error) {
    console.error("Erro no logout:", error);
    res.status(500).json({ error: "Erro ao realizar logout." });
  }
};

// Atualizar dados do usuário (nome, email, senha) — apenas admin e master
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, email, senha } = req.body;

    const user = await userService.getById(id);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

    // Verificar duplicidade de email se foi alterado
    if (email && email !== user.email) {
      const existing = await userService.getOne(email);
      if (existing) {
        return res.status(400).json({ error: `O e-mail '${email}' já está em uso por outro usuário.` });
      }
    }

    const fields = {};
    if (nome) fields.nome = nome;
    if (email) fields.email = email;
    if (senha) fields.senha = senha;

    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ error: "Nenhum campo válido informado para atualização." });
    }

    const updated = await userService.updateUser(id, fields);
    const userObj = updated.toObject();
    delete userObj.senha;
    res.json({ message: "Usuário atualizado com sucesso!", user: userObj });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Deletar usuário — apenas admin e master
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await userService.getById(id);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

    await userService.deleteUser(id);
    res.json({ message: "Usuário removido com sucesso!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Atualizar foto do usuário
const updateUserPhoto = async (req, res) => {
  try {
    const { id } = req.params;
    const { foto_perfil } = req.body;
    
    const user = await userService.updatePhoto(id, foto_perfil);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    
    res.json({ message: "Foto do usuário atualizada com sucesso!", user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Listar usuários (opcional: por role) - apenas master
const listUsers = async (req, res) => {
  try {
    const { role } = req.query;
    const filter = role ? { role } : {};
    const users = await userService.listUsers(filter);
    res.json(users.map(u => ({
      id: u._id,
      nome: u.nome,
      email: u.email,
      role: u.role,
      fazenda: u.fazenda,
      foto_perfil: u.foto_perfil,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Lista somente masters (permitido para admin e master)
const listMasters = async (req, res) => {
  try {
    const users = await userService.listUsers({ role: 'master' });
    res.json(users.map(u => ({ id: u._id, nome: u.nome, email: u.email, role: u.role })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Atualizar role - apenas master
const changeUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    if (!['membro', 'admin', 'master'].includes(role)) {
      return res.status(400).json({ error: 'Role inválida' });
    }
    const updated = await userService.updateRole(id, role);
    if (!updated) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ id: updated._id, role: updated.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Cadastro de funcionário (cria usuário diretamente, sem fazenda associada)
const registerFuncionario = async (req, res) => {
  try {
    console.log("🔍 [REGISTER FUNCIONARIO] Dados recebidos:", req.body);
    const { nome, email, senha, foto_perfil } = req.body;
    
    // Verificar se o usuário já existe
    const existingUser = await userService.getOne(email);
    if (existingUser) {
      console.log("❌ [REGISTER FUNCIONARIO] Usuário já existe:", email);
      return res.status(400).json({ 
        error: `Usuário com o email '${email}' já existe. Tente usar um email diferente ou faça login.` 
      });
    }

    // Criar usuário como MEMBRO (funcionário) sem fazenda associada
    // O admin fará a solicitação de associação à fazenda depois
    const user = await userService.Create(nome, email, senha, foto_perfil, undefined, 'membro');
    console.log("✅ [REGISTER FUNCIONARIO] Usuário criado:", user._id);

    res.status(201).json({ 
      message: "Cadastro realizado com sucesso! Aguarde a associação à fazenda pelo administrador.",
      user
    });
  } catch (err) {
    console.error("❌ [REGISTER FUNCIONARIO] Erro:", err);
    res.status(500).json({ error: err.message });
  }
};

// Cadastro de proprietário (cria usuário e fazenda diretamente)
const registerProprietario = async (req, res) => {
  try {
    console.log("🔍 [REGISTER PROPRIETARIO] Dados recebidos:", req.body);
    const { nome, email, senha, foto_perfil, fazenda } = req.body;
    
    // Verificar se o usuário já existe
    const existingUser = await userService.getOne(email);
    if (existingUser) {
      console.log("❌ [REGISTER PROPRIETARIO] Usuário já existe:", email);
      return res.status(400).json({ 
        error: `Usuário com o email '${email}' já existe. Tente usar um email diferente ou faça login.` 
      });
    }

    // Validar dados da fazenda
    if (!fazenda || !fazenda.nome || !fazenda.rua || !fazenda.bairro || !fazenda.cidade || !fazenda.numero) {
      return res.status(400).json({ 
        error: "Dados da fazenda incompletos. Todos os campos são obrigatórios." 
      });
    }

    // Criar fazenda primeiro
    let fazendaDoc = null;
    if (fazenda) {
      fazendaDoc = new Fazendas(fazenda);
      await fazendaDoc.save();
      console.log("✅ [REGISTER PROPRIETARIO] Fazenda criada:", fazendaDoc._id);
    }
    
    // Criar usuário como ADMIN (proprietário)
    console.log("📝 [REGISTER PROPRIETARIO] Criando usuário...");
    const user = await userService.Create(nome, email, senha, foto_perfil, fazendaDoc ? fazendaDoc._id : undefined, 'admin');
    console.log("✅ [REGISTER PROPRIETARIO] Usuário criado:", user._id);

    // Criar relacionamento usuário-fazenda
    if (fazendaDoc && user) {
      const relExists = await UsuariosxFazendas.findOne({ 
        usuario: user._id, 
        fazenda: fazendaDoc._id 
      });
      
      if (!relExists) {
        await UsuariosxFazendas.create({ usuario: user._id, fazenda: fazendaDoc._id, ativo: true });
        console.log('✅ [REGISTER PROPRIETARIO] Relação usuário-fazenda criada');
      }
    }

    res.status(201).json({ 
      message: "Cadastro realizado com sucesso!",
      user
    });
  } catch (err) {
    console.error("❌ [REGISTER PROPRIETARIO] Erro:", err);
    res.status(500).json({ error: err.message });
  }
};

// Verificar se email já existe (sem criar usuário)
const checkEmailExists = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email é obrigatório' });
    }

    const user = await userService.getOne(email);
    res.json({ exists: !!user });
  } catch (err) {
    console.error('Erro ao verificar email:', err);
    res.status(500).json({ error: err.message });
  }
};

// Associar funcionário à fazenda do admin (chamado diretamente pelo admin, sem passar pelo master)
const associarFuncionario = async (req, res) => {
  try {
    const { email } = req.body;
    const adminId = req.loggedUser?.id;

    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email do funcionário é obrigatório' });
    }

    if (!adminId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Buscar o admin logado
    const admin = await userService.getById(adminId);
    if (!admin) {
      return res.status(404).json({ error: 'Admin não encontrado' });
    }

    // Verificar se é admin
    if (admin.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas admins podem associar funcionários' });
    }

    // Buscar a fazenda do admin
    const relAdminFazenda = await UsuariosxFazendas.findOne({ usuario: adminId }).populate('fazenda');
    if (!relAdminFazenda || !relAdminFazenda.fazenda) {
      return res.status(400).json({ error: 'Admin não possui fazenda associada. Entre em contato com o Master.' });
    }

    const fazendaId = relAdminFazenda.fazenda._id || relAdminFazenda.fazenda;

    // Buscar o funcionário pelo email
    const funcionario = await userService.getOne(email.trim());
    if (!funcionario) {
      return res.status(404).json({ 
        error: `Funcionário com email '${email}' não encontrado. O funcionário deve se cadastrar primeiro.` 
      });
    }

    // Verificar se é funcionário (membro)
    if (funcionario.role !== 'membro') {
      return res.status(400).json({ error: 'Apenas funcionários podem ser associados a fazendas dessa forma' });
    }

    // Verificar se já está associado
    const relExists = await UsuariosxFazendas.findOne({ 
      usuario: funcionario._id, 
      fazenda: fazendaId 
    });

    if (relExists) {
      // Se já existe mas está inativo, reativar
      if (relExists.ativo === false) {
        await UsuariosxFazendas.updateOne(
          { _id: relExists._id },
          { $set: { ativo: true } }
        );
        return res.status(200).json({ 
          message: `Funcionário '${funcionario.email}' foi reativado na sua fazenda.`,
          fazenda: {
            id: fazendaId,
            nome: relAdminFazenda.fazenda.nome || 'N/A'
          }
        });
      }
      return res.status(400).json({ 
        error: `Funcionário já está associado à fazenda '${relAdminFazenda.fazenda.nome || fazendaId}'` 
      });
    }

    // Criar relacionamento (ativo por padrão)
    await UsuariosxFazendas.create({ 
      usuario: funcionario._id, 
      fazenda: fazendaId,
      ativo: true
    });

    console.log(`✅ Admin ${admin.email} associou funcionário ${funcionario.email} à fazenda ${fazendaId}`);

    res.status(200).json({ 
      message: `Funcionário ${funcionario.nome} associado com sucesso à fazenda!`,
      funcionario: {
        id: funcionario._id,
        nome: funcionario.nome,
        email: funcionario.email
      },
      fazenda: {
        id: fazendaId,
        nome: relAdminFazenda.fazenda.nome || 'N/A'
      }
    });
  } catch (err) {
    console.error('❌ [ASSOCIAR FUNCIONARIO] Erro:', err);
    res.status(500).json({ error: err.message });
  }
};

// Listar funcionários associados à fazenda do admin
const getFuncionariosDaFazenda = async (req, res) => {
  try {
    const adminId = req.loggedUser?.id;
    
    console.log('🔍 [GET FUNCIONARIOS] AdminId:', adminId);
    
    if (!adminId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Buscar o admin logado
    const admin = await userService.getById(adminId);
    if (!admin) {
      console.log('❌ [GET FUNCIONARIOS] Admin não encontrado');
      return res.status(404).json({ error: 'Admin não encontrado' });
    }

    console.log('✅ [GET FUNCIONARIOS] Admin encontrado:', admin.email, 'Role:', admin.role);

    // Verificar se é admin
    if (admin.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas admins podem ver funcionários da fazenda' });
    }

    // Buscar a fazenda do admin
    const mongoose = (await import('mongoose')).default;
    
    // Tentar buscar com ObjectId e string
    let relAdminFazenda = null;
    if (mongoose.Types.ObjectId.isValid(adminId)) {
      const adminIdObj = new mongoose.Types.ObjectId(adminId);
      relAdminFazenda = await UsuariosxFazendas.findOne({ usuario: adminIdObj }).populate('fazenda').lean();
      console.log('🔍 [GET FUNCIONARIOS] Busca com ObjectId - relação encontrada:', !!relAdminFazenda);
      
      if (!relAdminFazenda) {
        relAdminFazenda = await UsuariosxFazendas.findOne({ usuario: adminId }).populate('fazenda').lean();
        console.log('🔍 [GET FUNCIONARIOS] Busca com string (fallback) - relação encontrada:', !!relAdminFazenda);
      }
    } else {
      relAdminFazenda = await UsuariosxFazendas.findOne({ usuario: adminId }).populate('fazenda').lean();
      console.log('🔍 [GET FUNCIONARIOS] Busca com string - relação encontrada:', !!relAdminFazenda);
    }
    
    if (!relAdminFazenda || !relAdminFazenda.fazenda) {
      console.log('⚠️ [GET FUNCIONARIOS] Admin não possui fazenda associada');
      return res.status(400).json({ error: 'Admin não possui fazenda associada.' });
    }

    const fazendaId = relAdminFazenda.fazenda._id || relAdminFazenda.fazenda;
    console.log('✅ [GET FUNCIONARIOS] Fazenda encontrada:', fazendaId, 'Nome:', relAdminFazenda.fazenda.nome);

    // Buscar todos os funcionários (membros) associados à fazenda
    // Tentar com ObjectId e string
    let rels = [];
    if (mongoose.Types.ObjectId.isValid(fazendaId)) {
      const fazendaIdObj = new mongoose.Types.ObjectId(fazendaId);
      rels = await UsuariosxFazendas.find({ fazenda: fazendaIdObj })
        .populate('usuario')
        .lean();
      console.log('🔍 [GET FUNCIONARIOS] Busca funcionários com ObjectId - encontradas', rels.length, 'relações');
      
      if (rels.length === 0) {
        rels = await UsuariosxFazendas.find({ fazenda: fazendaId })
          .populate('usuario')
          .lean();
        console.log('🔍 [GET FUNCIONARIOS] Busca funcionários com string (fallback) - encontradas', rels.length, 'relações');
      }
    } else {
      rels = await UsuariosxFazendas.find({ fazenda: fazendaId })
        .populate('usuario')
        .lean();
      console.log('🔍 [GET FUNCIONARIOS] Busca funcionários com string - encontradas', rels.length, 'relações');
    }

    // Filtrar apenas membros e formatar resposta
    const funcionarios = rels
      .filter(rel => {
        const hasUsuario = rel.usuario && (rel.usuario._id || rel.usuario);
        const isMembro = rel.usuario && rel.usuario.role === 'membro';
        return hasUsuario && isMembro;
      })
      .map(rel => ({
        id: String(rel.usuario._id || rel.usuario),
        nome: rel.usuario.nome,
        email: rel.usuario.email,
        foto_perfil: rel.usuario.foto_perfil,
        role: rel.usuario.role,
        ativo: rel.ativo !== undefined ? rel.ativo : true // Default true para compatibilidade
      }));

    console.log('✅ [GET FUNCIONARIOS] Retornando', funcionarios.length, 'funcionários');
    return res.status(200).json(funcionarios);
  } catch (error) {
    console.error('❌ [GET FUNCIONARIOS] Erro:', error);
    res.status(500).json({ error: 'Erro ao buscar funcionários da fazenda.' });
  }
};

// Atualizar status ativo/inativo do funcionário na fazenda
const atualizarStatusFuncionario = async (req, res) => {
  try {
    const { funcionarioId, ativo } = req.body;
    const adminId = req.loggedUser?.id;

    console.log('🔍 [ATUALIZAR STATUS FUNCIONARIO] FuncionarioId:', funcionarioId, 'Ativo:', ativo, 'AdminId:', adminId);

    if (!funcionarioId || ativo === undefined) {
      return res.status(400).json({ error: 'ID do funcionário e status (ativo) são obrigatórios' });
    }

    if (!adminId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Buscar o admin logado
    const admin = await userService.getById(adminId);
    if (!admin) {
      return res.status(404).json({ error: 'Admin não encontrado' });
    }

    // Verificar se é admin
    if (admin.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas admins podem atualizar status de funcionários' });
    }

    // Buscar a fazenda do admin
    const mongoose = (await import('mongoose')).default;
    
    let relAdminFazenda = null;
    if (mongoose.Types.ObjectId.isValid(adminId)) {
      const adminIdObj = new mongoose.Types.ObjectId(adminId);
      relAdminFazenda = await UsuariosxFazendas.findOne({ usuario: adminIdObj }).populate('fazenda').lean();
      
      if (!relAdminFazenda) {
        relAdminFazenda = await UsuariosxFazendas.findOne({ usuario: adminId }).populate('fazenda').lean();
      }
    } else {
      relAdminFazenda = await UsuariosxFazendas.findOne({ usuario: adminId }).populate('fazenda').lean();
    }
    
    if (!relAdminFazenda || !relAdminFazenda.fazenda) {
      return res.status(400).json({ error: 'Admin não possui fazenda associada.' });
    }

    const fazendaId = relAdminFazenda.fazenda._id || relAdminFazenda.fazenda;

    // Verificar se o funcionário está associado à fazenda do admin
    let relFuncionario = null;
    if (mongoose.Types.ObjectId.isValid(funcionarioId)) {
      const funcionarioIdObj = new mongoose.Types.ObjectId(funcionarioId);
      relFuncionario = await UsuariosxFazendas.findOne({ 
        usuario: funcionarioIdObj, 
        fazenda: fazendaId 
      }).lean();
      
      if (!relFuncionario) {
        relFuncionario = await UsuariosxFazendas.findOne({ 
          usuario: funcionarioId, 
          fazenda: fazendaId 
        }).lean();
      }
    } else {
      relFuncionario = await UsuariosxFazendas.findOne({ 
        usuario: funcionarioId, 
        fazenda: fazendaId 
      }).lean();
    }

    if (!relFuncionario) {
      return res.status(404).json({ error: 'Funcionário não está associado à sua fazenda.' });
    }

    // Verificar se não é o próprio admin tentando se desativar
    if (String(funcionarioId) === String(adminId) && !ativo) {
      return res.status(400).json({ error: 'Você não pode desativar a si mesmo da fazenda.' });
    }

    // Converter _id para ObjectId se necessário
    const relId = mongoose.Types.ObjectId.isValid(relFuncionario._id) 
      ? new mongoose.Types.ObjectId(relFuncionario._id) 
      : relFuncionario._id;
    
    // Atualizar o status ativo/inativo
    await UsuariosxFazendas.updateOne(
      { _id: relId },
      { $set: { ativo: ativo === true } }
    );
    
    console.log(`✅ [ATUALIZAR STATUS FUNCIONARIO] Funcionário ${ativo ? 'ativado' : 'desativado'} com sucesso`);

    // Verificar se a atualização foi bem-sucedida
    const relAtualizada = await UsuariosxFazendas.findById(relId).lean();

    return res.status(200).json({ 
      message: `Funcionário ${ativo ? 'ativado' : 'desativado'} com sucesso!`,
      ativo: relAtualizada?.ativo
    });
  } catch (error) {
    console.error('❌ [ATUALIZAR STATUS FUNCIONARIO] Erro:', error);
    res.status(500).json({ error: 'Erro ao atualizar status do funcionário.' });
  }
};

export default {
  createUser,
  loginUser,
  logoutUser,
  JWTSecret,
  register,
  registerFuncionario,
  registerProprietario,
  checkEmailExists,
  associarFuncionario,
  getUserById,
  updateUserPhoto,
  updateUser,
  deleteUser,
  getCurrentUser,
  listUsers,
  listMasters,
  changeUserRole,
  getFuncionariosDaFazenda,
  atualizarStatusFuncionario
};
