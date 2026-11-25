import Aviso, { INDICE_AVISO_ATIVO_ANTIGO } from '../models/Aviso.js';

// Ajustes no banco que o Mongoose não faz sozinho. Rodam no boot da API e podem rodar
// várias vezes sem efeito (cada passo confere se ainda é necessário).
export async function executarMigracoes() {
  await migrarAvisoRetroativo();
}

// O aviso retroativo (queda de conexão) entrou no índice único de avisos ativos. O Mongoose cria
// o índice novo, mas não apaga o antigo, que impediria o aviso ao vivo de abrir enquanto houver um
// retroativo ativo do mesmo tipo. Avisos de antes do campo existir passam a ter retroativo: false,
// para o índice novo os tratar igual aos avisos ao vivo criados daqui para frente.
export async function migrarAvisoRetroativo() {
  await Aviso.updateMany({ retroativo: { $exists: false } }, { $set: { retroativo: false } });
  try {
    await Aviso.collection.dropIndex(INDICE_AVISO_ATIVO_ANTIGO);
    console.log(`Migração: índice ${INDICE_AVISO_ATIVO_ANTIGO} removido de avisos`);
  } catch (error) {
    // 27: o índice não existe (já migrado ou banco novo); 26: a coleção ainda não existe
    if (error.code !== 27 && error.code !== 26) throw error;
  }
  await Aviso.createIndexes();
}
