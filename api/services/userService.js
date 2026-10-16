import User from "../models/Users.js";
import EmailSettings from "../models/EmailSettings.js";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

class userService {
  
  // Método para cadastrar um usuário
  async Create(nome, email, senha, foto_perfil, fazenda, role = 'membro') {
    try {
      console.log("📝 [SERVICE] Criando usuário:", { nome, email, senha: "***", foto_perfil, fazenda });

      const hashedSenha = await bcrypt.hash(senha, SALT_ROUNDS);

      const newUser = new User({
        nome,
        email,
        senha: hashedSenha,
        foto_perfil,
        fazenda,
        role,
      });
      
      console.log("💾 [SERVICE] Salvando usuário no banco...");
      const savedUser = await newUser.save();
      console.log("✅ [SERVICE] Usuário salvo com sucesso:", savedUser._id);
      
      // Criar configurações de email automaticamente
      console.log("📧 [SERVICE] Criando configurações de email...");
      try {
        const emailSettings = new EmailSettings({
          userId: savedUser._id,
          emailAddress: email,
          emailEnabled: true,
          alertTypes: {
            temperatura: {
              enabled: true,
              severity: { baixa: false, media: true, alta: true }
            },
            ph: {
              enabled: true,
              severity: { baixa: false, media: true, alta: true }
            },
            amonia: {
              enabled: true,
              severity: { baixa: false, media: true, alta: true }
            }
          },
          quietHours: {
            enabled: false,
            startTime: '22:00',
            endTime: '07:00'
          },
          frequency: {
            maxEmailsPerHour: 5,
            maxEmailsPerDay: 20
          }
        });
        
        await emailSettings.save();
        console.log("✅ [SERVICE] Configurações de email criadas automaticamente");
      } catch (error) {
        console.log("⚠️ [SERVICE] Erro ao criar configurações de email:", error.message);
        // Não falha o cadastro se der erro nas configurações de email
      }
      
      return savedUser;
    } catch (error) {
      console.error("❌ [SERVICE] Erro ao criar usuário:", error);
      throw error;
    }
  }
  // Método para listar um usuário
  async getOne(email) {
    try {
      console.log("🔍 [SERVICE] Buscando usuário com email:", email);
      const user = await User.findOne({ email: email });
      console.log("🔍 [SERVICE] Resultado da busca:", user ? `Usuário encontrado (${user._id})` : "Usuário não encontrado");
      return user;
    } catch (error) {
      console.error("❌ [SERVICE] Erro ao buscar usuário:", error);
      throw error;
    }
  }
 




  async getById(id) {
    return await User.findById(id);
  }

  // Atualizar foto do usuário
  async updatePhoto(id, foto_perfil) {
    return User.findByIdAndUpdate(id, { foto_perfil }, { new: true });
  }

  // Listar usuários com filtro opcional por role
  async listUsers(filter = {}) {
    return await User.find(filter);
  }

  // Atualizar role do usuário
  async updateRole(id, role) {
    return await User.findByIdAndUpdate(id, { role }, { new: true });
  }

  // Atualizar dados do usuário (nome, email, senha)
  async updateUser(id, fields) {
    if (fields.senha) {
      fields.senha = await bcrypt.hash(fields.senha, SALT_ROUNDS);
    }
    return await User.findByIdAndUpdate(id, fields, { new: true });
  }

  // Deletar usuário
  async deleteUser(id) {
    return await User.findByIdAndDelete(id);
  }

  // Incrementa tokenVersion — invalida todos os tokens ativos do usuário
  async incrementTokenVersion(id) {
    return await User.findByIdAndUpdate(
      id,
      { $inc: { tokenVersion: 1 } },
      { new: true }
    );
  }
}

export default new userService();
