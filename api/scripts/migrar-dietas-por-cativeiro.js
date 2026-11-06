// Migração única para "uma dieta por cativeiro".
//
//   node scripts/migrar-dietas-por-cativeiro.js             -> só mostra o que faria (não grava nada)
//   node scripts/migrar-dietas-por-cativeiro.js --aplicar   -> aplica
//
// Usa a MONGO_URL de api/.env (o mesmo banco da API). Rodar a partir da pasta api/.
// - Cada cativeiro que usa uma dieta compartilhada ganha uma cópia com os mesmos valores
//   (o alimentador continua servindo igual).
// - Dietas que não estão ativas em nenhum cativeiro são apagadas, com o histórico delas.
// Pode ser rodada de novo: na segunda vez não há nada a fazer.
import 'dotenv/config';
import mongoose from 'mongoose';
import Cativeiros from '../models/Cativeiros.js';
import { migrarDietasPorCativeiro } from '../services/dietaService.js';

const aplicar = process.argv.includes('--aplicar');
const mongoUrl = process.env.MONGO_URL;
if (!mongoUrl) {
  console.error('MONGO_URL não definida em api/.env.');
  process.exit(1);
}

await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 10000, bufferCommands: false });
try {
  console.log(`Banco: ${mongoose.connection.name} @ ${mongoose.connection.host}`);
  console.log(aplicar ? 'APLICANDO a migração...\n' : 'SIMULAÇÃO (nada será gravado). Use --aplicar para aplicar.\n');

  const r = await migrarDietasPorCativeiro({ aplicar });
  const ids = [...new Set([...r.copias, ...r.ligacoesDuplicadasDesativadas, ...r.ligacoesSemDieta].map(x => x.cativeiro))];
  const nomes = new Map((await Cativeiros.find({ _id: { $in: ids } }).select('nome').lean()).map(c => [String(c._id), c.nome]));
  const nome = (id) => `${nomes.get(String(id)) || 'cativeiro sem nome'} (${id})`;

  console.log(`Ligações de cativeiros que já foram excluídos (apagadas): ${r.ligacoesDeCativeiroExcluido.length}`);
  for (const l of r.ligacoesDeCativeiroExcluido) console.log(`  - cativeiro ${l.cativeiro}${l.ativa ? ' (ativa)' : ''}`);
  console.log(`\nCativeiros que ganham dieta própria (cópia da compartilhada): ${r.copias.length}`);
  for (const c of r.copias) console.log(`  - ${nome(c.cativeiro)}: cópia de "${c.descricao || 'sem descrição'}"`);
  console.log(`\nDietas que passam a ter dono (já eram de um só cativeiro): ${r.donosDefinidos}`);
  console.log(`\nLigações ativas duplicadas desativadas (fica a mais recente): ${r.ligacoesDuplicadasDesativadas.length}`);
  for (const l of r.ligacoesDuplicadasDesativadas) console.log(`  - ${nome(l.cativeiro)}`);
  console.log(`\nLigações ativas para dieta inexistente desativadas: ${r.ligacoesSemDieta.length}`);
  for (const l of r.ligacoesSemDieta) console.log(`  - ${nome(l.cativeiro)}`);
  console.log(`\nDietas soltas apagadas: ${r.dietasApagadas.length}`);
  for (const d of r.dietasApagadas) console.log(`  - "${d.descricao || 'sem descrição'}" (${d.quantidade ?? '?'} g)`);
  console.log(`Histórico antigo dessas dietas apagado: ${r.ligacoesAntigasApagadas} ligação(ões)`);
  console.log(aplicar ? '\nMigração aplicada.' : '\nNada foi gravado.');
} finally {
  await mongoose.disconnect();
}
