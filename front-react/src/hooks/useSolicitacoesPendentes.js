import axios from 'axios';
import { criarContadorCompartilhado } from './contadorCompartilhado';

// Solicitações pendentes que o admin/master logado pode decidir. A API já filtra
// pela fazenda do admin (GET /requests). Os painéis também chamam `definir` ao
// recarregar a lista, para o número mudar na hora depois de aprovar/recusar.
export const useSolicitacoesPendentes = criarContadorCompartilhado(async () => {
  const token = sessionStorage.getItem('token') || localStorage.getItem('token');
  if (!token) return null;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
  const response = await axios.get(`${apiUrl}/requests`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data) ? response.data.length : null;
});
