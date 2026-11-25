import axios from 'axios';

// Resumo de um período para os relatórios: total de leituras, média/mín/máx de cada parâmetro e as
// médias por hora (período de 1 dia) ou por dia. Calculado na API: a placa envia uma leitura a cada 5 s, e baixar o
// período inteiro (GET /parametros/historicos, página a página) levava centenas de requisições no relatório mensal.
export async function carregarResumoRelatorio(apiUrl, cativeiroId, dias, headers) {
  const { data } = await axios.get(`${apiUrl}/parametros/relatorio/${cativeiroId}`, {
    headers, params: { dias },
  });
  return data;
}
