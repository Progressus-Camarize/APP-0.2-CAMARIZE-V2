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
  // sem_inscricao: ninguém com push ativo no momento (não é falha, não tenta de novo)
  // falhou: esgotou as tentativas de entrega após erro real de envio
  pushStatus: { type: String, enum: ['pendente', 'processando', 'enviado', 'sem_inscricao', 'falhou'], default: 'pendente' },
  pushTentativas: { type: Number, default: 0 },
  pushTentadoEm: Date,
  proximaTentativaEm: Date,
});

schema.index({ cativeiro: 1, criadoEm: -1 });
schema.index({ cativeiro: 1, tipo: 1 }, { unique: true, partialFilterExpression: { estado: 'ativo' } });
schema.index({ pushStatus: 1, criadoEm: 1 });

export default mongoose.model('Aviso', schema);
