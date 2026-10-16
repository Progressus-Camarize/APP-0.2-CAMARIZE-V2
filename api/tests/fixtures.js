import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/Users.js';
import Cativeiros from '../models/Cativeiros.js';
import TiposCamarao from '../models/Camaroes.js';
import CondicoesIdeais from '../models/Condicoes_ideais.js';
import Fazendas from '../models/Fazendas.js';
import FazendasxCativeiros from '../models/FazendasxCativeiros.js';
import UsuariosxFazendas from '../models/UsuariosxFazendas.js';

export const password = 'Teste-local-123!';

// Nunca lê MONGO_URL, .env ou uma URI do Atlas. Cada execução tem seu próprio banco.
export async function connectTestDatabase(label) {
  const uri = new URL(process.env.MONGO_TEST_URL || 'mongodb://127.0.0.1:27028');
  if (uri.protocol !== 'mongodb:' || !['127.0.0.1', 'localhost'].includes(uri.hostname)
      || uri.username || uri.password || uri.search || !['', '/'].includes(uri.pathname)) {
    throw new Error('MONGO_TEST_URL deve apontar para MongoDB local, sem banco, credenciais ou opções.');
  }
  const dbName = `camarize_test_${label}_${process.pid}`;
  await mongoose.connect(uri.href, { dbName, serverSelectionTimeoutMS: 5000, bufferCommands: false });
}

export async function dropTestDatabase() {
  if (!mongoose.connection.name?.startsWith('camarize_test_')) {
    throw new Error('Recusando limpeza de banco fora do prefixo de testes.');
  }
  try { await mongoose.connection.dropDatabase(); }
  finally { await mongoose.disconnect(); }
}

export async function seedFixtures() {
  const senha = await bcrypt.hash(password, 4);
  const users = await User.create([
    { nome: 'Membro CI A', email: 'membro-a@example.invalid', senha, role: 'membro' },
    { nome: 'Membro CI B', email: 'membro-b@example.invalid', senha, role: 'membro' },
    { nome: 'Master CI', email: 'master@example.invalid', senha, role: 'master' },
  ]);
  const tipo = await TiposCamarao.create({ nome: 'Espécie CI' });
  const condicao = await CondicoesIdeais.create({
    id_tipo_camarao: tipo._id, temp_ideal: 28, ph_ideal: 7, amonia_ideal: 0.2,
  });
  const fazendas = [];
  const cativeiros = [];
  for (const [index, user] of users.slice(0, 2).entries()) {
    const fazenda = await Fazendas.create({
      nome: `Fazenda CI ${index}`, rua: 'Rua CI', bairro: 'Bairro CI', cidade: 'Cidade CI', numero: 1,
    });
    const cativeiro = await Cativeiros.create({
      nome: `Viveiro CI ${index}`, id_tipo_camarao: tipo._id,
      data_instalacao: new Date(), condicoes_ideais: condicao._id,
    });
    await UsuariosxFazendas.create({ usuario: user._id, fazenda: fazenda._id, ativo: true });
    await FazendasxCativeiros.create({ fazenda: fazenda._id, cativeiro: cativeiro._id });
    fazendas.push(fazenda);
    cativeiros.push(cativeiro);
  }
  return { users, fazendas, cativeiros, condicao };
}
