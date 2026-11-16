import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import Modal from '../../components/Modal';
import axios from 'axios';
import { useAuth } from '@/hooks/useAuth';

import { useUnreadAvisos } from '@/hooks/useUnreadAvisos';
import { useSolicitacoesPendentes } from '@/hooks/useSolicitacoesPendentes';
import styles from '../../styles/panel.module.css';
import Notification from '../../components/Notification';
import { rotuloAcao, DetalhesGenericos, DetalhesCalibracao, DetalhesSensor } from '../../lib/solicitacoes';
import ConfirmarCalibracao, { mensagemCalibracaoAplicada } from '../../components/ConfirmarCalibracao';
import { useAuthToken, fotoCativeiroUrl, comprimirFoto } from "@/lib/fotoCativeiro";
import Sidebar from '../../components/Sidebar';
import { MASTER_MENU, abasNavegaveis, abaInicialDaUrl } from '../../components/Sidebar/menus';
import { lerCachePainel, salvarCachePainel } from "@/lib/painelCache";
import AvisoLista from '../../components/AvisoCard';
import { SolicitacaoCard, SolicitacoesFiltros, SolicitacoesVazio, cardStyles } from '../../components/SolicitacaoCard';
import Calibracoes from '../../components/Calibracoes';
import DietasMaster from '../../components/DietasMaster';
import ChaveDispositivo from '../../components/ChaveDispositivo';

