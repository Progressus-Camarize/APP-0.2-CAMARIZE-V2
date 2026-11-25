import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  cativeiro: { type: mongoose.Schema.Types.ObjectId, ref: 'Cativeiros', required: true },
  tipo: { type: String, enum: ['temperatura', 'ph', 'amonia', 'sensor_inativo'], required: true },
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
  // Aviso de tendência projetada (avisoService.projectTrend) vs aviso reativo (limite já em curso).
  // Os dois podem coexistir para o mesmo cativeiro+tipo: a tendência avisa cedo, o reativo confirma depois.
  preditivo: { type: Boolean, default: false },
  // Aviso sobre um período sem conexão: leituras que a placa guardou e enviou depois em lote
  // (avisoService.processarPeriodoSemConexao). Usa as mesmas regras do aviso ao vivo, mas não fecha
  // com leituras novas: fica ativo até alguém verificar o cativeiro e avaliar o aviso.
  retroativo: { type: Boolean, default: false },
});

schema.index({ cativeiro: 1, criadoEm: -1 });
// Um aviso ativo por cativeiro + tipo + modo. O aviso retroativo convive com o ao vivo do mesmo tipo.
// Índice anterior, sem "retroativo": removido no boot (services/migracoes.js).
export const INDICE_AVISO_ATIVO_ANTIGO = 'cativeiro_1_tipo_1_preditivo_1';
schema.index({ cativeiro: 1, tipo: 1, preditivo: 1, retroativo: 1 }, { unique: true, partialFilterExpression: { estado: 'ativo' } });
schema.index({ pushStatus: 1, criadoEm: 1 });

export default mongoose.model('Aviso', schema);
