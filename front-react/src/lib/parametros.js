import axios from 'axios';

export async function carregarHistorico(apiUrl, cativeiroId, dias, headers) {
  const dados = [];
  let pagina = 1;
  while (pagina) {
    const response = await axios.get(`${apiUrl}/parametros/historicos/${cativeiroId}`, {
      headers, params: { dias, pagina, limite: 500 },
    });
    dados.push(...(response.data.dados || []));
    pagina = response.data.proximaPagina;
  }
  return dados;
}