export default function MasterPanel() {
  const authToken = useAuthToken();
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const router = useRouter();
  // Dados da última visita ao painel (mesmo usuário): mostrados na hora ao voltar
  const [cacheInicial] = useState(() => lerCachePainel('master'));
  const [items, setItems] = useState(() => cacheInicial?.items ?? []);
  const [allRequests, setAllRequests] = useState([]);
  const [filteredRequests, setFilteredRequests] = useState([]);
  const [users, setUsers] = useState(() => cacheInicial?.users ?? []);
  const [fazendas, setFazendas] = useState(() => cacheInicial?.fazendas ?? []);
  const [cativeiros, setCativeiros] = useState(() => cacheInicial?.cativeiros ?? []);
  const [tiposCamarao, setTiposCamarao] = useState(() => cacheInicial?.tiposCamarao ?? []);
  const [loading, setLoading] = useState(!cacheInicial);
  const [, setDietaEditsByCat] = useState({});
  const [cativeiroDieta, setCativeiroDieta] = useState({}); // cId -> { dietaId, descricao, quantidade, horarios, quantidadeRefeicoes }
  const [showDeleteSensorModal, setShowDeleteSensorModal] = useState(false);
  const [deleteSensorData, setDeleteSensorData] = useState(null); // { id, apelido, tipo }
  const [masterNotification, setMasterNotification] = useState({ show: false, message: '', type: 'success' });
  const [confirmarCalib, setConfirmarCalib] = useState(null); // solicitação de calibração aguardando confirmação
  const [decidindo, setDecidindo] = useState(null); // id da solicitação sendo aprovada/recusada
  const [previewImage, setPreviewImage] = useState({});
  const [photoErrors, setPhotoErrors] = useState({});
  const [uploadTargetCativeiro, setUploadTargetCativeiro] = useState(null);
  const [error, setError] = useState('');
  const [requesterFilter, setRequesterFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [tab, setTab] = useState(() => abaInicialDaUrl(router, MASTER_MENU, 'requests'));
  // Abrir direto a aba de ?tab=... (as páginas compartilhadas voltam ao painel por aqui)
  useEffect(() => {
    const qTab = new URLSearchParams(window.location.search).get('tab');
    if (qTab && abasNavegaveis(MASTER_MENU).includes(qTab)) setTab(qTab);
  }, []);
  const [chatConversations, setChatConversations] = useState([]);
  const [chatSelectedId, setChatSelectedId] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatText, setChatText] = useState('');
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const [, setShowChatMenu] = useState(false);
  const [showDeleteConvModal, setShowDeleteConvModal] = useState(false);
  const getMyId = () => {
    const fromUser = user?.id || user?._id;
    const stored = (typeof window !== 'undefined') ? (JSON.parse(sessionStorage.getItem('usuarioCamarize') || localStorage.getItem('usuarioCamarize') || '{}')) : {};
    const fromStorage = stored?.id || stored?._id;
    return String(fromUser || fromStorage || '');
  };

  const getDisplayName = (senderId) => {
    const me = getMyId();
    if (String(senderId) === String(me)) return 'You (Master)';
    const u = (users || []).find(x => String(x.id || x._id) === String(senderId));
    // Se não achou no users (pois users contém admins), rotula como Admin por padrão
    return u?.nome || u?.email || 'Admin';
  };

  const getConversationTitle = (conv) => {
    const me = getMyId();
    const otherId = (Array.isArray(conv?.participants) ? conv.participants : []).find(p => String(p) !== String(me));
    const u = (users || []).find(x => String(x.id || x._id) === String(otherId));
    return u?.nome || u?.email || 'Admin';
  };
  const [sensores, setSensores] = useState(() => cacheInicial?.sensores ?? []);
  const [showCreateSensor, setShowCreateSensor] = useState(false);
  // Mantém a memória do painel igual ao que está na tela (inclusive após aprovar/editar)
  useEffect(() => {
    if (!loading) salvarCachePainel('master', { items, users, fazendas, cativeiros, tiposCamarao, sensores });
  }, [loading, items, users, fazendas, cativeiros, tiposCamarao, sensores]);
  const [sensorForm, setSensorForm] = useState({ id_tipo_sensor: 'temperatura', apelido: '', fotoFile: null });
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkForm, setLinkForm] = useState({ sensorId: '', cativeiroId: '', currentSensorIds: [] });
  const [expandedFazenda, setExpandedFazenda] = useState({}); // id -> bool
  const [expandedCativeiro, setExpandedCativeiro] = useState({}); // id -> bool
  const [cativeirosByFazenda] = useState({}); // fazendaId -> [cativeiros]
  const [loadingFazenda] = useState({}); // fazendaId -> bool

  // Confirmação de mudança de role
  const [pendingRoleChange, setPendingRoleChange] = useState(null); // { userId, userName, currentRole, newRole }

  // Modal de criação de fazenda
  const [showCreateFazendaModal, setShowCreateFazendaModal] = useState(false);
  const [newFazendaForm, setNewFazendaForm] = useState({ nome: '', rua: '', bairro: '', cidade: '', numero: '', adminId: '' });

  // Modal de edição de fazenda
  const [showEditFazendaModal, setShowEditFazendaModal] = useState(false);
  const [editFazendaForm, setEditFazendaForm] = useState({ id: '', nome: '', rua: '', bairro: '', cidade: '', numero: '', adminId: '' });

  // Modal de criação de cativeiro
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showApproveFuncionarioModal, setShowApproveFuncionarioModal] = useState(false);
  const [pendingApproveRequestId, setPendingApproveRequestId] = useState(null);
  const [selectedFazendaId, setSelectedFazendaId] = useState('');
  const [createForm, setCreateForm] = useState({
    fazendaId: '',
    nome: '',
    id_tipo_camarao: '',
    data_instalacao: '',
    temp_media_diaria: '',
    ph_medio_diario: '',
    amonia_media_diaria: '',
    fotoFile: null,
  });

  // Modal de edição de cativeiro
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    id: '',
    fazendaId: '',
    nome: '',
    id_tipo_camarao: '',
    data_instalacao: '',
    temp_media_diaria: '',
    ph_medio_diario: '',
    amonia_media_diaria: '',
    fotoFile: null
  });

  const [showLimitesModal, setShowLimitesModal] = useState(false);
  const [limitesForm, setLimitesForm] = useState({ id: '', nome: '', minimo: '', maximo: '', phLimiar: '', amoniaLimiarPct: '' });
  const [limitesSubmitting, setLimitesSubmitting] = useState(false);
  // Camada 2 da mineração de dados: sugestão de limiares com base no histórico de
  // avaliações (confirmado/falso_alarme) — nunca aplica sozinha, só sugere.
  const [limitesSugestoes, setLimitesSugestoes] = useState(null);

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const abrirModalLimites = async (c) => {
    setLimitesForm({
      id: c._id,
      nome: c.nome || '',
      minimo: c.condicoes_ideais?.temp_min ?? '',
      maximo: c.condicoes_ideais?.temp_max ?? '',
      phLimiar: c.condicoes_ideais?.ph_limiar ?? '',
      amoniaLimiarPct: c.condicoes_ideais?.amonia_limiar_pct ?? '',
    });
    setLimitesSugestoes(null);
    setShowLimitesModal(true);
    try {
      const token = getToken();
      const res = await axios.get(`${apiUrl}/parametros/sugestao-limiares/${c._id}`, { headers: { Authorization: `Bearer ${token}` } });
      setLimitesSugestoes(res.data?.sugestoes || null);
    } catch (e) {
      console.error('Erro ao buscar sugestão de limiares:', e);
    }
  };

  const aplicarSugestaoTemperatura = () => {
    const sugestao = limitesSugestoes?.temperatura;
    if (!sugestao) return;
    setLimitesForm(form => ({ ...form, minimo: sugestao.valorSugerido.minimo, maximo: sugestao.valorSugerido.maximo }));
  };

  const aplicarSugestaoSensibilidade = (tipo) => {
    const sugestao = limitesSugestoes?.[tipo];
    if (!sugestao) return;
    setLimitesForm(form => tipo === 'ph'
      ? { ...form, phLimiar: sugestao.valorSugerido }
      : { ...form, amoniaLimiarPct: sugestao.valorSugerido });
  };

  const salvarLimitesAvisos = async () => {
    setLimitesSubmitting(true);
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const tarefas = [];
      const { id, minimo, maximo, phLimiar, amoniaLimiarPct } = limitesForm;
      if (minimo !== '' && maximo !== '') {
        tarefas.push(axios.patch(`${apiUrl}/parametros/limites-temperatura/${id}`,
          { minimo: Number(minimo), maximo: Number(maximo) }, { headers }));
      }
      if (phLimiar !== '' && amoniaLimiarPct !== '') {
        tarefas.push(axios.patch(`${apiUrl}/parametros/limites-sensibilidade/${id}`,
          { phLimiar: Number(phLimiar), amoniaLimiarPct: Number(amoniaLimiarPct) }, { headers }));
      }
      if (tarefas.length === 0) {
        setShowLimitesModal(false);
        return;
      }
      await Promise.all(tarefas);
      setShowLimitesModal(false);
      await load();
    } catch (e) {
      console.error('Falha ao salvar limites de avisos:', e);
      alert('Error saving limits: ' + (e?.response?.data?.error || e.message));
    } finally {
      setLimitesSubmitting(false);
    }
  };

  // Cativeiro com o modal da chave do dispositivo aberto (gerar chave + histórico)
  const [chaveCativeiro, setChaveCativeiro] = useState(null);
  const abrirHistoricoChave = (c) => setChaveCativeiro(c);

  const confirmLogout = async () => {
    setIsLoggingOut(true);
    try {
      const token = sessionStorage.getItem('token') || localStorage.getItem('token');
      if (token) {
        await fetch('/api/users/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // prossegue com logout local mesmo se a requisição falhar
    } finally {
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('usuarioCamarize');
      localStorage.removeItem('token');
      localStorage.removeItem('usuarioCamarize');
      window.location.href = '/login';
    }
  };

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const getToken = () => (typeof window !== 'undefined' ? (sessionStorage.getItem('token') || localStorage.getItem('token')) : null);

  // Função para extrair o tipo de sensor corretamente
  const getSensorType = (sensor) => {
    if (!sensor) return 'sensor';
    
    // Se id_tipo_sensor é um objeto populado com descricao
    if (sensor.id_tipo_sensor) {
      if (typeof sensor.id_tipo_sensor === 'object' && sensor.id_tipo_sensor !== null) {
        if (sensor.id_tipo_sensor.descricao) {
          return sensor.id_tipo_sensor.descricao;
        }
      }
      // Se for string (descricao direta)
      else if (typeof sensor.id_tipo_sensor === 'string') {
        return sensor.id_tipo_sensor;
      }
    }
    
    // Heurística pelo apelido
    if (sensor.apelido) {
      const apelidoLower = String(sensor.apelido).toLowerCase();
      if (apelidoLower.includes('temp')) return 'temperatura';
      if (apelidoLower.includes('ph')) return 'pH';
      if (apelidoLower.includes('amonia') || apelidoLower.includes('nh3')) return 'amônia';
    }
    
    // Fallback: buscar no array de sensores se tiver _id
    if (sensor._id && sensores) {
      const full = sensores.find(x => String(x._id) === String(sensor._id));
      if (full && full.id_tipo_sensor) {
        if (typeof full.id_tipo_sensor === 'object' && full.id_tipo_sensor?.descricao) {
          return full.id_tipo_sensor.descricao;
        }
        if (typeof full.id_tipo_sensor === 'string') {
          return full.id_tipo_sensor;
        }
      }
    }
    
    return 'sensor';
  };

  const load = async () => {
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [reqs, us, fzs, cats, tipos, sens] = await Promise.all([
        axios.get(`${apiUrl}/requests`, { headers }), // Requests pendentes para aprovar/recusar
        axios.get(`${apiUrl}/users`, { headers }),
        axios.get(`${apiUrl}/fazendas`, { headers }),
        axios.get(`${apiUrl}/cativeiros`, { headers }),
        axios.get(`${apiUrl}/camaroes`, { headers }),
        axios.get(`${apiUrl}/sensores`, { headers }),
      ]);
      setItems(reqs.data);
      setUsers(us.data);
      setFazendas(fzs.data);
      setCativeiros(prev => {
        const prevSensores = {};
        prev.forEach(c => { if (Array.isArray(c.sensores)) prevSensores[String(c._id)] = c.sensores; });
        return cats.data.map(c => ({ ...c, ...(prevSensores[String(c._id)] !== undefined ? { sensores: prevSensores[String(c._id)] } : {}) }));
      });
      setTiposCamarao(tipos.data);
      setSensores(sens.data);
    } catch (e) {
      setError('Error loading data');
    } finally {
      setLoading(false);
    }
  };

  const loadAllRequests = async () => {
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.get(`${apiUrl}/requests/all`, { headers });
      console.log('Requests carregados do backend:', response.data);
      return response.data;
    } catch (e) {
      console.error('Erro ao carregar todos os requests:', e);
      return [];
    }
  };

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      load();
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { router.replace('/login'); return; }
    const role = user?.role || (typeof window !== 'undefined' ? (JSON.parse(sessionStorage.getItem('usuarioCamarize') || localStorage.getItem('usuarioCamarize') || '{}')?.role) : null);
    if (!role) return;
    if (role === 'admin') { router.replace('/admin'); return; }
    if (role !== 'master') { router.replace('/login'); }
  }, [authLoading, isAuthenticated, user]);

  // Chat polling
  useEffect(() => {
    let timer;
    async function tick() {
      try {
        if (tab !== 'chat') return;
        const token = getToken();
        const headers = { Authorization: `Bearer ${token}` };
        const convs = await axios.get(`${apiUrl}/chat/conversations/mine`, { headers });
        setChatConversations(convs.data || []);
        if (chatSelectedId) {
          const msgs = await axios.get(`${apiUrl}/chat/conversations/${chatSelectedId}/messages`, { headers });
          setChatMessages(msgs.data || []);
        }
      } catch {}
    }
    if (tab === 'chat') {
      tick();
      timer = setInterval(tick, 5000);
    }
    return () => { if (timer) clearInterval(timer); setShowChatMenu(false); };
  }, [tab, chatSelectedId]);

  const openConversation = async (convId) => {
    try {
      setChatSelectedId(convId);
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const msgs = await axios.get(`${apiUrl}/chat/conversations/${convId}/messages`, { headers });
      setChatMessages(msgs.data || []);
    } catch {}
  };

  const startConversationWithAdmin = async (adminId) => {
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      let me = (user?.id) || (JSON.parse(sessionStorage.getItem('usuarioCamarize') || localStorage.getItem('usuarioCamarize') || '{}')?.id);
      if (!me) {
        const meRes = await axios.get(`${apiUrl}/users/me`, { headers });
        me = meRes.data?._id || meRes.data?.id;
      }
      if (!me || !adminId) throw new Error('Invalid IDs');
      const res = await axios.post(`${apiUrl}/chat/conversations`, { adminId, masterId: me }, { headers });
      const convs = await axios.get(`${apiUrl}/chat/conversations/mine`, { headers });
      setChatConversations(convs.data || []);
      setTab('chat');
      if (res?.data?._id) openConversation(res.data._id);
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || 'Unknown error';
      alert('Could not start the conversation: ' + msg);
    }
  };

  const sendChatMessage = async () => {
    try {
      if (!chatSelectedId || !chatText.trim()) return;
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.post(`${apiUrl}/chat/conversations/${chatSelectedId}/messages`, { text: chatText }, { headers });
      setChatMessages(prev => [...prev, res.data]);
      setChatText('');
    } catch {}
  };

  // Auto-scroll para última mensagem
  useEffect(() => {
    try { chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); } catch {}
  }, [chatMessages.length, chatSelectedId]);

  useEffect(() => {
    if (tab === 'requests' && isAuthenticated) {
      loadAllRequests().then(setAllRequests);
    }
  }, [tab, isAuthenticated]);

  const [avisos, setAvisos] = useState([]);
  const [avisosLoading, setAvisosLoading] = useState(false);
  const { count: avisosNaoVistos, markSeen: marcarAvisosVistos } = useUnreadAvisos();
  // A barra lateral das outras telas usa o mesmo contador: publica o total ao (re)carregar a lista
  const { definir: definirSolicitacoesPendentes } = useSolicitacoesPendentes();
  useEffect(() => {
    if (!loading) definirSolicitacoesPendentes(items.length);
  }, [loading, items, definirSolicitacoesPendentes]);

  const loadAvisos = async () => {
    setAvisosLoading(true);
    try {
      const token = getToken();
      const response = await axios.get(`${apiUrl}/notifications`, { headers: { Authorization: `Bearer ${token}` } });
      setAvisos(response.data?.notifications || []);
    } catch (e) {
      console.error('Erro ao carregar avisos:', e);
    } finally {
      setAvisosLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'avisos' && isAuthenticated) {
      loadAvisos();
      marcarAvisosVistos();
    }
  }, [tab, isAuthenticated]);

  const avaliarAviso = async (avisoId, avaliacao) => {
    try {
      const token = getToken();
      await axios.patch(`${apiUrl}/notifications/${avisoId}/avaliacao`, { avaliacao }, { headers: { Authorization: `Bearer ${token}` } });
      setAvisos(lista => lista.map(a => a.id === avisoId ? { ...a, avaliacao, verificadoEm: new Date().toISOString() } : a));
    } catch (e) {
      console.error('Erro ao avaliar aviso:', e);
    }
  };


  // Aplicar filtros quando allRequests ou filtros mudarem
  useEffect(() => {
    let filtered = [...allRequests];

    // Filtro por solicitante
    if (requesterFilter) {
      filtered = filtered.filter(item => 
        item.requesterUser?.nome?.toLowerCase().includes(requesterFilter.toLowerCase()) ||
        item.requesterUser?.email?.toLowerCase().includes(requesterFilter.toLowerCase())
      );
    }

    // Filtro por data
    if (dateFilter) {
      // Criar data local para evitar problemas de fuso horário
      const [year, month, day] = dateFilter.split('-').map(Number);
      const filterDate = new Date(year, month - 1, day); // month - 1 porque JS usa 0-11
      const filterYear = filterDate.getFullYear();
      const filterMonth = filterDate.getMonth();
      const filterDay = filterDate.getDate();
      
      console.log('Filtrando por data:', { 
        filterDate, 
        filterYear, 
        filterMonth, 
        filterDay,
        filterDateString: filterDate.toISOString().split('T')[0]
      });
      
      filtered = filtered.filter(item => {
        const itemDate = new Date(item.createdAt);
        const itemYear = itemDate.getFullYear();
        const itemMonth = itemDate.getMonth();
        const itemDay = itemDate.getDate();
        
        const matches = itemYear === filterYear && itemMonth === filterMonth && itemDay === filterDay;
        
        console.log('Verificando request:', {
          createdAt: item.createdAt,
          itemDate: itemDate.toISOString(),
          itemYear,
          itemMonth,
          itemDay,
          filterYear,
          filterMonth,
          filterDay,
          matches,
          action: item.action
        });
        
        return matches;
      });
    }

    // Filtro por ação (nome técnico e label amigável)
    if (actionFilter) {
      const q = actionFilter.toLowerCase();
      filtered = filtered.filter(item => {
        const raw = (item.action || '').toLowerCase();
        const label = (getActionLabel(item.action) || '').toLowerCase();
        return raw.includes(q) || label.includes(q);
      });
    }
    setFilteredRequests(filtered);
  }, [allRequests, requesterFilter, dateFilter, actionFilter]);

  const act = async (id, op, { confirmado = false } = {}) => {
    const token = getToken();
    
    // Se for aprovar e a ação for associar_funcionario, usar a fazenda do request
    if (op === 'approve') {
      const request = items.find(r => r._id === id) || allRequests.find(r => r._id === id);
      if (request) {
        // Calibração de um membro: confirma antes, mostrando o valor em uso e o novo
        if (request.action === 'aplicar_calibracao' && !confirmado) {
          setConfirmarCalib(request);
          return false;
        }

        // Para associar_funcionario, usar a fazenda do admin solicitante (já vem no request)
        if (request.action === 'associar_funcionario') {
          const fazendaId = request.fazenda?._id || request.fazenda || null;
          // Funcionário sem fazenda pedindo vínculo: o master escolhe a fazenda no modal
          if (!fazendaId) {
            setPendingApproveRequestId(id);
            setSelectedFazendaId('');
            setShowApproveFuncionarioModal(true);
            return;
          }
          try {
            const response = await axios.post(
              `${apiUrl}/requests/${id}/approve`,
              { fazendaId },
              { headers: { Authorization: `Bearer ${token}` } }
            );
            console.log('Request atualizado:', response.data);
            await load();
            if (tab === 'requests') {
              const updatedRequests = await loadAllRequests();
              setAllRequests(updatedRequests);
            }
          } catch (error) {
            alert('Error approving: ' + (error?.response?.data?.error || error.message));
          }
          return;
        }
        
        // Para cadastrar_funcionario, ainda precisa do modal
        if (request.action === 'cadastrar_funcionario') {
          setPendingApproveRequestId(id);
          setSelectedFazendaId('');
          setShowApproveFuncionarioModal(true);
          return;
        }
      }
    }
    
    // Para outras aprovações ou rejeições, fazer direto (com retorno na tela)
    const request = items.find(r => r._id === id) || allRequests.find(r => r._id === id);
    setDecidindo(id);
    try {
      await axios.post(`${apiUrl}/requests/${id}/${op}`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setMasterNotification({ show: true, type: 'success',
        message: op !== 'approve' ? 'Request rejected.'
          : request?.action === 'aplicar_calibracao' ? mensagemCalibracaoAplicada(request.payload) : 'Request approved.' });
      await load();
      // Recarregar requests completos se estivermos na aba requests
      if (tab === 'requests') {
        const updatedRequests = await loadAllRequests();
        setAllRequests(updatedRequests);
      }
      return true;
    } catch (e) {
      setMasterNotification({ show: true, type: 'error',
        message: `Could not ${op === 'approve' ? 'approve' : 'reject'} the request: ${e?.response?.data?.error || e.message}` });
      return false;
    } finally {
      setDecidindo(null);
    }
  };

  const aplicarCalibracaoConfirmada = async () => {
    if (await act(confirmarCalib._id, 'approve', { confirmado: true })) setConfirmarCalib(null);
  };

  const handleApproveFuncionario = async () => {
    if (!selectedFazendaId) {
      alert('Please select a farm.');
      return;
    }

    try {
      const token = getToken();
      const response = await axios.post(
        `${apiUrl}/requests/${pendingApproveRequestId}/approve`,
        { fazendaId: selectedFazendaId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('Request atualizado:', response.data);
      setShowApproveFuncionarioModal(false);
      setPendingApproveRequestId(null);
      setSelectedFazendaId('');
      await load();
      if (tab === 'requests') {
        const updatedRequests = await loadAllRequests();
        setAllRequests(updatedRequests);
      }
    } catch (error) {
      alert('Error approving: ' + (error?.response?.data?.error || error.message));
    }
  };

  const clearFilters = () => {
    setRequesterFilter('');
    setDateFilter('');
  };

  const formatRequestDetails = (action, payload) => {
    const getCativeiroNomeById = (cid) => {
      const c = cativeiros.find(x => String(x._id) === String(cid));
      return c ? (c.nome || c._id) : (cid || 'N/A');
    };
    if (action === 'editar_cativeiro_add_sensor') {
      const nome = getCativeiroNomeById(payload?.cativeiroId);
      const tipos = Array.isArray(payload?.tipos) ? payload.tipos : [];
      return (
        <div className={cardStyles.detalhes}>
          <div style={{ marginBottom: 6 }}><strong>Pond:</strong> {nome}</div>
          <div className={cardStyles.detalhesTitulo}>Requested sensors</div>
          <div className={cardStyles.tags}>
            {tipos.length > 0 ? tipos.map(t => (
              <span key={t} className={cardStyles.tag}>{t}</span>
            )) : <span style={{ color: '#6b7280' }}>No type provided</span>}
          </div>
        </div>
      );
    }
    if (action === 'editar_cativeiro_remove_sensor') {
      const nome = getCativeiroNomeById(payload?.cativeiroId);
      const tipos = Array.isArray(payload?.tipos) ? payload.tipos : [];
      return (
        <div className={cardStyles.detalhes}>
          <div style={{ marginBottom: 6 }}><strong>Pond:</strong> {nome}</div>
          <div className={cardStyles.detalhesTitulo}>Replace sensors</div>
          <div className={cardStyles.tags}>
            {tipos.length > 0 ? tipos.map(t => (
              <span key={t} className={cardStyles.tag}>{t}</span>
            )) : <span style={{ color: '#6b7280' }}>No type provided</span>}
          </div>
        </div>
      );
    }
    if (action === 'cadastrar_cativeiro') {
      const fazenda = fazendas.find(f => f._id === payload.fazendaId);
      const tipoCamarao = tiposCamarao.find(t => t._id === payload.id_tipo_camarao);
      
      return (
        <div className={cardStyles.detalhes}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <strong>Name:</strong> {payload.nome || 'N/A'}
            </div>
            <div>
              <strong>Farm:</strong> {fazenda ? `${fazenda.nome} - ${fazenda.codigo}` : payload.fazendaId || 'N/A'}
            </div>
            <div>
              <strong>Shrimp type:</strong> {tipoCamarao ? tipoCamarao.nome : payload.id_tipo_camarao || 'N/A'}
            </div>
            <div>
              <strong>Installation date:</strong> {payload.data_instalacao ? new Date(payload.data_instalacao).toLocaleDateString('en-US') : 'N/A'}
            </div>
            <div>
              <strong>Ideal temp:</strong> {payload.temp_media_diaria ? `${payload.temp_media_diaria}°C` : 'N/A'}
            </div>
            <div>
              <strong>Ideal pH:</strong> {payload.ph_medio_diario || 'N/A'}
            </div>
            <div>
              <strong>Ideal ammonia:</strong> {payload.amonia_media_diaria ? `${payload.amonia_media_diaria} mg/L` : 'N/A'}
            </div>
          </div>
        </div>
      );
    } else if (action === 'editar_cativeiro') {
      const cativeiroNome = payload.cativeiroNome || getCativeiroNomeById(payload.cativeiroId);
      const tipoCamarao = payload.id_tipo_camarao ? (tiposCamarao.find(t => String(t._id) === String(payload.id_tipo_camarao)) || null) : null;
      return (
        <div className={cardStyles.detalhes}>
          <div style={{ marginBottom: 6 }}><strong>Pond:</strong> {cativeiroNome}</div>
          <div className={cardStyles.detalhesTitulo}>Requested changes</div>
          <ul>
            {typeof payload?.nome !== 'undefined' && <li><strong>Name:</strong> {payload.nome || 'N/A'}</li>}
            {typeof payload?.id_tipo_camarao !== 'undefined' && (
              <li><strong>Shrimp type:</strong> {tipoCamarao ? tipoCamarao.nome : payload.id_tipo_camarao}</li>
            )}
            {typeof payload?.data_instalacao !== 'undefined' && (
              <li><strong>Installation date:</strong> {payload.data_instalacao ? new Date(payload.data_instalacao).toLocaleDateString('en-US') : 'N/A'}</li>
            )}
            {typeof payload?.temp_media_diaria !== 'undefined' && <li><strong>Ideal temp (°C):</strong> {payload.temp_media_diaria}</li>}
            {typeof payload?.ph_medio_diario !== 'undefined' && <li><strong>Ideal pH:</strong> {payload.ph_medio_diario}</li>}
            {typeof payload?.amonia_media_diaria !== 'undefined' && <li><strong>Ideal ammonia (mg/L):</strong> {payload.amonia_media_diaria}</li>}
          </ul>
        </div>
      );
    } else if (action === 'aplicar_calibracao') {
      const nomeCativeiro = (cativeiros || []).find(c => String(c._id) === String(payload?.cativeiroId))?.nome;
      return <DetalhesCalibracao payload={payload} nomeCativeiro={nomeCativeiro} rodape="Once approved, this result takes effect for the pond." />;
    } else if (action === 'editar_dieta') {
      const horarios = Array.isArray(payload?.horarios) ? payload.horarios.filter(h => h) : [];
      return (
        <div className={cardStyles.detalhes}>
          <div style={{ marginBottom: 6 }}><strong>Pond:</strong> {payload?.cativeiroNome || payload?.cativeiroId || 'N/A'}</div>
          <div className={cardStyles.detalhesTitulo}>Requested changes</div>
          <ul>
            {payload?.descricao && <li><strong>Description:</strong> {payload.descricao}</li>}
            {typeof payload?.quantidade !== 'undefined' && <li><strong>Amount:</strong> {payload.quantidade}g per meal</li>}
            {typeof payload?.quantidadeRefeicoes !== 'undefined' && <li><strong>Meals/day:</strong> {payload.quantidadeRefeicoes}</li>}
            {horarios.length > 0 && <li><strong>Times:</strong> {horarios.join(', ')}</li>}
          </ul>
        </div>
      );
    } else if (action === 'editar_sensor') {
      const sensor = (sensores || []).find(s => String(s._id) === String(payload?.id));
      return <DetalhesSensor payload={payload} sensor={sensor} />;
    } else if (action === 'cadastrar_funcionario') {
      return (
        <div className={cardStyles.detalhes}>
          <div><strong>Name:</strong> {payload.nome || 'N/A'}</div>
          <div><strong>Email:</strong> {payload.email || 'N/A'}</div>
          <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
            Select the farm when approving.
          </div>
        </div>
      );
    } else if (action === 'associar_funcionario') {
      return (
        <div className={cardStyles.detalhes}>
          {payload.nome && <div><strong>Employee:</strong> {payload.nome}</div>}
          <div><strong>Employee email:</strong> {payload.email || payload.emailFuncionario || 'N/A'}</div>
          {payload.fazendaInformada && <div><strong>Farm provided:</strong> {payload.fazendaInformada}</div>}
          <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
            Select the farm when approving to link this employee.
          </div>
        </div>
      );
    } else if (action === 'cadastrar_proprietario') {
      return (
        <div className={cardStyles.detalhes}>
          <div><strong>Name:</strong> {payload.nome || 'N/A'}</div>
          <div><strong>Email:</strong> {payload.email || 'N/A'}</div>
          {payload.fazenda && (
            <div style={{ marginTop: 8 }}>
              <strong>Farm:</strong> {payload.fazenda.nome || 'N/A'}
            </div>
          )}
        </div>
      );
    } else {
      // Outras ações (inclusive antigas, como relatório individual): lista legível, sem JSON
      return <DetalhesGenericos payload={payload} resolver={nomeDoId} />;
    }
  };

  const getActionLabel = (action) => rotuloAcao(action);

  // Nome legível de um id citado numa solicitação (null = oculta o id técnico)
  const nomeDoId = (chave, id) => {
    const igual = (x) => String(x._id) === String(id);
    if (/cativeiro/i.test(chave)) return cativeiros.find(igual)?.nome || null;
    if (/fazenda/i.test(chave)) return fazendas.find(igual)?.nome || null;
    if (/sensor/i.test(chave)) return sensores.find(igual)?.apelido || null;
    return null;
  };

  const changeRole = async (id, role) => {
    const token = getToken();
    await axios.patch(`${apiUrl}/users/${id}/role`, { role }, { headers: { Authorization: `Bearer ${token}` } });
    await load();
  };

  const groupedByFazenda = () => {
    const map = {};
    // seed com todas as fazendas para aparecer mesmo sem cativeiros
    fazendas.forEach(f => { map[String(f._id)] = []; });
    
    cativeiros.forEach(c => {
      // tenta várias chaves possíveis de vínculo e normaliza para string
      const raw = c.fazenda?._id || c.fazendaId || c.fazenda || c.fazenda_id;
      const fallback = fazendas[0]?._id ? String(fazendas[0]._id) : '';
      const fzId = raw ? String(raw) : fallback;
      
      if (!map[fzId]) map[fzId] = [];
      map[fzId].push(c);
    });
    
    return map;
  };

  const ensureCativeirosForFazenda = async (fzId) => {
    // No-op: usamos os cativeiros já carregados em memória
    return;
  };

  const handleCativeiroFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMasterNotification({ show: true, message: 'Select a valid image file.', type: 'error' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMasterNotification({ show: true, message: 'Image too large. Maximum 5MB.', type: 'error' });
      return;
    }
    if (!uploadTargetCativeiro) {
      setMasterNotification({ show: true, message: 'No pond selected.', type: 'error' });
      return;
    }
    const targetId = uploadTargetCativeiro;
    const localUrl = URL.createObjectURL(file);
    setPreviewImage(prev => ({ ...prev, [targetId]: localUrl }));
    setPhotoErrors(prev => { const next = { ...prev }; delete next[targetId]; return next; });
    await uploadCativeiroPhoto(targetId, file);
    e.target.value = '';
    setUploadTargetCativeiro(null);
  };

  const uploadCativeiroPhoto = async (cativeiroId, file) => {
    try {
      const token = getToken();
      const form = new FormData();
      form.append('foto', await comprimirFoto(file));
      await axios.post(`${apiUrl}/cativeiros/${cativeiroId}/foto`, form, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      setMasterNotification({ show: true, message: 'Photo updated successfully!', type: 'success' });
      await load();
    } catch {
      setMasterNotification({ show: true, message: 'Failed to update photo. Please try again.', type: 'error' });
      setPreviewImage(prev => { const next = { ...prev }; delete next[cativeiroId]; return next; });
    }
  };

  const loadSensorsForCativeiro = async (cativeiroId) => {
    try {
      const token = getToken();
      const res = await axios.get(`${apiUrl}/cativeiros/${cativeiroId}/sensores`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const raw = Array.isArray(res.data) ? res.data : [];
      const sensores = raw.map(item => item?.id_sensor || item).filter(Boolean);
      setCativeiros(prev => prev.map(c => c._id === cativeiroId ? { ...c, sensores } : c));
    } catch (e) {
      // mantém estado atual; não quebra UI
    }
  };

  const loadDietaAtual = async (cativeiroId) => {
    try {
      const res = await axios.get(`${apiUrl}/dietas/atual/${cativeiroId}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const data = res?.data || null;
      setCativeiroDieta(prev => ({ ...prev, [cativeiroId]: data }));
      if (data) {
        setDietaEditsByCat(prev => ({ ...prev, [cativeiroId]: { descricao: data.descricao || '', quantidade: data.quantidade || '' } }));
      }
    } catch {
      setCativeiroDieta(prev => ({ ...prev, [cativeiroId]: null }));
    }
  };



  const getFazendaName = (id) => {
    const idStr = String(id);
    const f = fazendas.find(fz => String(fz._id) === idStr);
    if (!f) return 'No farm';
    return f.nome && f.codigo ? `${f.nome} - ${f.codigo}` : (f.nome || f.codigo || id);
  };

  const getFazendaAdmins = (id) => {
    const f = fazendas.find(fz => String(fz._id) === String(id));
    return f?.admins || [];
  };

  const openEditFazenda = (fazenda) => {
    const currentAdmin = fazenda.admins?.[0];
    setEditFazendaForm({
      id: String(fazenda._id),
      nome: fazenda.nome || '',
      rua: fazenda.rua || '',
      bairro: fazenda.bairro || '',
      cidade: fazenda.cidade || '',
      numero: String(fazenda.numero || ''),
      adminId: currentAdmin ? String(currentAdmin.id) : '',
    });
    setShowEditFazendaModal(true);
  };

  const handleUpdateFazenda = async () => {
    try {
      const token = getToken();
      const body = { nome: editFazendaForm.nome, rua: editFazendaForm.rua, bairro: editFazendaForm.bairro, cidade: editFazendaForm.cidade, numero: editFazendaForm.numero };
      if (editFazendaForm.adminId) body.adminId = editFazendaForm.adminId;
      await axios.patch(
        `${apiUrl}/fazendas/${editFazendaForm.id}`,
        body,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setShowEditFazendaModal(false);
      await load();
    } catch (e) {
      alert('Error updating farm: ' + (e?.response?.data?.error || e.message));
    }
  };

  const handleCreateFazenda = async () => {
    try {
      const token = getToken();
      const body = { nome: newFazendaForm.nome, rua: newFazendaForm.rua, bairro: newFazendaForm.bairro, cidade: newFazendaForm.cidade, numero: newFazendaForm.numero };
      if (newFazendaForm.adminId) body.adminId = newFazendaForm.adminId;
      await axios.post(`${apiUrl}/fazendas`, body, { headers: { Authorization: `Bearer ${token}` } });
      setShowCreateFazendaModal(false);
      setNewFazendaForm({ nome: '', rua: '', bairro: '', cidade: '', numero: '', adminId: '' });
      await load();
    } catch (e) {
      alert('Error creating farm: ' + (e?.response?.data?.error || e.message));
    }
  };

  const handleDeleteFazenda = async (id, nome) => {
    if (!window.confirm(`Delete the farm "${nome}"? This will remove all user links to it.`)) return;
    try {
      const token = getToken();
      await axios.delete(`${apiUrl}/fazendas/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      await load();
    } catch (e) {
      alert('Error deleting farm: ' + (e?.response?.data?.error || e.message));
    }
  };



  const deleteCativeiro = async (id) => {
    const token = getToken();
    await axios.delete(`${apiUrl}/cativeiros/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    await load();
  };

  const openCreateModal = (presetFazendaId, presetNome) => {
    const defaultFz = String(presetFazendaId || fazendas[0]?._id || '');
    const defaultTipo = (Array.isArray(tiposCamarao) && tiposCamarao.length > 0) ? String(tiposCamarao[0]._id) : '';
    setCreateForm({
      fazendaId: defaultFz,
      nome: (presetNome && presetNome.trim()) ? presetNome.trim() : '',
      id_tipo_camarao: defaultTipo,
      data_instalacao: new Date().toISOString().slice(0,10),
      temp_media_diaria: '',
      ph_medio_diario: '',
      amonia_media_diaria: '',
      fotoFile: null
    });
    setShowCreateModal(true);
  };



  const submitCreateModal = async () => {
    try {
      const token = getToken();
      const form = new FormData();
      form.append('fazendaId', createForm.fazendaId);
      form.append('nome', createForm.nome && createForm.nome.trim() ? createForm.nome.trim() : 'New pond');
      form.append('id_tipo_camarao', createForm.id_tipo_camarao);
      form.append('data_instalacao', new Date(createForm.data_instalacao).toISOString());
      if (createForm.temp_media_diaria) form.append('temp_media_diaria', createForm.temp_media_diaria);
      if (createForm.ph_medio_diario) form.append('ph_medio_diario', createForm.ph_medio_diario);
      if (createForm.amonia_media_diaria) form.append('amonia_media_diaria', createForm.amonia_media_diaria);
      if (createForm.fotoFile) form.append('foto_cativeiro', await comprimirFoto(createForm.fotoFile));

      await axios.post(`${apiUrl}/cativeiros`, form, { headers: { Authorization: `Bearer ${token}` } });
      setShowCreateModal(false);
      await load();
      setExpandedFazenda(prev => ({ ...prev, [String(createForm.fazendaId)]: true }));
    } catch (e) {
      console.error('Falha ao criar cativeiro:', e);
      alert('Error creating pond. Check the data and try again.');
    }
  };

  const localRole = typeof window !== 'undefined' ? (JSON.parse(sessionStorage.getItem('usuarioCamarize') || localStorage.getItem('usuarioCamarize') || '{}')?.role) : undefined;
  const effectiveRole = user?.role || localRole;
  // Com dados guardados, o login é conferido em segundo plano (se falhar, o efeito acima manda para /login)
  const conferindoLogin = authLoading ? !cacheInicial : !isAuthenticated;
  if (conferindoLogin || loading || effectiveRole !== 'master') return <div className={styles.loadingScreen}>Loading...</div>;
  if (error) return <div className={styles.loadingScreen} style={{ color: '#ef4444' }}>{error}</div>;

  const badges = { avisos: avisosNaoVistos, solicitacoes: items.length };

  const masterPageTitles = {
    requests: ['History', 'History of admin actions'],
    avisos: ['Alerts', 'Alerts generated by pond monitoring'],
    solicitacoes: ['Requests', 'Pending approvals'],
    usuarios: ['Users', 'User and permission management'],
    cativeiros: ['Farms & Ponds', 'Overview of all farms'],
    sensores: ['Sensors', 'IoT sensor management and linking'],
    dietas: ['Diets', 'Each pond\'s diet, by farm'],
    chat: ['Chat with Admins', 'Communication with administrators'],
    calibracoes: ['Calibrations', 'pH sensor and feeder calibration'],
  };

  return (
    <div className={styles.layout}>

      {mobileMenuOpen && (
        <div className={styles.backdrop} onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* SIDEBAR */}
      <Sidebar
        open={mobileMenuOpen}
        userName={user?.nome}
        roleLabel="Master"
        onLogout={() => { setMobileMenuOpen(false); setShowLogoutModal(true); }}
        items={MASTER_MENU.map(({ id, icon: Icon, label, disabled, hint }) => ({
          key: id,
          label,
          disabled,
          hint,
          badge: badges[id],
          icon: <Icon />,
          active: tab === id,
          onClick: () => { setTab(id); setMobileMenuOpen(false); },
        }))}
      />

      {/* MAIN */}
      <div className={styles.main}>
        <header className={styles.topBar}>
          <button className={styles.hamburgerBtn} onClick={() => setMobileMenuOpen(true)} aria-label="Open menu">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
          <div>
            <h1 className={styles.pageTitle}>{(masterPageTitles[tab] || [''])[0]}</h1>
            <p className={styles.pageSubtitle}>{(masterPageTitles[tab] || ['', ''])[1]}</p>
          </div>
        </header>
        <div className={styles.content}>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleCativeiroFileChange}
      />

      {tab === 'avisos' && (
        <section className={styles.section}>
          <AvisoLista
            avisos={avisos}
            loading={avisosLoading}
            onAvaliar={(aviso, avaliacao) => avaliarAviso(aviso.id, avaliacao)}
          />
        </section>
      )}

      {tab === 'requests' && (
        <section className={styles.section}>
          <SolicitacoesFiltros
            solicitante={requesterFilter} onSolicitante={setRequesterFilter}
            acao={actionFilter} onAcao={setActionFilter}
            data={dateFilter} onData={setDateFilter}
            onLimpar={() => { clearFilters(); setActionFilter(''); }}
            filtrados={filteredRequests.length} total={allRequests.length}
          />

          {filteredRequests.length === 0 && (
            allRequests.length > 0
              ? <SolicitacoesVazio titulo="Nothing found" texto="No records match the applied filters." />
              : <SolicitacoesVazio titulo="No records" texto="Farm requests appear here." />
          )}

          <div className={cardStyles.list}>
            {filteredRequests.map(item => (
              <SolicitacaoCard
                key={item._id}
                item={item}
                titulo={getActionLabel(item.action)}
                mostrarSolicitante
                detalhes={item.payload && Object.keys(item.payload).length > 0 ? formatRequestDetails(item.action, item.payload) : null}
              acoes={item.status === 'pendente' ? [
                { rotulo: 'Approve', tipo: 'aprovar', onClick: () => act(item._id, 'approve') },
                { rotulo: 'Reject', tipo: 'recusar', onClick: () => act(item._id, 'reject') },
              ] : []}
              />
            ))}
          </div>
        </section>
      )}

      {tab === 'solicitacoes' && (
        <section className={styles.section}>
          {items.length === 0 ? (
            <SolicitacoesVazio titulo="All caught up" texto="No requests awaiting approval." />
          ) : (
            <>
              <SolicitacoesFiltros filtrados={items.length} rotulo={items.length === 1 ? 'pending request' : 'pending requests'} />
              <div className={cardStyles.list}>
                {items.map(item => (
                  <SolicitacaoCard
                    key={item._id}
                    item={item}
                    titulo={getActionLabel(item.action)}
                    mostrarSolicitante
                    detalhes={item.payload && Object.keys(item.payload).length > 0 ? formatRequestDetails(item.action, item.payload) : null}
                    acoes={[
                      { rotulo: decidindo === item._id ? 'Applying...' : 'Approve', tipo: 'aprovar',
                        onClick: () => act(item._id, 'approve'), desabilitado: !!decidindo },
                      { rotulo: 'Reject', tipo: 'recusar', onClick: () => act(item._id, 'reject'), desabilitado: !!decidindo },
                    ]}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {tab === 'usuarios' && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Users</h2>
            <span className={styles.filterCount}>{users.length} user{users.length !== 1 ? 's' : ''}</span>
          </div>
          {users.map(u => {
            const roleBadgeClass = u.role === 'master' ? styles.userRowRoleMaster : u.role === 'admin' ? styles.userRowRoleAdmin : styles.userRowRoleMembro;
            const initials = (u.nome || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
            return (
              <div key={u.id} className={styles.userRow}>
                <div className={styles.userRowAvatar}>{initials}</div>
                <div className={styles.userRowInfo}>
                  <div className={styles.userRowName}>{u.nome}</div>
                  <div className={styles.userRowEmail}>{u.email}</div>
                  <span className={`${styles.userRowRoleBadge} ${roleBadgeClass}`}>{({ membro: 'Member', admin: 'Admin', master: 'Master' })[u.role] || u.role}</span>
                </div>
                <select
                  className={styles.userRowSelect}
                  value={u.role}
                  onChange={(e) => setPendingRoleChange({ userId: u.id, userName: u.nome, currentRole: u.role, newRole: e.target.value })}
                >
                  <option value="membro">Member</option>
                  <option value="admin">Admin</option>
                  <option value="master">Master</option>
                </select>
              </div>
            );
          })}
        </section>
      )}

      {tab === 'cativeiros' && (() => {
        const SENSOR_TIPO_CFG = {
          temperatura: { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa', label: 'Temp' },
          ph:          { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', label: 'pH'   },
          amonia:      { bg: '#fdf4ff', color: '#7e22ce', border: '#e9d5ff', label: 'Ammonia' },
          sensor:      { bg: '#f8fafc', color: '#475569', border: '#e2e8f0', label: '—'    },
        };
        const grouped = groupedByFazenda();
        const hasAny = Object.values(grouped).some(arr => Array.isArray(arr) && arr.length > 0);
        return (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Farms and Ponds</h2>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                  {fazendas.length} farm{fazendas.length !== 1 ? 's' : ''} · {cativeiros.length} pond{cativeiros.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => openCreateModal()}>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                  New Pond
                </button>
                <button className={`${styles.btn} ${styles.btnSuccess}`} onClick={() => setShowCreateFazendaModal(true)}>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                  New Farm
                </button>
              </div>
            </div>

            {!hasAny && Array.isArray(cativeiros) && cativeiros.length > 0 ? (
              <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 10 }}>
                {cativeiros.map(c => (
                  <div key={c._id} style={{ border: '1px solid #f3f4f6', borderRadius: 6, padding: 10, marginBottom: 8 }}>
                    <div style={{ fontWeight: 600 }}>{c.nome || c._id}</div>
                    <div style={{ color: '#6b7280', fontSize: 13 }}>{c.id_tipo_camarao?.nome || c.id_tipo_camarao || '—'}</div>
                  </div>
                ))}
              </div>
            ) : (
              Object.entries(grouped).map(([fzId, cats]) => {
                const fzObj = fazendas.find(f => String(f._id) === fzId);
                const fzAdmins = getFazendaAdmins(fzId);
                return (
                  <div key={fzId} className={styles.accordion}>
                    {/* Fazenda header */}
                    <div
                      onClick={() => {
                        const willExpand = !expandedFazenda[fzId];
                        setExpandedFazenda(prev => ({ ...prev, [fzId]: willExpand }));
                        if (willExpand) ensureCativeirosForFazenda(fzId);
                      }}
                      className={`${styles.accordionHeader} ${expandedFazenda[fzId] ? styles.accordionHeaderOpen : ''}`}
                    >
                      <div className={styles.accordionFarmInfo}>
                        <div className={styles.accordionFarmName}>
                          {getFazendaName(fzId)}
                          <span style={{ marginLeft: 8, fontSize: '0.7rem', fontWeight: 500, background: '#f1f5f9', color: '#64748b', padding: '1px 7px', borderRadius: 20, verticalAlign: 'middle' }}>
                            {cats.length} pond{cats.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className={styles.accordionFarmAdmin}>
                          {fzAdmins.length > 0 ? `Admin: ${fzAdmins.map(a => a.nome).join(', ')}` : 'No admin assigned'}
                        </div>
                      </div>
                      <div className={styles.accordionHeaderRight}>
                        <button
                          className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
                          onClick={e => { e.stopPropagation(); openEditFazenda(fzObj); }}
                        >Edit</button>
                        <button
                          className={`${styles.btn} ${styles.btnSm}`}
                          style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}
                          onClick={e => { e.stopPropagation(); handleDeleteFazenda(fzId, fzObj?.nome); }}
                        >Delete</button>
                        <span className={styles.accordionArrow} style={{ display: 'inline-block', transition: 'transform 0.2s', transform: expandedFazenda[fzId] ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                      </div>
                    </div>

                    {/* Fazenda body */}
                    {expandedFazenda[fzId] && (
                      <div className={styles.accordionBody}>
                        {cats.length === 0 ? (
                          <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>No ponds on this farm.</p>
                        ) : (
                          (((Array.isArray(cativeirosByFazenda[fzId]) && cativeirosByFazenda[fzId].length > 0) ? cativeirosByFazenda[fzId] : cats) || []).map(c => {
                            const sensorCount = Array.isArray(c.sensores) ? c.sensores.length : 0;
                            const tipoNome = c.id_tipo_camarao?.nome || (typeof c.id_tipo_camarao === 'string' ? c.id_tipo_camarao : null);
                            return (
                              <div key={c._id} className={styles.subAccordion}>
                                {/* Cativeiro header */}
                                <div
                                  onClick={() => {
                                    const will = !expandedCativeiro[c._id];
                                    setExpandedCativeiro(prev => ({ ...prev, [c._id]: will }));
                                    if (will) {
                                      loadSensorsForCativeiro(c._id);
                                      if (!cativeiroDieta[c._id]) loadDietaAtual(c._id);
                                    }
                                  }}
                                  className={`${styles.subAccordionHeader} ${expandedCativeiro[c._id] ? styles.subAccordionHeaderOpen : ''}`}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{ width: 30, height: 30, borderRadius: 7, background: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                      <svg width="15" height="15" fill="none" viewBox="0 0 24 24"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 21V12h6v9" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                    </div>
                                    <div>
                                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1e293b', lineHeight: 1.2 }}>{c.nome || c._id}</div>
                                      {tipoNome && <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 1 }}>{tipoNome}</div>}
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {sensorCount > 0 && (
                                      <span style={{ background: '#dbeafe', color: '#1d4ed8', borderRadius: 20, padding: '2px 8px', fontSize: '11px', fontWeight: 600, border: '1px solid #bfdbfe' }}>
                                        {sensorCount} sensor{sensorCount !== 1 ? 's' : ''}
                                      </span>
                                    )}
                                    <span style={{ color: '#94a3b8', fontSize: 11, display: 'inline-block', transition: 'transform 0.2s', transform: expandedCativeiro[c._id] ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                                  </div>
                                </div>

                                {/* Cativeiro body */}
                                {expandedCativeiro[c._id] && (
                                  <div className={styles.subAccordionBody}>
                                    {/* Action bar */}
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
                                      <button
                                        className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
                                        onClick={() => {
                                          setEditForm({
                                            id: c._id,
                                            fazendaId: String(c.fazenda?._id || c.fazenda || ''),
                                            nome: c.nome || '',
                                            id_tipo_camarao: String(c.id_tipo_camarao?._id || c.id_tipo_camarao || ''),
                                            data_instalacao: c.data_instalacao ? new Date(c.data_instalacao).toISOString().slice(0,10) : new Date().toISOString().slice(0,10),
                                            temp_media_diaria: c.condicoes_ideais?.temp_ideal || c.temp_media_diaria || '',
                                            ph_medio_diario: c.condicoes_ideais?.ph_ideal || c.ph_medio_diario || '',
                                            amonia_media_diaria: c.condicoes_ideais?.amonia_ideal || c.amonia_media_diaria || '',
                                            fotoFile: null
                                          });
                                          setShowEditModal(true);
                                        }}
                                      >
                                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path d="M15.232 5.232a3 3 0 1 1 4.243 4.243L7.5 21H3v-4.5L15.232 5.232Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                        Edit
                                      </button>
                                      <button
                                        className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
                                        onClick={() => abrirModalLimites(c)}
                                        title="Configure temperature limits and alert sensitivity"
                                      >
                                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                        Alerts
                                      </button>
                                      <button
                                        className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
                                        onClick={() => abrirHistoricoChave(c)}
                                        title="Generate this pond's device key (ESP32) and view its history"
                                      >
                                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                        Key
                                      </button>
                                      <button
                                        className={`${styles.btn} ${styles.btnSm}`}
                                        style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}
                                        onClick={() => deleteCativeiro(c._id)}
                                      >
                                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                        Delete
                                      </button>
                                    </div>

                                    {/* Info grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 8, marginBottom: 18 }}>
                                      {[
                                        ['Shrimp type', c.id_tipo_camarao?.nome || (typeof c.id_tipo_camarao === 'string' ? c.id_tipo_camarao : '—')],
                                        ['Installation', c.data_instalacao ? new Date(c.data_instalacao).toLocaleDateString('en-US') : '—'],
                                        ['Ideal temp', c.condicoes_ideais?.temp_ideal != null ? `${c.condicoes_ideais.temp_ideal} °C` : c.temp_media_diaria ? `${c.temp_media_diaria} °C` : '—'],
                                        ['Ideal pH', c.condicoes_ideais?.ph_ideal ?? c.ph_medio_diario ?? '—'],
                                        ['Ideal ammonia', c.condicoes_ideais?.amonia_ideal != null ? `${c.condicoes_ideais.amonia_ideal} mg/L` : c.amonia_media_diaria ? `${c.amonia_media_diaria} mg/L` : '—'],
                                      ].map(([label, value]) => (
                                        <div key={label} style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 8, padding: '8px 12px' }}>
                                          <div style={{ fontSize: '0.67rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
                                          <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b' }}>{value}</div>
                                        </div>
                                      ))}
                                    </div>

                                    {/* Foto */}
                                    <div style={{ marginBottom: 16 }}>
                                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Photo</div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        {(previewImage[c._id] || !photoErrors[c._id]) ? (
                                          <img
                                            src={previewImage[c._id] || fotoCativeiroUrl(apiUrl, c._id, authToken, c.foto_versao)}
                                            alt="Pond photo"
                                            style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0', flexShrink: 0 }}
                                            onError={() => {
                                              if (!previewImage[c._id]) {
                                                setPhotoErrors(prev => ({ ...prev, [c._id]: true }));
                                              }
                                            }}
                                          />
                                        ) : (
                                          <div style={{ width: 48, height: 48, borderRadius: 8, background: '#f1f5f9', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="13" r="4" stroke="#94a3b8" strokeWidth="1.5"/></svg>
                                          </div>
                                        )}
                                        <button
                                          onClick={() => { setUploadTargetCativeiro(c._id); fileInputRef.current?.click(); }}
                                          className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
                                        >
                                          Change photo
                                        </button>
                                      </div>
                                    </div>

                                    {/* Sensors */}
                                    <div style={{ marginBottom: 16 }}>
                                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Linked sensors</div>
                                      {!Array.isArray(c.sensores) ? (
                                        <div style={{ color: '#94a3b8', fontSize: '0.82rem' }}>Loading...</div>
                                      ) : c.sensores.length === 0 ? (
                                        <div style={{ color: '#94a3b8', fontSize: '0.82rem', fontStyle: 'italic' }}>No linked sensors.</div>
                                      ) : (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                          {c.sensores.map(s => {
                                            const tipo = getSensorType(s);
                                            const cfg = SENSOR_TIPO_CFG[tipo] || SENSOR_TIPO_CFG.sensor;
                                            return (
                                              <div key={s._id || s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 20, padding: '4px 6px 4px 10px' }}>
                                                <span style={{ color: cfg.color, fontWeight: 700, fontSize: '10px', textTransform: 'uppercase' }}>{cfg.label}</span>
                                                <span style={{ color: '#1e293b', fontWeight: 600, fontSize: '12px' }}>{s.apelido || '—'}</span>
                                                <button
                                                  onClick={async () => {
                                                    try {
                                                      const token = getToken();
                                                      await axios.delete(`${apiUrl}/sensoresxCativeiros`, {
                                                        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                                                        data: { id_sensor: s._id || s.id, id_cativeiro: c._id }
                                                      });
                                                      await loadSensorsForCativeiro(c._id);
                                                      setMasterNotification({ show: true, message: 'Sensor unlinked successfully!', type: 'success' });
                                                    } catch (e) {
                                                      setMasterNotification({ show: true, message: 'Error unlinking sensor: ' + (e?.response?.data?.message || e.message), type: 'error' });
                                                    }
                                                  }}
                                                  title="Unlink"
                                                  style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fee2e2', border: 'none', borderRadius: '50%', cursor: 'pointer', color: '#ef4444', fontWeight: 700, fontSize: 13, padding: 0, flexShrink: 0, lineHeight: 1 }}
                                                >×</button>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>

                                    {/* Diet */}
                                    <div>
                                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Active diet</div>
                                      {cativeiroDieta[c._id] === undefined && <div style={{ color: '#94a3b8', fontSize: '0.82rem' }}>Loading...</div>}
                                      {cativeiroDieta[c._id] === null && (
                                        <div style={{ color: '#94a3b8', fontSize: '0.82rem', fontStyle: 'italic', background: '#f8fafc', border: '1px dashed #e2e8f0', borderRadius: 8, padding: '10px 14px' }}>
                                          No active diet for this pond.
                                        </div>
                                      )}
                                      {cativeiroDieta[c._id] && (() => {
                                        const d = cativeiroDieta[c._id];
                                        const horarios = Array.isArray(d.horarios) && d.horarios.length > 0 ? d.horarios : null;
                                        return (
                                          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                                              <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 10px', borderRadius: 20, fontSize: '12px', fontWeight: 700, border: '1px solid #bbf7d0' }}>{d.descricao || '—'}</span>
                                              {typeof d.quantidade !== 'undefined' && (
                                                <span style={{ fontSize: '0.82rem', color: '#166534' }}><b>{d.quantidade}g</b> per meal</span>
                                              )}
                                              {typeof d.quantidadeRefeicoes !== 'undefined' && (
                                                <span style={{ fontSize: '0.82rem', color: '#166534' }}><b>{d.quantidadeRefeicoes}×</b> a day</span>
                                              )}
                                            </div>
                                            {horarios && (
                                              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 700 }}>Times:</span>
                                                {horarios.map((h, i) => (
                                                  <span key={i} style={{ background: '#dcfce7', color: '#15803d', padding: '1px 8px', borderRadius: 20, fontSize: '11px', fontWeight: 600, border: '1px solid #bbf7d0' }}>{h}</span>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                        {loadingFazenda[fzId] && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>Loading ponds...</div>}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </section>
        );
      })()}

      {tab === 'sensores' && (() => {
        const SENSOR_CFG = {
          temperatura: { label: 'Temperature', icon: '🌡️', bg: '#fff7ed', stripe: '#f97316', badgeBg: '#ffedd5', badgeColor: '#c2410c' },
          ph:          { label: 'pH',          icon: '🧪', bg: '#eff6ff', stripe: '#3b82f6', badgeBg: '#dbeafe', badgeColor: '#1d4ed8' },
          amonia:      { label: 'Ammonia',     icon: '⚗️', bg: '#fdf4ff', stripe: '#a855f7', badgeBg: '#f3e8ff', badgeColor: '#7e22ce' },
        };
        const countByType = { temperatura: 0, ph: 0, amonia: 0 };
        sensores.forEach(s => { const t = getSensorType(s); if (countByType[t] !== undefined) countByType[t]++; });
        return (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>IoT Sensors</h2>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                {sensores.length} registered sensor{sensores.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              className={`${styles.btn} ${styles.btnSuccess}`}
              onClick={() => { setSensorForm({ id_tipo_sensor: 'temperatura', apelido: '', fotoFile: null }); setShowCreateSensor(true); }}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
              New Sensor
            </button>
          </div>

          {/* Stats rápidas */}
          {sensores.length > 0 && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              {Object.entries(SENSOR_CFG).map(([key, cfg]) => (
                <div key={key} style={{ flex: 1, minWidth: 120, background: cfg.bg, borderRadius: 12, padding: '12px 16px', border: `1px solid ${cfg.badgeBg}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{cfg.icon}</span>
                  <div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: cfg.badgeColor, lineHeight: 1 }}>{countByType[key]}</div>
                    <div style={{ fontSize: '0.72rem', color: cfg.badgeColor, opacity: 0.8, marginTop: 2 }}>{cfg.label}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {sensores.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>📡</div>
              <p className={styles.emptyStateText}>No sensors registered yet.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 12 }}>
              {sensores.map(s => {
                const tipo = getSensorType(s);
                const cfg = SENSOR_CFG[tipo] || SENSOR_CFG.temperatura;
                return (
                  <div key={s._id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', transition: 'box-shadow 0.2s, transform 0.15s', position: 'relative' }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}
                  >
                    {/* Stripe superior colorida */}
                    <div style={{ height: 4, background: cfg.stripe }} />
                    <div style={{ padding: '14px 16px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                          {cfg.icon}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {s.apelido || 'No nickname'}
                          </div>
                          <span style={{ display: 'inline-block', background: cfg.badgeBg, color: cfg.badgeColor, padding: '2px 9px', borderRadius: 20, fontSize: '10.5px', fontWeight: 700, textTransform: 'capitalize', letterSpacing: '0.03em' }}>
                            {cfg.label}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
                          style={{ flex: 1 }}
                          onClick={() => { setSensorForm({ id: s._id, id_tipo_sensor: tipo, apelido: s.apelido || '', fotoFile: null }); setShowCreateSensor(true); }}
                        >
                          <svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path d="M15.232 5.232a3 3 0 1 1 4.243 4.243L7.5 21H3v-4.5L15.232 5.232Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          Edit
                        </button>
                        <button
                          className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`}
                          style={{ flex: 1 }}
                          onClick={() => { setLinkForm({ sensorId: s._id, cativeiroId: '', currentSensorIds: [] }); setShowLinkModal(true); }}
                        >
                          <svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                          Link
                        </button>
                        <button
                          className={`${styles.btn} ${styles.btnSm}`}
                          style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}
                          onClick={() => { setDeleteSensorData({ id: s._id, apelido: s.apelido || 'No nickname', tipo: cfg.label }); setShowDeleteSensorModal(true); }}
                        >
                          <svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        );
      })()}

      {tab === 'calibracoes' && (
        <Calibracoes />
      )}

      {tab === 'dietas' && (
        <DietasMaster onNotify={setMasterNotification} />
      )}

      {tab === 'chat' && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Chat with Admins</h2>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                {chatConversations.length} conversation{chatConversations.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className={styles.chatLayout}>
            {/* Sidebar de conversas */}
            <div className={styles.chatSidebar}>
              <div className={styles.chatSidebarHeader}>Conversations</div>
              <div className={styles.chatConvList}>
                {chatConversations.length === 0 ? (
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>No conversations yet.</div>
                ) : (
                  chatConversations.map(c => (
                    <button
                      key={c._id}
                      onClick={() => openConversation(c._id)}
                      className={`${styles.chatConvItem} ${chatSelectedId === c._id ? styles.chatConvItemActive : ''}`}
                    >
                      <div className={styles.chatConvTitle}>{getConversationTitle(c)}</div>
                      <div className={styles.chatConvTime}>
                        {new Date(c.updatedAt || c.lastMessageAt).toLocaleString('en-US', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </button>
                  ))
                )}
              </div>
              <div className={styles.chatStartSection}>
                <div className={styles.chatStartLabel}>New conversation</div>
                <select
                  onChange={(e) => { const val = e.target.value; if (val) { startConversationWithAdmin(val); e.target.value = ''; } }}
                  className={styles.formSelect}
                  style={{ width: '100%' }}
                >
                  <option value="">Select an admin...</option>
                  {(users || []).filter(u => u.role === 'admin').map(u => (
                    <option key={u.id || u._id} value={u.id || u._id}>{u.nome || u.email}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Área principal do chat */}
            <div className={styles.chatMain}>
              <div className={styles.chatMainHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {chatSelectedId ? (
                    <>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem', color: '#1d4ed8', flexShrink: 0 }}>
                        {(getConversationTitle(chatConversations.find(c => c._id === chatSelectedId) || {}) || '?')[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#1e293b', lineHeight: 1.2 }}>
                          {getConversationTitle(chatConversations.find(c => c._id === chatSelectedId) || {})}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Admin</div>
                      </div>
                    </>
                  ) : (
                    <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Select a conversation</span>
                  )}
                </div>
                {chatSelectedId && (
                  <button
                    className={`${styles.btn} ${styles.btnSm}`}
                    style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}
                    onClick={() => setShowDeleteConvModal(true)}
                    title="Delete conversation"
                  >
                    <svg width="13" height="13" fill="none" viewBox="0 0 24 24"><path d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Delete conversation
                  </button>
                )}
              </div>

              <div className={styles.chatMessages}>
                {!chatSelectedId && (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                      <svg width="40" height="40" fill="none" viewBox="0 0 24 24" style={{ marginBottom: 8, opacity: 0.4 }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      <p style={{ margin: 0, fontSize: '0.85rem' }}>Select a conversation to start</p>
                    </div>
                  </div>
                )}
                {chatSelectedId && chatMessages.map(m => {
                  const isMine = String(m.senderId) === String(getMyId());
                  return (
                    <div key={m._id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                      <div className={`${styles.chatBubbleSender} ${isMine ? styles.chatBubbleSenderMine : ''}`}>
                        {getDisplayName(m.senderId)}
                      </div>
                      <div className={`${styles.chatBubble} ${isMine ? styles.chatBubbleMine : styles.chatBubbleOther}`}>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
                        <div className={`${styles.chatBubbleTime} ${isMine ? styles.chatBubbleTimeMine : styles.chatBubbleTimeOther}`}>
                          {new Date(m.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              <div className={styles.chatInputArea}>
                <textarea
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
                  }}
                  placeholder={chatSelectedId ? 'Type your message... (Enter to send)' : 'Select a conversation'}
                  rows={2}
                  disabled={!chatSelectedId}
                  className={styles.chatTextarea}
                />
                <button
                  onClick={sendChatMessage}
                  disabled={!chatSelectedId || !chatText.trim()}
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  style={{ alignSelf: 'flex-end', minWidth: 80 }}
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Send
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

        </div>{/* /content */}
      </div>{/* /main */}

      {/* Modal Criar / Editar Sensor */}
      <Modal
        isOpen={showCreateSensor}
        onClose={() => setShowCreateSensor(false)}
        title={sensorForm?.id ? 'Edit Sensor' : 'New Sensor'}
        showCloseButton
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Sensor type</label>
            <select
              value={sensorForm.id_tipo_sensor}
              onChange={(e) => setSensorForm(f => ({ ...f, id_tipo_sensor: e.target.value }))}
              className={styles.userRowSelect}
              style={{ width: '100%' }}
            >
              <option value="temperatura">🌡️ Temperature</option>
              <option value="ph">🧪 pH</option>
              <option value="amonia">⚗️ Ammonia</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Nickname</label>
            <input
              value={sensorForm.apelido}
              onChange={(e) => setSensorForm(f => ({ ...f, apelido: e.target.value }))}
              placeholder="e.g.: Tank A Sensor"
              className={styles.filterInput}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Sensor image <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span></label>
            <input type="file" accept="image/*" onChange={(e) => setSensorForm(f => ({ ...f, fotoFile: e.target.files?.[0] || null }))} style={{ fontSize: '0.85rem' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setShowCreateSensor(false)}>Cancel</button>
            <button
              className={`${styles.btn} ${styles.btnSuccess}`}
              onClick={async () => {
                try {
                  const token = getToken();
                  const form = new FormData();
                  form.append('id_tipo_sensor', sensorForm.id_tipo_sensor);
                  form.append('apelido', sensorForm.apelido || '');
                  if (sensorForm.fotoFile) form.append('foto_sensor', sensorForm.fotoFile);
                  if (sensorForm?.id) {
                    await axios.put(`${apiUrl}/sensores/${sensorForm.id}`, form, { headers: { Authorization: `Bearer ${token}` } });
                  } else {
                    await axios.post(`${apiUrl}/sensores`, form, { headers: { Authorization: `Bearer ${token}` } });
                  }
                  setShowCreateSensor(false);
                  await load();
                  setTab('sensores');
                } catch (e) {
                  alert('Error saving sensor: ' + (e?.response?.data?.error || e.message));
                }
              }}
            >
              {sensorForm?.id ? 'Save changes' : 'Create sensor'}
            </button>
          </div>
        </div>
      </Modal>

      {showLinkModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: 20, borderRadius: 8, width: '95%', maxWidth: 480 }}>
            <h3 style={{ marginTop: 0 }}>Link sensor to pond</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Pond</label>
                <select value={linkForm.cativeiroId} onChange={(e) => setLinkForm(f => ({ ...f, cativeiroId: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }}>
                  <option value="">Select</option>
                  {cativeiros.map(c => (
                    <option key={c._id} value={c._id}>{c.nome || c._id}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button onClick={() => setShowLinkModal(false)} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={async () => {
                try {
                  const token = getToken();
                  const cId = linkForm.cativeiroId;
                  if (!cId) {
                    setMasterNotification({ show: true, message: 'Select a pond.', type: 'error' });
                    return;
                  }
                  // Verifica se o sensor já está vinculado a este cativeiro
                  const existingRes = await axios.get(`${apiUrl}/cativeiros/${cId}/sensores`, { headers: { Authorization: `Bearer ${token}` } });
                  const existingIds = (Array.isArray(existingRes.data) ? existingRes.data : [])
                    .map(item => String((item?.id_sensor?._id || item?.id_sensor || item?._id || item) || ''));
                  if (existingIds.includes(String(linkForm.sensorId))) {
                    setMasterNotification({ show: true, message: 'This sensor is already linked to this pond.', type: 'error' });
                    return;
                  }
                  await axios.post(`${apiUrl}/sensoresxCativeiros`, { id_sensor: linkForm.sensorId, id_cativeiro: cId }, { headers: { Authorization: `Bearer ${token}` } });
                  setShowLinkModal(false);
                  await load();
                  setTab('cativeiros');
                  setExpandedCativeiro(prev => ({ ...prev, [String(cId)]: true }));
                  try {
                    const cat = (Array.isArray(cativeiros) ? cativeiros : []).find(x => String(x._id) === String(cId));
                    const fzId = String(cat?.fazenda?._id || cat?.fazenda || '');
                    if (fzId) setExpandedFazenda(prev => ({ ...prev, [fzId]: true }));
                  } catch {}
                  await loadSensorsForCativeiro(cId);
                  setMasterNotification({ show: true, message: 'Sensor linked successfully!', type: 'success' });
                } catch (e) {
                  setMasterNotification({ show: true, message: 'Error linking: ' + (e?.response?.data?.error || e.message), type: 'error' });
                }
              }} style={{ border: 'none', background: '#3b82f6', color: '#fff', borderRadius: 6, padding: '8px 12px', cursor: 'pointer' }}>Link</button>
            </div>
          </div>
        </div>
      )}
      {/* Modal de edição de fazenda */}
      {showEditFazendaModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 8, width: '95%', maxWidth: 480 }}>
            <h3 style={{ marginTop: 0 }}>Edit farm</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Name</label>
                <input value={editFazendaForm.nome} onChange={e => setEditFazendaForm(f => ({ ...f, nome: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box' }} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Street</label>
                <input value={editFazendaForm.rua} onChange={e => setEditFazendaForm(f => ({ ...f, rua: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Neighborhood</label>
                <input value={editFazendaForm.bairro} onChange={e => setEditFazendaForm(f => ({ ...f, bairro: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>City</label>
                <input value={editFazendaForm.cidade} onChange={e => setEditFazendaForm(f => ({ ...f, cidade: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Number</label>
                <input value={editFazendaForm.numero} onChange={e => setEditFazendaForm(f => ({ ...f, numero: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box' }} />
              </div>
              {(() => {
                const allAdmins = (users || []).filter(u => u.role === 'admin');
                if (allAdmins.length === 0) return null;
                const hasLinkedAdmin = getFazendaAdmins(editFazendaForm.id).length > 0;
                return (
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Responsible admin</label>
                    <select
                      value={editFazendaForm.adminId}
                      onChange={e => setEditFazendaForm(f => ({ ...f, adminId: e.target.value }))}
                      style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box' }}
                    >
                      {!hasLinkedAdmin && <option value="">No responsible admin (optional)</option>}
                      {allAdmins.map(a => (
                        <option key={a.id || a._id} value={a.id || a._id}>{a.nome} — {a.email}</option>
                      ))}
                    </select>
                  </div>
                );
              })()}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowEditFazendaModal(false)} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleUpdateFazenda} style={{ border: 'none', background: '#3b82f6', color: '#fff', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontWeight: 600 }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação de mudança de role */}
      {pendingRoleChange && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={() => setPendingRoleChange(null)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '28px 28px 24px', maxWidth: 400, width: '90%', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.05rem', fontWeight: 700, color: '#1e293b' }}>Change permission</h3>
            <hr style={{ border: 'none', borderTop: '1px solid #f1f5f9', margin: '0 0 18px' }} />
            <p style={{ margin: '0 0 20px', fontSize: '0.9rem', color: '#475569', lineHeight: 1.6 }}>
              Are you sure you want to change the permission of <strong style={{ color: '#1e293b' }}>{pendingRoleChange.userName}</strong> from <strong style={{ color: '#1e293b' }}>{({ membro: 'Member', admin: 'Admin', master: 'Master' })[pendingRoleChange.currentRole] || pendingRoleChange.currentRole}</strong> to <strong style={{ color: '#1e293b' }}>{({ membro: 'Member', admin: 'Admin', master: 'Master' })[pendingRoleChange.newRole] || pendingRoleChange.newRole}</strong>?
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setPendingRoleChange(null)}
                style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontFamily: 'Poppins, sans-serif', fontSize: '0.855rem', fontWeight: 500, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={async () => { await changeRole(pendingRoleChange.userId, pendingRoleChange.newRole); setPendingRoleChange(null); }}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(90deg, var(--salmao-camarize) 0%, #a3c7f7 100%)', color: '#0f172a', fontFamily: 'Poppins, sans-serif', fontSize: '0.855rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de criação de fazenda */}
      {showCreateFazendaModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 8, width: '95%', maxWidth: 480 }}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>New farm</h3>
            <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0 0 16px 0' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Name</label>
                <input value={newFazendaForm.nome} onChange={e => setNewFazendaForm(f => ({ ...f, nome: e.target.value }))} placeholder="Farm name" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box' }} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Street</label>
                <input value={newFazendaForm.rua} onChange={e => setNewFazendaForm(f => ({ ...f, rua: e.target.value }))} placeholder="Street" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Neighborhood</label>
                <input value={newFazendaForm.bairro} onChange={e => setNewFazendaForm(f => ({ ...f, bairro: e.target.value }))} placeholder="Neighborhood" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>City</label>
                <input value={newFazendaForm.cidade} onChange={e => setNewFazendaForm(f => ({ ...f, cidade: e.target.value }))} placeholder="City" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Number</label>
                <input value={newFazendaForm.numero} onChange={e => setNewFazendaForm(f => ({ ...f, numero: e.target.value }))} placeholder="Number" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box' }} />
              </div>
              {(() => {
                const allAdmins = (users || []).filter(u => u.role === 'admin');
                if (allAdmins.length === 0) return null;
                return (
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Responsible admin</label>
                    <select
                      value={newFazendaForm.adminId}
                      onChange={e => setNewFazendaForm(f => ({ ...f, adminId: e.target.value }))}
                      style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box' }}
                    >
                      <option value="">No responsible admin (optional)</option>
                      {allAdmins.map(a => (
                        <option key={a.id || a._id} value={a.id || a._id}>{a.nome} — {a.email}</option>
                      ))}
                    </select>
                  </div>
                );
              })()}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowCreateFazendaModal(false)} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={handleCreateFazenda}
                disabled={!newFazendaForm.nome || !newFazendaForm.rua || !newFazendaForm.bairro || !newFazendaForm.cidade || !newFazendaForm.numero}
                style={{ border: 'none', background: '#3b82f6', color: '#fff', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontWeight: 600 }}
              >Create farm</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de criação de cativeiro */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 8, width: '95%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Create pond</h3>
            <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0 0 16px 0' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Farm</label>
                <select value={createForm.fazendaId} onChange={(e) => setCreateForm(f => ({ ...f, fazendaId: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }}>
                  {fazendas.map(f => (
                    <option key={f._id} value={f._id}>{getFazendaName(f._id)}</option>
                  ))}
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Name</label>
                <input value={createForm.nome} onChange={(e) => setCreateForm(f => ({ ...f, nome: e.target.value }))} placeholder="Pond name" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Shrimp type</label>
                <select value={createForm.id_tipo_camarao} onChange={(e) => setCreateForm(f => ({ ...f, id_tipo_camarao: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }}>
                  {tiposCamarao.map(t => (
                    <option key={t._id} value={t._id}>{t.nome}</option>
                  ))}
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Installation date</label>
                <input type="date" value={createForm.data_instalacao} onChange={(e) => setCreateForm(f => ({ ...f, data_instalacao: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Ideal temp (°C)</label>
                <input value={createForm.temp_media_diaria} onChange={(e) => setCreateForm(f => ({ ...f, temp_media_diaria: e.target.value }))} placeholder="e.g.: 26" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Ideal pH</label>
                <input value={createForm.ph_medio_diario} onChange={(e) => setCreateForm(f => ({ ...f, ph_medio_diario: e.target.value }))} placeholder="e.g.: 7.5" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Ideal ammonia (mg/L)</label>
                <input value={createForm.amonia_media_diaria} onChange={(e) => setCreateForm(f => ({ ...f, amonia_media_diaria: e.target.value }))} placeholder="e.g.: 0.05" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Pond image</label>
                <input type="file" accept="image/*" onChange={(e) => setCreateForm(f => ({ ...f, fotoFile: e.target.files?.[0] || null }))} style={{ width: '100%' }} />
              </div>
              <p style={{ gridColumn: 'span 2', margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                The pond&apos;s diet is set later, in the Diets tab.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowCreateModal(false)} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={submitCreateModal} style={{ border: 'none', background: '#10b981', color: '#fff', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontWeight: 600 }}>Create</button>
            </div>
          </div>
        </div>
      )}
      {/* Modal de edição de cativeiro */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit pond">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Name</label>
            <input value={editForm.nome} onChange={(e) => setEditForm(f => ({ ...f, nome: e.target.value }))} placeholder="Pond name" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Shrimp type</label>
            <select value={editForm.id_tipo_camarao} onChange={(e) => setEditForm(f => ({ ...f, id_tipo_camarao: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }}>
              {tiposCamarao.map(t => (
                <option key={t._id} value={t._id}>{t.nome}</option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Installation date</label>
            <input type="date" value={editForm.data_instalacao} onChange={(e) => setEditForm(f => ({ ...f, data_instalacao: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Ideal temp (°C)</label>
            <input value={editForm.temp_media_diaria} onChange={(e) => setEditForm(f => ({ ...f, temp_media_diaria: e.target.value }))} placeholder="e.g.: 26" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Ideal pH</label>
            <input value={editForm.ph_medio_diario} onChange={(e) => setEditForm(f => ({ ...f, ph_medio_diario: e.target.value }))} placeholder="e.g.: 7.5" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Ideal ammonia (mg/L)</label>
            <input value={editForm.amonia_media_diaria} onChange={(e) => setEditForm(f => ({ ...f, amonia_media_diaria: e.target.value }))} placeholder="e.g.: 0.05" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
          </div>
          <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button onClick={() => setShowEditModal(false)} style={{ border: '1px solid #e5e7eb', background: '#fff', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>Cancel</button>
            <button onClick={async () => {
              try {
                const token = getToken();
                await axios.patch(`${apiUrl}/cativeiros/${editForm.id}`, {
                  nome: editForm.nome,
                  id_tipo_camarao: editForm.id_tipo_camarao,
                  data_instalacao: new Date(editForm.data_instalacao).toISOString(),
                  temp_media_diaria: editForm.temp_media_diaria,
                  ph_medio_diario: editForm.ph_medio_diario,
                  amonia_media_diaria: editForm.amonia_media_diaria
                }, { headers: { Authorization: `Bearer ${token}` } });
                setShowEditModal(false);
                await load();
              } catch (e) {
                console.error('Falha ao editar cativeiro:', e);
                alert('Error editing pond.');
              }
            }} style={{ border: 'none', background: '#3b82f6', color: '#fff', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>Save</button>
          </div>
        </div>
      </Modal>
      {/* Modal de limites de avisos (temperatura e sensibilidade de pH/amônia) */}
      <Modal isOpen={showLimitesModal} onClose={() => setShowLimitesModal(false)} title={`Alert limits — ${limitesForm.nome}`}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: 'span 2', fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>
            Defines when trend detection opens an alert for this pond. Leave a pair of
            fields blank to keep the system default for that parameter.
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Min. temp (°C)</label>
            <input type="number" step="0.1" value={limitesForm.minimo}
              onChange={(e) => setLimitesForm(f => ({ ...f, minimo: e.target.value }))}
              placeholder="default: ideal − 2°C" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Max. temp (°C)</label>
            <input type="number" step="0.1" value={limitesForm.maximo}
              onChange={(e) => setLimitesForm(f => ({ ...f, maximo: e.target.value }))}
              placeholder="default: ideal + 2°C" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
          </div>
          {limitesSugestoes?.temperatura && (
            <div style={{ gridColumn: 'span 2', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem', color: '#1e40af', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span>{limitesSugestoes.temperatura.motivo} Suggestion: {limitesSugestoes.temperatura.valorSugerido.minimo}°C to {limitesSugestoes.temperatura.valorSugerido.maximo}°C.</span>
              <button onClick={aplicarSugestaoTemperatura} style={{ border: '1px solid #1d4ed8', background: '#fff', color: '#1d4ed8', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>Apply suggestion</button>
            </div>
          )}
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>pH threshold</label>
            <input type="number" step="0.01" min="0.05" max="3" value={limitesForm.phLimiar}
              onChange={(e) => setLimitesForm(f => ({ ...f, phLimiar: e.target.value }))}
              placeholder="default: 0.35" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Ammonia threshold (%)</label>
            <input type="number" step="0.01" min="0.05" max="1" value={limitesForm.amoniaLimiarPct}
              onChange={(e) => setLimitesForm(f => ({ ...f, amoniaLimiarPct: e.target.value }))}
              placeholder="default: 0.25 (25%)" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
          </div>
          {['ph', 'amonia'].map(tipo => limitesSugestoes?.[tipo] && (
            <div key={tipo} style={{ gridColumn: 'span 2', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem', color: '#1e40af', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span>{limitesSugestoes[tipo].motivo} {tipo === 'ph' ? 'pH' : 'Ammonia'} suggestion: {limitesSugestoes[tipo].valorSugerido}.</span>
              <button onClick={() => aplicarSugestaoSensibilidade(tipo)} style={{ border: '1px solid #1d4ed8', background: '#fff', color: '#1d4ed8', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>Apply suggestion</button>
            </div>
          ))}
          <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button onClick={() => setShowLimitesModal(false)} disabled={limitesSubmitting} style={{ border: '1px solid #e5e7eb', background: '#fff', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>Cancel</button>
            <button onClick={salvarLimitesAvisos} disabled={limitesSubmitting} style={{ border: 'none', background: '#3b82f6', color: '#fff', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>
              {limitesSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>
      {/* Modal de trilha de auditoria da chave do dispositivo */}
      {chaveCativeiro && <ChaveDispositivo cativeiro={chaveCativeiro} onClose={() => setChaveCativeiro(null)} />}
      {/* Modal de aprovação de funcionário */}
      <Modal isOpen={showApproveFuncionarioModal} onClose={() => {
        setShowApproveFuncionarioModal(false);
        setPendingApproveRequestId(null);
        setSelectedFazendaId('');
      }} title={(() => {
        const request = items.find(r => r._id === pendingApproveRequestId) || allRequests.find(r => r._id === pendingApproveRequestId);
        return request && request.action === 'associar_funcionario' 
          ? 'Approve Employee Link' 
          : 'Approve Employee Registration';
      })()}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
              Select Farm: <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select 
              value={selectedFazendaId} 
              onChange={(e) => setSelectedFazendaId(e.target.value)} 
              style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
            >
              <option value="">-- Select a farm --</option>
              {fazendas.map(f => (
                <option key={f._id} value={f._id}>
                  {getFazendaName(f._id)}
                </option>
              ))}
            </select>
            <p style={{ fontSize: '12px', color: '#666', marginTop: 4 }}>
              {(() => {
                const request = items.find(r => r._id === pendingApproveRequestId) || allRequests.find(r => r._id === pendingApproveRequestId);
                return request && request.action === 'associar_funcionario'
                  ? 'The employee will be linked to this farm and will have access to its ponds.'
                  : 'The employee will be assigned to this farm and will have access to its ponds.';
              })()}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              onClick={() => {
                setShowApproveFuncionarioModal(false);
                setPendingApproveRequestId(null);
                setSelectedFazendaId('');
              }}
              style={{
                padding: '8px 16px',
                background: '#6b7280',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleApproveFuncionario}
              disabled={!selectedFazendaId}
              style={{
                padding: '8px 16px',
                background: selectedFazendaId ? '#10b981' : '#9ca3af',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: selectedFazendaId ? 'pointer' : 'not-allowed'
              }}
            >
              Confirm Approval
            </button>
          </div>
        </div>
      </Modal>

      {/* Flash notification */}
      <Modal isOpen={showDeleteConvModal} onClose={() => setShowDeleteConvModal(false)} title="Delete conversation?" showCloseButton>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, fontSize: '0.95rem', color: '#4b5563', lineHeight: 1.5 }}>
            Are you sure you want to delete this conversation with <strong>{getConversationTitle(chatConversations.find(c => c._id === chatSelectedId) || {})}</strong>?
            The conversation will be deleted only for you. The other person will still see the messages.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setShowDeleteConvModal(false)}>Cancel</button>
            <button
              className={`${styles.btn}`}
              style={{ background: '#ef4444', color: '#fff', border: 'none' }}
              onClick={async () => {
                try {
                  const token = getToken();
                  await axios.delete(`${apiUrl}/chat/conversations/${chatSelectedId}`, { headers: { Authorization: `Bearer ${token}` } });
                  setChatConversations(prev => prev.filter(c => c._id !== chatSelectedId));
                  setChatSelectedId('');
                  setChatMessages([]);
                  setShowDeleteConvModal(false);
                  setMasterNotification({ show: true, message: 'Conversation deleted successfully!', type: 'success' });
                } catch (e) {
                  setShowDeleteConvModal(false);
                  setMasterNotification({ show: true, message: 'Error deleting conversation: ' + (e?.response?.data?.error || e.message), type: 'error' });
                }
              }}
            >Delete</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showDeleteSensorModal} onClose={() => setShowDeleteSensorModal(false)} title="Delete sensor?" showCloseButton>
        {deleteSensorData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ margin: 0, fontSize: '0.95rem', color: '#4b5563', lineHeight: 1.5 }}>
              Are you sure you want to delete the sensor <strong>&quot;{deleteSensorData.apelido}&quot;</strong> ({deleteSensorData.tipo})?
              This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setShowDeleteSensorModal(false)}>Cancel</button>
              <button
                className={`${styles.btn}`}
                style={{ background: '#ef4444', color: '#fff', border: 'none' }}
                onClick={async () => {
                  try {
                    const token = getToken();
                    await axios.delete(`${apiUrl}/sensores/${deleteSensorData.id}`, { headers: { Authorization: `Bearer ${token}` } });
                    setShowDeleteSensorModal(false);
                    setDeleteSensorData(null);
                    await load();
                    setMasterNotification({ show: true, message: 'Sensor deleted successfully!', type: 'success' });
                  } catch (e) { setMasterNotification({ show: true, message: 'Error deleting sensor: ' + (e?.response?.data?.error || e.message), type: 'error' }); }
                }}
              >Delete</button>
            </div>
          </div>
        )}
      </Modal>

      {confirmarCalib && (
        <ConfirmarCalibracao
          item={confirmarCalib}
          cativeiro={cativeiros.find(c => String(c._id) === String(confirmarCalib.payload?.cativeiroId))}
          enviando={decidindo === confirmarCalib._id}
          onCancelar={() => setConfirmarCalib(null)}
          onConfirmar={aplicarCalibracaoConfirmada}
        />
      )}

      <Notification
        isVisible={masterNotification.show}
        message={masterNotification.message}
        type={masterNotification.type}
        onClose={() => setMasterNotification({ show: false, message: '', type: 'success' })}
      />

      <Modal isOpen={showLogoutModal} onClose={() => !isLoggingOut && setShowLogoutModal(false)} title="Log out" closeOnBackdropClick={!isLoggingOut}>
        <p style={{ margin: 0, fontSize: '0.95rem', color: '#4b5563', fontFamily: 'Poppins, sans-serif', lineHeight: 1.5 }}>
          Are you sure you want to log out? You will need to log in again to access the system.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            onClick={() => setShowLogoutModal(false)}
            disabled={isLoggingOut}
            style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#f9fafb', color: '#374151', fontSize: '0.9rem', fontFamily: 'Poppins, sans-serif', fontWeight: 500, cursor: isLoggingOut ? 'not-allowed' : 'pointer', opacity: isLoggingOut ? 0.5 : 1 }}
          >
            Cancel
          </button>
          <button
            onClick={confirmLogout}
            disabled={isLoggingOut}
            style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontSize: '0.9rem', fontFamily: 'Poppins, sans-serif', fontWeight: 500, cursor: isLoggingOut ? 'not-allowed' : 'pointer', opacity: isLoggingOut ? 0.7 : 1, minWidth: 80 }}
          >
            {isLoggingOut ? 'Logging out...' : 'Log out'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
