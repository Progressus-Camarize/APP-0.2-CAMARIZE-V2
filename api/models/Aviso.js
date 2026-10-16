import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  cativeiro: { type: mongoose.Schema.Types.ObjectId, ref: 'Cativeiros', required: true },
  tipo: { type: String, enum: ['temperatura', 'ph', 'amonia'], required: true },
  estado: { type: String, enum: ['ativo', 'recuperado'], default: 'ativo' },
  mensagem: { type: String, required: true },
  experimental: { type: Boolean, default: false },
  periodoInicio: { type: Date, required: true },
  periodoFim: { type: Date, required: true },
  valorInicial: Number,
  valorAtual: Number,
  limite: Number,
  direcao: String,
  criadoEm: { type: Date, default: Date.now },
  recuperadoEm: Date,
  verificadoEm: Date,
  verificadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  avaliacao: { type: String, enum: ['confirmado', 'falso_alarme'] },
  pushStatus: { type: String, enum: ['pendente', 'processando', 'enviado', 'indisponivel'], default: 'pendente' },
  pushTentadoEm: Date,
});

schema.index({ cativeiro: 1, criadoEm: -1 });
schema.index({ cativeiro: 1, tipo: 1 }, { unique: true, partialFilterExpression: { estado: 'ativo' } });
schema.index({ pushStatus: 1, criadoEm: 1 });

export default mongoose.model('Aviso', schema);
