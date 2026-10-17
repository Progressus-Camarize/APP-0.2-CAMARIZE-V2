import mongoose from 'mongoose';

// Registro de auditoria: quem gerou/revogou a chave de um dispositivo, e quando.
// Nunca guarda a chave em si — só o metadado. Append-only: nada aqui é editado ou apagado.
const schema = new mongoose.Schema({
  cativeiro: { type: mongoose.Schema.Types.ObjectId, ref: 'Cativeiros', required: true },
  geradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  geradoEm: { type: Date, default: Date.now },
});

schema.index({ cativeiro: 1, geradoEm: -1 });

export default mongoose.model('DeviceCredentialHistory', schema);
