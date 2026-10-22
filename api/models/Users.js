import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  nome: { // <-- Adicione esta linha
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  senha: {
    type: String,
    required: true,
  },
  foto_perfil: {
    type: String,
    required: false,
  },
  fazenda: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Fazendas',
    required: false
  },
  role: {
    type: String,
    enum: ['membro', 'admin', 'master'],
    default: 'membro',
    required: true
  },
  tokenVersion: {
    type: Number,
    default: 0,
  },
  // Carimbo de quando o usuário conferiu os avisos pela última vez — serve
  // de base para o contador de "não vistos" independente de push.
  avisosVistoEm: {
    type: Date,
    default: null,
  }
});

// Hash da senha e versão do token nunca saem em respostas JSON
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.senha;
    delete ret.tokenVersion;
    return ret;
  },
});

const User = mongoose.model("User", userSchema);

export default User;
