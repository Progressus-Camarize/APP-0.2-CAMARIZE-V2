import crypto from 'node:crypto';
import DeviceCredential from '../models/DeviceCredential.js';

export const credentialHash = key => crypto.createHash('sha256').update(key).digest('hex');

// Confere a chave do ESP32 (header X-Device-Key) contra a credencial do cativeiro.
// Retorna 'valida', 'invalida' (chave enviada não confere), 'ausente' (cativeiro tem
// credencial mas nenhuma chave foi enviada) ou 'sem-credencial' (cativeiro ainda sem chave).
export async function verificarChaveDispositivo(cativeiroId, suppliedKey) {
  const credential = await DeviceCredential.findOne({ cativeiro: cativeiroId }).lean();
  if (!suppliedKey) return credential ? 'ausente' : 'sem-credencial';
  if (!credential) return 'invalida';
  const confere = crypto.timingSafeEqual(
    Buffer.from(credentialHash(suppliedKey), 'hex'),
    Buffer.from(credential.keyHash, 'hex'),
  );
  return confere ? 'valida' : 'invalida';
}
