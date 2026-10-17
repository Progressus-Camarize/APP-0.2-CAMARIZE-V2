import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import Modal from '../../components/Modal';
import axios from 'axios';
import { useAuth } from '@/hooks/useAuth';

import { HiOutlineClipboardList, HiOutlineBell, HiOutlineExclamationCircle, HiOutlineOfficeBuilding, HiOutlineChatAlt2, HiOutlineUser, HiOutlineChip, HiOutlineBeaker } from 'react-icons/hi';
import { useUnreadAvisos } from '@/hooks/useUnreadAvisos';
import styles from '../../styles/panel.module.css';
import Notification from '../../components/Notification';

export default function MasterPanel() {
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [allRequests, setAllRequests] = useState([]);
  const [filteredRequests, setFilteredRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [fazendas, setFazendas] = useState([]);
  const [cativeiros, setCativeiros] = useState([]);
  const [tiposCamarao, setTiposCamarao] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dietas, setDietas] = useState([]);
  const [dietaForm, setDietaForm] = useState({ descricao: '', quantidade: '', quantidadeRefeicoes: 1, horarios: [''] });
  const [editingDietaId, setEditingDietaId] = useState('');
  const [editingDieta, setEditingDieta] = useState({ descricao: '', quantidade: '', quantidadeRefeicoes: 1, horarios: [''] });
  const [, setDietaEditsByCat] = useState({});
  const [cativeiroDieta, setCativeiroDieta] = useState({}); // cId -> { dietaId, descricao, quantidade, horarios, quantidadeRefeicoes }
  const [assignForm, setAssignForm] = useState({ cativeiroId: '', dietaId: '' });
  const [showAssignConfirm, setShowAssignConfirm] = useState(false);
  const [assignConfirmData, setAssignConfirmData] = useState(null); // { cativeiroNome, dietaAtualNome, dietaNovaNome, cativeiroId, dietaId }
  const [showDeleteSensorModal, setShowDeleteSensorModal] = useState(false);
  const [deleteSensorData, setDeleteSensorData] = useState(null); // { id, apelido, tipo }
  const [showDeleteDietaModal, setShowDeleteDietaModal] = useState(false);
  const [deleteDietaData, setDeleteDietaData] = useState(null); // { id, descricao }
  const [masterNotification, setMasterNotification] = useState({ show: false, message: '', type: 'success' });
  const [previewImage, setPreviewImage] = useState({});
  const [photoErrors, setPhotoErrors] = useState({});
  const [uploadTargetCativeiro, setUploadTargetCativeiro] = useState(null);
  const [error, setError] = useState('');
  const [requesterFilter, setRequesterFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [tab, setTab] = useState('requests'); // requests | solicitacoes | usuarios | cativeiros | sensores | dietas
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
    if (String(senderId) === String(me)) return 'Você (Master)';
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
  const [sensores, setSensores] = useState([]);
  const [showCreateSensor, setShowCreateSensor] = useState(false);
  const [sensorForm, setSensorForm] = useState({ id_tipo_sensor: 'temperatura', apelido: '', fotoFile: null });
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showCreateDieta, setShowCreateDieta] = useState(false);
  const [showEditDietaModal, setShowEditDietaModal] = useState(false);
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
    dietaAtivar: false,
    dietaDescricao: '',
    dietaQuantidade: ''
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

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const abrirModalLimites = (c) => {
    setLimitesForm({
      id: c._id,
      nome: c.nome || '',
      minimo: c.condicoes_ideais?.temp_min ?? '',
      maximo: c.condicoes_ideais?.temp_max ?? '',
      phLimiar: c.condicoes_ideais?.ph_limiar ?? '',
      amoniaLimiarPct: c.condicoes_ideais?.amonia_limiar_pct ?? '',
    });
    setShowLimitesModal(true);
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
      alert('Erro ao salvar limites: ' + (e?.response?.data?.error || e.message));
    } finally {
      setLimitesSubmitting(false);
    }
  };

  const [showHistoricoChaveModal, setShowHistoricoChaveModal] = useState(false);
  const [historicoChaveCativeiro, setHistoricoChaveCativeiro] = useState({ id: '', nome: '' });
  const [historicoChave, setHistoricoChave] = useState([]);
  const [historicoChaveLoading, setHistoricoChaveLoading] = useState(false);

  const abrirHistoricoChave = async (c) => {
    setHistoricoChaveCativeiro({ id: c._id, nome: c.nome || '' });
    setShowHistoricoChaveModal(true);
    setHistoricoChaveLoading(true);
    try {
      const token = getToken();
      const res = await axios.get(`${apiUrl}/parametros/dispositivos/${c._id}/historico`, { headers: { Authorization: `Bearer ${token}` } });
      setHistoricoChave(res.data?.historico || []);
    } catch (e) {
      console.error('Erro ao carregar histórico da chave do dispositivo:', e);
      setHistoricoChave([]);
    } finally {
      setHistoricoChaveLoading(false);
    }
  };

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
      setLoading(true);
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [reqs, us, fzs, cats, tipos, sens, dts] = await Promise.all([
        axios.get(`${apiUrl}/requests`, { headers }), // Requests pendentes para aprovar/recusar
        axios.get(`${apiUrl}/users`, { headers }),
        axios.get(`${apiUrl}/fazendas`, { headers }),
        axios.get(`${apiUrl}/cativeiros`, { headers }),
        axios.get(`${apiUrl}/camaroes`, { headers }),
        axios.get(`${apiUrl}/sensores`, { headers }),
        axios.get(`${apiUrl}/dietas`, { headers }).catch(() => ({ data: [] })),
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
      setDietas(dts.data || []);
    } catch (e) {
      setError('Erro ao carregar dados');
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
      if (!me || !adminId) throw new Error('IDs inválidos');
      const res = await axios.post(`${apiUrl}/chat/conversations`, { adminId, masterId: me }, { headers });
      const convs = await axios.get(`${apiUrl}/chat/conversations/mine`, { headers });
      setChatConversations(convs.data || []);
      setTab('chat');
      if (res?.data?._id) openConversation(res.data._id);
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || 'Falha desconhecida';
      alert('Não foi possível iniciar a conversa: ' + msg);
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

  const avisoIcone = (tipo) => ({ temperatura: '🌡️', ph: '🧪', amonia: '⚗️', sensor_inativo: '📡' }[tipo] || '🔔');

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

  const act = async (id, op) => {
    const token = getToken();
    
    // Se for aprovar e a ação for associar_funcionario, usar a fazenda do request
    if (op === 'approve') {
      const request = items.find(r => r._id === id) || allRequests.find(r => r._id === id);
      if (request) {
        // Para associar_funcionario, usar a fazenda do admin solicitante (já vem no request)
        if (request.action === 'associar_funcionario') {
          const fazendaId = request.fazenda?._id || request.fazenda || null;
          if (!fazendaId) {
            alert('Erro: Fazenda não encontrada na solicitação.');
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
            alert('Erro ao aprovar: ' + (error?.response?.data?.error || error.message));
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
    
    // Para outras aprovações ou rejeições, fazer direto
    const response = await axios.post(`${apiUrl}/requests/${id}/${op}`, {}, { headers: { Authorization: `Bearer ${token}` } });
    console.log('Request atualizado:', response.data);
    await load();
    // Recarregar requests completos se estivermos na aba requests
    if (tab === 'requests') {
      const updatedRequests = await loadAllRequests();
      console.log('Requests recarregados:', updatedRequests);
      setAllRequests(updatedRequests);
    }
  };

  const handleApproveFuncionario = async () => {
    if (!selectedFazendaId) {
      alert('Por favor, selecione uma fazenda.');
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
      alert('Erro ao aprovar: ' + (error?.response?.data?.error || error.message));
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
        <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, marginTop: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ marginBottom: 6 }}><strong>Cativeiro:</strong> {nome}</div>
          <div><strong>Sensores solicitados:</strong></div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            {tipos.length > 0 ? tipos.map(t => (
              <span key={t} style={{ padding: '4px 8px', background: '#e5e7eb', borderRadius: 999, fontSize: 12, color: '#374151' }}>{t}</span>
            )) : <span style={{ color: '#6b7280' }}>Nenhum tipo informado</span>}
          </div>
        </div>
      );
    }
    if (action === 'editar_cativeiro_remove_sensor') {
      const nome = getCativeiroNomeById(payload?.cativeiroId);
      const tipos = Array.isArray(payload?.tipos) ? payload.tipos : [];
      return (
        <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, marginTop: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ marginBottom: 6 }}><strong>Cativeiro:</strong> {nome}</div>
          <div><strong>Trocar sensores:</strong></div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            {tipos.length > 0 ? tipos.map(t => (
              <span key={t} style={{ padding: '4px 8px', background: '#e5e7eb', borderRadius: 999, fontSize: 12, color: '#374151' }}>{t}</span>
            )) : <span style={{ color: '#6b7280' }}>Nenhum tipo informado</span>}
          </div>
        </div>
      );
    }
    if (action === 'cadastrar_cativeiro') {
      const fazenda = fazendas.find(f => f._id === payload.fazendaId);
      const tipoCamarao = tiposCamarao.find(t => t._id === payload.id_tipo_camarao);
      
      return (
        <div style={{ 
          background: '#f8fafc', 
          padding: 12, 
          borderRadius: 6, 
          marginTop: 8,
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <strong>Nome:</strong> {payload.nome || 'N/A'}
            </div>
            <div>
              <strong>Fazenda:</strong> {fazenda ? `${fazenda.nome} - ${fazenda.codigo}` : payload.fazendaId || 'N/A'}
            </div>
            <div>
              <strong>Tipo de Camarão:</strong> {tipoCamarao ? tipoCamarao.nome : payload.id_tipo_camarao || 'N/A'}
            </div>
            <div>
              <strong>Data de Instalação:</strong> {payload.data_instalacao ? new Date(payload.data_instalacao).toLocaleDateString('pt-BR') : 'N/A'}
            </div>
            <div>
              <strong>Temp Ideal:</strong> {payload.temp_media_diaria ? `${payload.temp_media_diaria}°C` : 'N/A'}
            </div>
            <div>
              <strong>pH Ideal:</strong> {payload.ph_medio_diario || 'N/A'}
            </div>
            <div>
              <strong>Amônia Ideal:</strong> {payload.amonia_media_diaria ? `${payload.amonia_media_diaria} mg/L` : 'N/A'}
            </div>
          </div>
        </div>
      );
    } else if (action === 'editar_cativeiro') {
      const cativeiroNome = payload.cativeiroNome || getCativeiroNomeById(payload.cativeiroId);
      const tipoCamarao = payload.id_tipo_camarao ? (tiposCamarao.find(t => String(t._id) === String(payload.id_tipo_camarao)) || null) : null;
      return (
        <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, marginTop: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ marginBottom: 6 }}><strong>Cativeiro:</strong> {cativeiroNome}</div>
          <div><strong>Alterações solicitadas:</strong></div>
          <ul style={{ marginTop: 6, marginLeft: 18 }}>
            {typeof payload?.nome !== 'undefined' && <li><strong>Nome:</strong> {payload.nome || 'N/A'}</li>}
            {typeof payload?.id_tipo_camarao !== 'undefined' && (
              <li><strong>Tipo de Camarão:</strong> {tipoCamarao ? tipoCamarao.nome : payload.id_tipo_camarao}</li>
            )}
            {typeof payload?.data_instalacao !== 'undefined' && (
              <li><strong>Data de instalação:</strong> {payload.data_instalacao ? new Date(payload.data_instalacao).toLocaleDateString('pt-BR') : 'N/A'}</li>
            )}
            {typeof payload?.temp_media_diaria !== 'undefined' && <li><strong>Temp ideal (°C):</strong> {payload.temp_media_diaria}</li>}
            {typeof payload?.ph_medio_diario !== 'undefined' && <li><strong>pH ideal:</strong> {payload.ph_medio_diario}</li>}
            {typeof payload?.amonia_media_diaria !== 'undefined' && <li><strong>Amônia ideal (mg/L):</strong> {payload.amonia_media_diaria}</li>}
          </ul>
        </div>
      );
    } else if (action === 'editar_dieta') {
      const horarios = Array.isArray(payload?.horarios) ? payload.horarios.filter(h => h) : [];
      return (
        <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, marginTop: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ marginBottom: 6 }}><strong>Cativeiro:</strong> {payload?.cativeiroNome || payload?.cativeiroId || 'N/A'}</div>
          <div><strong>Alterações solicitadas:</strong></div>
          <ul style={{ marginTop: 6, marginLeft: 18 }}>
            {payload?.descricao && <li><strong>Descrição:</strong> {payload.descricao}</li>}
            {typeof payload?.quantidade !== 'undefined' && <li><strong>Quantidade:</strong> {payload.quantidade}g por refeição</li>}
            {typeof payload?.quantidadeRefeicoes !== 'undefined' && <li><strong>Refeições/dia:</strong> {payload.quantidadeRefeicoes}</li>}
            {horarios.length > 0 && <li><strong>Horários:</strong> {horarios.join(', ')}</li>}
          </ul>
        </div>
      );
    } else if (action === 'editar_sensor') {
      // Mostrar tipo e apelido do sensor em vez do _id
      const sensorMatch = (sensores || []).find(s => String(s._id) === String(payload.id) || String(s.id) === String(payload.id));
      const tipo = sensorMatch ? (typeof sensorMatch.id_tipo_sensor === 'object' ? sensorMatch.id_tipo_sensor.descricao : sensorMatch.id_tipo_sensor) : null;
      const apelido = sensorMatch ? (sensorMatch.apelido || '') : (payload.apelido || 'N/A');
      return (
        <div style={{ 
          background: '#f8fafc', 
          padding: 12, 
          borderRadius: 6, 
          marginTop: 8,
          border: '1px solid #e2e8f0'
        }}>
          <div><strong>Sensor:</strong> {tipo ? `${tipo} — ${apelido}` : (payload.id || 'N/A')}</div>
          {payload.apelido && <div><strong>Novo Apelido:</strong> {payload.apelido}</div>}
        </div>
      );
    } else if (action === 'cadastrar_funcionario') {
      return (
        <div style={{ 
          background: '#f8fafc', 
          padding: 12, 
          borderRadius: 6, 
          marginTop: 8,
          border: '1px solid #e2e8f0'
        }}>
          <div><strong>Nome:</strong> {payload.nome || 'N/A'}</div>
          <div><strong>Email:</strong> {payload.email || 'N/A'}</div>
          <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
            Selecione a fazenda ao aprovar.
          </div>
        </div>
      );
    } else if (action === 'associar_funcionario') {
      return (
        <div style={{ 
          background: '#f8fafc', 
          padding: 12, 
          borderRadius: 6, 
          marginTop: 8,
          border: '1px solid #e2e8f0'
        }}>
          <div><strong>Email do Funcionário:</strong> {payload.email || 'N/A'}</div>
          <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
            Selecione a fazenda ao aprovar para associar este funcionário.
          </div>
        </div>
      );
    } else if (action === 'cadastrar_proprietario') {
      return (
        <div style={{ 
          background: '#f8fafc', 
          padding: 12, 
          borderRadius: 6, 
          marginTop: 8,
          border: '1px solid #e2e8f0'
        }}>
          <div><strong>Nome:</strong> {payload.nome || 'N/A'}</div>
          <div><strong>Email:</strong> {payload.email || 'N/A'}</div>
          {payload.fazenda && (
            <div style={{ marginTop: 8 }}>
              <strong>Fazenda:</strong> {payload.fazenda.nome || 'N/A'}
            </div>
          )}
        </div>
      );
    } else {
      // Fallback para outras ações
      return (
        <pre style={{ 
          background: '#f9fafb', 
          padding: 8, 
          borderRadius: 4, 
          fontSize: '12px',
          marginTop: 4,
          overflow: 'auto',
          maxHeight: '200px'
        }}>
          {JSON.stringify(payload, null, 2)}
        </pre>
      );
    }
  };

  const getActionLabel = (action) => {
    const map = {
      editar_cativeiro_add_sensor: 'Solicitar vínculo de sensor',
      editar_cativeiro_remove_sensor: 'Solicitar troca de sensor(es)',
      cadastrar_cativeiro: 'Cadastrar cativeiro',
      editar_cativeiro: 'Editar cativeiro',
      editar_sensor: 'Editar sensor',
      editar_dieta: 'Gerenciar dieta de cativeiro',
      cadastrar_funcionario: 'Cadastrar funcionário',
      associar_funcionario: 'Associar funcionário à fazenda',
      cadastrar_proprietario: 'Cadastrar proprietário',
    };
    return map[action] || action;
  };

  const statusChipStyle = (status) => ({
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: '12px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    background: status === 'aprovado' ? '#dcfce7' : status === 'recusado' ? '#fee2e2' : '#fef3c7',
    color: status === 'aprovado' ? '#166534' : status === 'recusado' ? '#991b1b' : '#92400e',
  });

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
      setMasterNotification({ show: true, message: 'Selecione um arquivo de imagem válido.', type: 'error' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMasterNotification({ show: true, message: 'Imagem muito grande. Máximo 5MB.', type: 'error' });
      return;
    }
    if (!uploadTargetCativeiro) {
      setMasterNotification({ show: true, message: 'Nenhum cativeiro selecionado.', type: 'error' });
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
      form.append('foto', file);
      await axios.post(`${apiUrl}/cativeiros/${cativeiroId}/foto`, form, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      setMasterNotification({ show: true, message: 'Foto atualizada com sucesso!', type: 'success' });
      await load();
    } catch {
      setMasterNotification({ show: true, message: 'Falha ao atualizar foto. Tente novamente.', type: 'error' });
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
      const res = await axios.get(`${apiUrl}/dietas/atual/${cativeiroId}`);
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
    if (!f) return 'Sem fazenda';
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
      alert('Erro ao atualizar fazenda: ' + (e?.response?.data?.error || e.message));
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
      alert('Erro ao criar fazenda: ' + (e?.response?.data?.error || e.message));
    }
  };

  const handleDeleteFazenda = async (id, nome) => {
    if (!window.confirm(`Excluir a fazenda "${nome}"? Esta ação removerá todos os vínculos de usuários com ela.`)) return;
    try {
      const token = getToken();
      await axios.delete(`${apiUrl}/fazendas/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      await load();
    } catch (e) {
      alert('Erro ao excluir fazenda: ' + (e?.response?.data?.error || e.message));
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
      form.append('nome', createForm.nome && createForm.nome.trim() ? createForm.nome.trim() : 'Novo cativeiro');
      form.append('id_tipo_camarao', createForm.id_tipo_camarao);
      form.append('data_instalacao', new Date(createForm.data_instalacao).toISOString());
      if (createForm.temp_media_diaria) form.append('temp_media_diaria', createForm.temp_media_diaria);
      if (createForm.ph_medio_diario) form.append('ph_medio_diario', createForm.ph_medio_diario);
      if (createForm.amonia_media_diaria) form.append('amonia_media_diaria', createForm.amonia_media_diaria);
      if (createForm.fotoFile) form.append('foto_cativeiro', createForm.fotoFile);
      if (createForm.dietaAtivar && (createForm.dietaDescricao || createForm.dietaQuantidade)) {
        // master pode mandar dieta_texto para criar e atribuir imediatamente
        form.append('dieta_texto', `${createForm.dietaDescricao} (${createForm.dietaQuantidade} g)`);
      }

      await axios.post(`${apiUrl}/cativeiros`, form, { headers: { Authorization: `Bearer ${token}` } });
      setShowCreateModal(false);
      await load();
      setExpandedFazenda(prev => ({ ...prev, [String(createForm.fazendaId)]: true }));
    } catch (e) {
      console.error('Falha ao criar cativeiro:', e);
      alert('Erro ao criar cativeiro. Verifique os dados e tente novamente.');
    }
  };

  const localRole = typeof window !== 'undefined' ? (JSON.parse(sessionStorage.getItem('usuarioCamarize') || localStorage.getItem('usuarioCamarize') || '{}')?.role) : undefined;
  const effectiveRole = user?.role || localRole;
  if (authLoading || loading || !isAuthenticated || !effectiveRole || effectiveRole !== 'master') return <div className={styles.loadingScreen}>Carregando...</div>;
  if (error) return <div className={styles.loadingScreen} style={{ color: '#ef4444' }}>{error}</div>;

  const masterNavItems = [
    { id: 'requests', icon: HiOutlineClipboardList, label: 'Histórico' },
    { id: 'avisos', icon: HiOutlineExclamationCircle, label: 'Avisos', badge: avisosNaoVistos || null },
    { id: 'solicitacoes', icon: HiOutlineBell, label: 'Solicitações', badge: items.length || null },
    { id: 'usuarios', icon: HiOutlineUser, label: 'Usuários' },
    { id: 'cativeiros', icon: HiOutlineOfficeBuilding, label: 'Cativeiros' },
    { id: 'sensores', icon: HiOutlineChip, label: 'Sensores' },
    { id: 'dietas', icon: HiOutlineBeaker, label: 'Dietas' },
    { id: 'chat', icon: HiOutlineChatAlt2, label: 'Chat' },
  ];

  const masterPageTitles = {
    requests: ['Histórico', 'Histórico de ações dos admins'],
    avisos: ['Avisos', 'Alertas gerados pelo monitoramento dos viveiros'],
    solicitacoes: ['Solicitações', 'Aprovações pesadas pendentes'],
    usuarios: ['Usuários', 'Gestão de usuários e permissões'],
    cativeiros: ['Fazendas & Cativeiros', 'Visão geral de todas as fazendas'],
    sensores: ['Sensores', 'Gestão e vinculação de sensores IoT'],
    dietas: ['Dietas', 'Configuração de dietas para cativeiros'],
    chat: ['Chat com Admins', 'Comunicação com administradores'],
  };

  return (
    <div className={styles.layout}>

      {mobileMenuOpen && (
        <div className={styles.backdrop} onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* SIDEBAR */}
      <aside className={`${styles.sidebar} ${mobileMenuOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarHeader}>
          <img src="/images/logo.svg" className={styles.sidebarLogo} alt="Logo" />
          <div className={styles.sidebarRole}>Painel Master</div>
        </div>
        <nav className={styles.sidebarNav}>
          {masterNavItems.map(({ id, icon: Icon, label, badge }) => (
            <button
              key={id}
              className={`${styles.navItem} ${tab === id ? styles.navItemActive : ''}`}
              onClick={() => { setTab(id); setMobileMenuOpen(false); }}
            >
              <Icon className={styles.navIcon} />
              <span className={styles.navLabel}>{label}</span>
              {badge > 0 && <span className={styles.navBadge}>{badge}</span>}
            </button>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <div className={styles.userCard}>
            <div className={styles.userAvatar}>{user?.nome?.[0]?.toUpperCase() || 'M'}</div>
            <div className={styles.userInfo}>
              <div className={styles.userName}>{user?.nome || 'Master'}</div>
              <div className={styles.userRoleBadge}>Master</div>
            </div>
          </div>
          <button className={styles.sidebarLogoutBtn} onClick={() => { setMobileMenuOpen(false); setShowLogoutModal(true); }}>
            Sair da conta
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <div className={styles.main}>
        <header className={styles.topBar}>
          <button className={styles.hamburgerBtn} onClick={() => setMobileMenuOpen(true)} aria-label="Abrir menu">
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
          {avisosLoading ? (
            <div style={{ color: '#64748b', padding: 20 }}>Carregando avisos...</div>
          ) : avisos.length === 0 ? (
            <div style={{ color: '#64748b', padding: 20 }}>Nenhum aviso até o momento.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {avisos.map(aviso => (
                <div key={aviso.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <strong>{avisoIcone(aviso.tipo)} {aviso.cativeiroNome}</strong>
                      <span style={{ marginLeft: 8, fontSize: 12, color: aviso.estado === 'ativo' ? '#b45309' : '#16a34a', fontWeight: 600 }}>
                        {aviso.estado === 'ativo' ? 'ATIVO' : 'RECUPERADO'}
                      </span>
                      <div style={{ marginTop: 4, color: '#334155', fontSize: '0.88rem' }}>{aviso.mensagem}</div>
                      <div style={{ marginTop: 4, fontSize: '0.74rem', color: '#94a3b8' }}>
                        {new Date(aviso.datahora).toLocaleString('pt-BR')}
                        {aviso.experimental ? ' · sensor sem calibração · medição experimental' : ''}
                      </div>
                    </div>
                    {aviso.avaliacao ? (
                      <span style={{ fontSize: 12, fontWeight: 600, color: aviso.avaliacao === 'confirmado' ? '#166534' : '#991b1b' }}>
                        {aviso.avaliacao === 'confirmado' ? '✓ Confirmado' : '✗ Falso alarme'}
                      </span>
                    ) : (
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => avaliarAviso(aviso.id, 'confirmado')} style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>Confirmar</button>
                        <button onClick={() => avaliarAviso(aviso.id, 'falso_alarme')} style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>Falso alarme</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'requests' && (
        <section className={styles.section}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, padding: 12, background: '#f9fafb', borderRadius: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: '14px', fontWeight: '500' }}>Solicitante:</label>
              <input
                type="text"
                placeholder="Nome ou email..."
                value={requesterFilter}
                onChange={(e) => setRequesterFilter(e.target.value)}
                style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '14px', minWidth: '180px' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: '14px', fontWeight: '500' }}>Data:</label>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '14px' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: '14px', fontWeight: '500' }}>Ação:</label>
              <input
                type="text"
                placeholder="Ex: editar_cativeiro..."
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '14px', minWidth: '180px' }}
              />
            </div>
            <button
              onClick={() => setDateFilter(new Date().toISOString().split('T')[0])}
              style={{ padding: '6px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '14px' }}
            >
              Hoje
            </button>
            <button
              onClick={() => { clearFilters(); setActionFilter(''); }}
              style={{ padding: '6px 12px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '14px' }}
            >
              Limpar Filtros
            </button>
            <div style={{ fontSize: '14px', color: '#6b7280' }}>
              {filteredRequests.length} de {allRequests.length} registros
            </div>
          </div>

          {filteredRequests.length === 0 && allRequests.length > 0 && (
            <div style={{ textAlign: 'center', padding: 20, color: '#6b7280' }}>Nenhum registro encontrado com os filtros aplicados.</div>
          )}
          {filteredRequests.length === 0 && allRequests.length === 0 && (
            <div style={{ textAlign: 'center', padding: 20, color: '#6b7280' }}>Nenhum registro encontrado.</div>
          )}

          {filteredRequests.map(item => (
            <div key={item._id} style={{ border: '1px solid #e5e7eb', padding: 14, borderRadius: 10, background: '#fff', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {getActionLabel(item.action)}
                </div>
                <span style={statusChipStyle(item.status)}>
                  {item.status === 'aprovado' ? 'Aprovado' : item.status === 'recusado' ? 'Recusado' : 'Pendente'}
                </span>
              </div>
              <div style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>
                <strong>{item.requesterUser?.nome || 'N/A'}</strong>
                {item.requesterUser?.email && (
                  <span style={{ color: '#6b7280', marginLeft: 6 }}>({item.requesterUser.email})</span>
                )}
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: item.payload ? 4 : 0 }}>
                {new Date(item.createdAt).toLocaleString('pt-BR')}
              </div>
              {item.payload && (
                <div>{formatRequestDetails(item.action, item.payload)}</div>
              )}
              {item.status === 'pendente' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    onClick={() => act(item._id, 'approve')}
                    className={`${styles.btn} ${styles.btnSuccess} ${styles.btnSm}`}
                  >
                    Aprovar
                  </button>
                  <button
                    onClick={() => act(item._id, 'reject')}
                    className={`${styles.btn} ${styles.btnDanger} ${styles.btnSm}`}
                  >
                    Recusar
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {tab === 'solicitacoes' && (
        <section className={styles.section}>
          <div style={{ marginBottom: 16, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
            <div style={{ fontSize: '14px', color: '#6b7280' }}>
              {items.length} {items.length === 1 ? 'solicitação pendente' : 'solicitações pendentes'}
            </div>
          </div>

          {items.length === 0 && (
            <div style={{ textAlign: 'center', padding: 20, color: '#6b7280' }}>Nenhuma solicitação pendente.</div>
          )}

          {items.map(item => (
            <div key={item._id} style={{ border: '1px solid #e5e7eb', padding: 14, borderRadius: 10, background: '#fff', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {getActionLabel(item.action)}
                </div>
                <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: '12px', fontWeight: 500, background: '#fef3c7', color: '#92400e', whiteSpace: 'nowrap' }}>
                  Pendente
                </span>
              </div>
              <div style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>
                <strong>{item.requesterUser?.nome || 'N/A'}</strong>
                {item.requesterUser?.email && (
                  <span style={{ color: '#6b7280', marginLeft: 6 }}>({item.requesterUser.email})</span>
                )}
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: item.payload ? 4 : 0 }}>
                {new Date(item.createdAt).toLocaleString('pt-BR')}
              </div>
              {item.payload && Object.keys(item.payload).length > 0 && (
                <div>{formatRequestDetails(item.action, item.payload)}</div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  onClick={() => act(item._id, 'approve')}
                  className={`${styles.btn} ${styles.btnSuccess} ${styles.btnSm}`}
                >
                  Aprovar
                </button>
                <button
                  onClick={() => act(item._id, 'reject')}
                  className={`${styles.btn} ${styles.btnDanger} ${styles.btnSm}`}
                >
                  Recusar
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {tab === 'usuarios' && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Usuários</h2>
            <span className={styles.filterCount}>{users.length} usuário{users.length !== 1 ? 's' : ''}</span>
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
                  <span className={`${styles.userRowRoleBadge} ${roleBadgeClass}`}>{u.role}</span>
                </div>
                <select
                  className={styles.userRowSelect}
                  value={u.role}
                  onChange={(e) => setPendingRoleChange({ userId: u.id, userName: u.nome, currentRole: u.role, newRole: e.target.value })}
                >
                  <option value="membro">Membro</option>
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
          amonia:      { bg: '#fdf4ff', color: '#7e22ce', border: '#e9d5ff', label: 'Amônia' },
          sensor:      { bg: '#f8fafc', color: '#475569', border: '#e2e8f0', label: '—'    },
        };
        const grouped = groupedByFazenda();
        const hasAny = Object.values(grouped).some(arr => Array.isArray(arr) && arr.length > 0);
        return (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Fazendas e Cativeiros</h2>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                  {fazendas.length} fazenda{fazendas.length !== 1 ? 's' : ''} · {cativeiros.length} cativeiro{cativeiros.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => openCreateModal()}>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                  Novo Cativeiro
                </button>
                <button className={`${styles.btn} ${styles.btnSuccess}`} onClick={() => setShowCreateFazendaModal(true)}>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                  Nova Fazenda
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
                            {cats.length} cativeiro{cats.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className={styles.accordionFarmAdmin}>
                          {fzAdmins.length > 0 ? `Admin: ${fzAdmins.map(a => a.nome).join(', ')}` : 'Sem admin responsável'}
                        </div>
                      </div>
                      <div className={styles.accordionHeaderRight}>
                        <button
                          className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
                          onClick={e => { e.stopPropagation(); openEditFazenda(fzObj); }}
                        >Editar</button>
                        <button
                          className={`${styles.btn} ${styles.btnSm}`}
                          style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}
                          onClick={e => { e.stopPropagation(); handleDeleteFazenda(fzId, fzObj?.nome); }}
                        >Excluir</button>
                        <span className={styles.accordionArrow} style={{ display: 'inline-block', transition: 'transform 0.2s', transform: expandedFazenda[fzId] ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                      </div>
                    </div>

                    {/* Fazenda body */}
                    {expandedFazenda[fzId] && (
                      <div className={styles.accordionBody}>
                        {cats.length === 0 ? (
                          <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>Nenhum cativeiro nesta fazenda.</p>
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
                                        {sensorCount} sensor{sensorCount !== 1 ? 'es' : ''}
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
                                        Editar
                                      </button>
                                      <button
                                        className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
                                        onClick={() => abrirModalLimites(c)}
                                        title="Configurar limites de temperatura e sensibilidade dos avisos"
                                      >
                                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                        Alertas
                                      </button>
                                      <button
                                        className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
                                        onClick={() => abrirHistoricoChave(c)}
                                        title="Ver trilha de quem gerou a chave do dispositivo deste viveiro"
                                      >
                                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                        Chave
                                      </button>
                                      <button
                                        className={`${styles.btn} ${styles.btnSm}`}
                                        style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}
                                        onClick={() => deleteCativeiro(c._id)}
                                      >
                                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                        Excluir
                                      </button>
                                    </div>

                                    {/* Info grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 8, marginBottom: 18 }}>
                                      {[
                                        ['Tipo de camarão', c.id_tipo_camarao?.nome || (typeof c.id_tipo_camarao === 'string' ? c.id_tipo_camarao : '—')],
                                        ['Instalação', c.data_instalacao ? new Date(c.data_instalacao).toLocaleDateString('pt-BR') : '—'],
                                        ['Temp ideal', c.condicoes_ideais?.temp_ideal != null ? `${c.condicoes_ideais.temp_ideal} °C` : c.temp_media_diaria ? `${c.temp_media_diaria} °C` : '—'],
                                        ['pH ideal', c.condicoes_ideais?.ph_ideal ?? c.ph_medio_diario ?? '—'],
                                        ['Amônia ideal', c.condicoes_ideais?.amonia_ideal != null ? `${c.condicoes_ideais.amonia_ideal} mg/L` : c.amonia_media_diaria ? `${c.amonia_media_diaria} mg/L` : '—'],
                                      ].map(([label, value]) => (
                                        <div key={label} style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 8, padding: '8px 12px' }}>
                                          <div style={{ fontSize: '0.67rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
                                          <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b' }}>{value}</div>
                                        </div>
                                      ))}
                                    </div>

                                    {/* Foto */}
                                    <div style={{ marginBottom: 16 }}>
                                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Foto</div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        {(previewImage[c._id] || !photoErrors[c._id]) ? (
                                          <img
                                            src={previewImage[c._id] || `${apiUrl}/cativeiros/${c._id}/foto`}
                                            alt="Foto do cativeiro"
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
                                          Alterar foto
                                        </button>
                                      </div>
                                    </div>

                                    {/* Sensors */}
                                    <div style={{ marginBottom: 16 }}>
                                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Sensores vinculados</div>
                                      {!Array.isArray(c.sensores) ? (
                                        <div style={{ color: '#94a3b8', fontSize: '0.82rem' }}>Carregando...</div>
                                      ) : c.sensores.length === 0 ? (
                                        <div style={{ color: '#94a3b8', fontSize: '0.82rem', fontStyle: 'italic' }}>Nenhum sensor vinculado.</div>
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
                                                      setMasterNotification({ show: true, message: 'Sensor desvinculado com sucesso!', type: 'success' });
                                                    } catch (e) {
                                                      setMasterNotification({ show: true, message: 'Erro ao desvincular sensor: ' + (e?.response?.data?.message || e.message), type: 'error' });
                                                    }
                                                  }}
                                                  title="Desvincular"
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
                                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Dieta ativa</div>
                                      {cativeiroDieta[c._id] === undefined && <div style={{ color: '#94a3b8', fontSize: '0.82rem' }}>Carregando...</div>}
                                      {cativeiroDieta[c._id] === null && (
                                        <div style={{ color: '#94a3b8', fontSize: '0.82rem', fontStyle: 'italic', background: '#f8fafc', border: '1px dashed #e2e8f0', borderRadius: 8, padding: '10px 14px' }}>
                                          Nenhuma dieta ativa para este cativeiro.
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
                                                <span style={{ fontSize: '0.82rem', color: '#166534' }}><b>{d.quantidade}g</b> por refeição</span>
                                              )}
                                              {typeof d.quantidadeRefeicoes !== 'undefined' && (
                                                <span style={{ fontSize: '0.82rem', color: '#166534' }}><b>{d.quantidadeRefeicoes}×</b> ao dia</span>
                                              )}
                                            </div>
                                            {horarios && (
                                              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 700 }}>Horários:</span>
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
                        {loadingFazenda[fzId] && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>Carregando cativeiros...</div>}
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
          temperatura: { label: 'Temperatura', icon: '🌡️', bg: '#fff7ed', stripe: '#f97316', badgeBg: '#ffedd5', badgeColor: '#c2410c' },
          ph:          { label: 'pH',          icon: '🧪', bg: '#eff6ff', stripe: '#3b82f6', badgeBg: '#dbeafe', badgeColor: '#1d4ed8' },
          amonia:      { label: 'Amônia',      icon: '⚗️', bg: '#fdf4ff', stripe: '#a855f7', badgeBg: '#f3e8ff', badgeColor: '#7e22ce' },
        };
        const countByType = { temperatura: 0, ph: 0, amonia: 0 };
        sensores.forEach(s => { const t = getSensorType(s); if (countByType[t] !== undefined) countByType[t]++; });
        return (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Sensores IoT</h2>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                {sensores.length} sensor{sensores.length !== 1 ? 'es' : ''} cadastrado{sensores.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              className={`${styles.btn} ${styles.btnSuccess}`}
              onClick={() => { setSensorForm({ id_tipo_sensor: 'temperatura', apelido: '', fotoFile: null }); setShowCreateSensor(true); }}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
              Novo Sensor
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
              <p className={styles.emptyStateText}>Nenhum sensor cadastrado ainda.</p>
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
                            {s.apelido || 'Sem apelido'}
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
                          Editar
                        </button>
                        <button
                          className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`}
                          style={{ flex: 1 }}
                          onClick={() => { setLinkForm({ sensorId: s._id, cativeiroId: '', currentSensorIds: [] }); setShowLinkModal(true); }}
                        >
                          <svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                          Vincular
                        </button>
                        <button
                          className={`${styles.btn} ${styles.btnSm}`}
                          style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}
                          onClick={() => { setDeleteSensorData({ id: s._id, apelido: s.apelido || 'Sem apelido', tipo: cfg.label }); setShowDeleteSensorModal(true); }}
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

      {tab === 'dietas' && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Dietas</h2>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                {dietas.length} dieta{dietas.length !== 1 ? 's' : ''} cadastrada{dietas.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              className={`${styles.btn} ${styles.btnSuccess}`}
              onClick={() => { setDietaForm({ descricao: '', quantidade: '' }); setShowCreateDieta(true); }}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
              Nova Dieta
            </button>
          </div>

          <div className={styles.dietaLayout}>
            {/* Coluna esquerda: lista de dietas */}
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                Lista de dietas
              </div>
              {dietas.length === 0 ? (
                <div className={styles.emptyState} style={{ padding: '32px 24px' }}>
                  <div className={styles.emptyStateIcon} style={{ fontSize: 32 }}>🥗</div>
                  <p className={styles.emptyStateText}>Nenhuma dieta cadastrada.</p>
                </div>
              ) : (
                dietas.map(d => (
                  <div key={d._id} className={styles.dietaCard}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🥗</div>
                      <div className={styles.dietaInfo}>
                        <div className={styles.dietaDescricao}>{d.descricao || '—'}</div>
                        <div className={styles.dietaQtd}>
                          {typeof d.quantidade !== 'undefined' ? (
                            <span style={{ background: '#dcfce7', color: '#15803d', padding: '1px 8px', borderRadius: 20, fontSize: '11px', fontWeight: 600 }}>
                              {d.quantidade} g
                            </span>
                          ) : '—'}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
                        onClick={() => {
  const n = d.quantidadeRefeicoes || 1;
  const existingHorarios = Array.isArray(d.horarios) ? d.horarios : [];
  setEditingDietaId(d._id);
  setEditingDieta({
    descricao: d.descricao || '',
    quantidade: d.quantidade || '',
    quantidadeRefeicoes: n,
    horarios: Array.from({ length: n }, (_, i) => existingHorarios[i] ?? ''),
  });
  setShowEditDietaModal(true);
}}
                      >
                        <svg width="11" height="11" fill="none" viewBox="0 0 24 24"><path d="M15.232 5.232a3 3 0 1 1 4.243 4.243L7.5 21H3v-4.5L15.232 5.232Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        Editar
                      </button>
                      <button
                        className={`${styles.btn} ${styles.btnSm}`}
                        style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}
                        onClick={() => { setDeleteDietaData({ id: d._id, descricao: d.descricao || '—' }); setShowDeleteDietaModal(true); }}
                      >
                        <svg width="11" height="11" fill="none" viewBox="0 0 24 24"><path d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        Excluir
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Coluna direita: atribuição */}
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                Atribuir dieta a cativeiro
              </div>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '10px 14px', fontSize: '0.8rem', color: '#0369a1', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>ℹ️</span>
                  Associe uma dieta a um cativeiro. Só pode haver uma dieta ativa por cativeiro.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>Cativeiro</label>
                    <select
                      value={assignForm.cativeiroId}
                      onChange={(e) => setAssignForm(f => ({ ...f, cativeiroId: e.target.value }))}
                      className={styles.userRowSelect}
                      style={{ width: '100%' }}
                    >
                      <option value="">Selecione um cativeiro...</option>
                      {cativeiros.map(c => (
                        <option key={c._id} value={c._id}>{c.nome || c._id}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 5 }}>Dieta</label>
                    <select
                      value={assignForm.dietaId}
                      onChange={(e) => setAssignForm(f => ({ ...f, dietaId: e.target.value }))}
                      className={styles.userRowSelect}
                      style={{ width: '100%' }}
                    >
                      <option value="">Selecione uma dieta...</option>
                      {dietas.map(d => (
                        <option key={d._id} value={d._id}>{d.descricao || d._id}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={async () => {
                    if (!assignForm.cativeiroId || !assignForm.dietaId) {
                      setMasterNotification({ show: true, message: 'Selecione um cativeiro e uma dieta.', type: 'error' });
                      return;
                    }
                    const dietaAtual = cativeiroDieta[assignForm.cativeiroId];
                    if (dietaAtual && dietaAtual.dietaId) {
                      const cativeiro = cativeiros.find(c => c._id === assignForm.cativeiroId);
                      const dietaNova = dietas.find(d => d._id === assignForm.dietaId);
                      setAssignConfirmData({
                        cativeiroId: assignForm.cativeiroId,
                        dietaId: assignForm.dietaId,
                        cativeiroNome: cativeiro?.nome || assignForm.cativeiroId,
                        dietaAtualNome: dietaAtual.descricao || 'Dieta atual',
                        dietaNovaNome: dietaNova?.descricao || 'Nova dieta',
                      });
                      setShowAssignConfirm(true);
                    } else {
                      try {
                        const token = getToken();
                        await axios.post(`${apiUrl}/dietas/assign/${assignForm.cativeiroId}`, { dietaId: assignForm.dietaId, ativo: true }, { headers: { Authorization: `Bearer ${token}` } });
                        await loadDietaAtual(assignForm.cativeiroId);
                        setAssignForm({ cativeiroId: '', dietaId: '' });
                        setMasterNotification({ show: true, message: 'Dieta atribuída com sucesso!', type: 'success' });
                      } catch (e) { setMasterNotification({ show: true, message: 'Erro ao atribuir: ' + (e?.response?.data?.error || e.message), type: 'error' }); }
                    }
                  }}
                >
                  Atribuir Dieta
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {tab === 'chat' && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Chat com Admins</h2>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                {chatConversations.length} conversa{chatConversations.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className={styles.chatLayout}>
            {/* Sidebar de conversas */}
            <div className={styles.chatSidebar}>
              <div className={styles.chatSidebarHeader}>Conversas</div>
              <div className={styles.chatConvList}>
                {chatConversations.length === 0 ? (
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>Nenhuma conversa ainda.</div>
                ) : (
                  chatConversations.map(c => (
                    <button
                      key={c._id}
                      onClick={() => openConversation(c._id)}
                      className={`${styles.chatConvItem} ${chatSelectedId === c._id ? styles.chatConvItemActive : ''}`}
                    >
                      <div className={styles.chatConvTitle}>{getConversationTitle(c)}</div>
                      <div className={styles.chatConvTime}>
                        {new Date(c.updatedAt || c.lastMessageAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </button>
                  ))
                )}
              </div>
              <div className={styles.chatStartSection}>
                <div className={styles.chatStartLabel}>Nova conversa</div>
                <select
                  onChange={(e) => { const val = e.target.value; if (val) { startConversationWithAdmin(val); e.target.value = ''; } }}
                  className={styles.formSelect}
                  style={{ width: '100%' }}
                >
                  <option value="">Selecione um admin...</option>
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
                    <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Selecione uma conversa</span>
                  )}
                </div>
                {chatSelectedId && (
                  <button
                    className={`${styles.btn} ${styles.btnSm}`}
                    style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}
                    onClick={() => setShowDeleteConvModal(true)}
                    title="Excluir conversa"
                  >
                    <svg width="13" height="13" fill="none" viewBox="0 0 24 24"><path d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Excluir conversa
                  </button>
                )}
              </div>

              <div className={styles.chatMessages}>
                {!chatSelectedId && (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                      <svg width="40" height="40" fill="none" viewBox="0 0 24 24" style={{ marginBottom: 8, opacity: 0.4 }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      <p style={{ margin: 0, fontSize: '0.85rem' }}>Selecione uma conversa para começar</p>
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
                          {new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
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
                  placeholder={chatSelectedId ? 'Digite sua mensagem... (Enter para enviar)' : 'Selecione uma conversa'}
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
                  Enviar
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
        title={sensorForm?.id ? 'Editar Sensor' : 'Novo Sensor'}
        showCloseButton
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Tipo de sensor</label>
            <select
              value={sensorForm.id_tipo_sensor}
              onChange={(e) => setSensorForm(f => ({ ...f, id_tipo_sensor: e.target.value }))}
              className={styles.userRowSelect}
              style={{ width: '100%' }}
            >
              <option value="temperatura">🌡️ Temperatura</option>
              <option value="ph">🧪 pH</option>
              <option value="amonia">⚗️ Amônia</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Apelido</label>
            <input
              value={sensorForm.apelido}
              onChange={(e) => setSensorForm(f => ({ ...f, apelido: e.target.value }))}
              placeholder="ex: Sensor Tanque A"
              className={styles.filterInput}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Imagem do sensor <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opcional)</span></label>
            <input type="file" accept="image/*" onChange={(e) => setSensorForm(f => ({ ...f, fotoFile: e.target.files?.[0] || null }))} style={{ fontSize: '0.85rem' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setShowCreateSensor(false)}>Cancelar</button>
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
                  alert('Erro ao salvar sensor: ' + (e?.response?.data?.error || e.message));
                }
              }}
            >
              {sensorForm?.id ? 'Salvar alterações' : 'Criar sensor'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Criar Dieta */}
      <Modal isOpen={showCreateDieta} onClose={() => setShowCreateDieta(false)} title="Nova Dieta" showCloseButton>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Descrição</label>
            <input
              value={dietaForm.descricao}
              onChange={(e) => setDietaForm(f => ({ ...f, descricao: e.target.value }))}
              placeholder="ex: Ração Premium — Fase crescimento"
              className={styles.filterInput}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Quantidade por refeição (g)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={dietaForm.quantidade}
                onChange={(e) => setDietaForm(f => ({ ...f, quantidade: e.target.value }))}
                placeholder="ex: 2.5"
                className={styles.filterInput}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Refeições por dia</label>
              <input
                type="number"
                min="1"
                max="10"
                value={dietaForm.quantidadeRefeicoes}
                onChange={(e) => {
                  const n = Math.max(1, Math.min(10, parseInt(e.target.value) || 1));
                  setDietaForm(f => ({
                    ...f,
                    quantidadeRefeicoes: n,
                    horarios: Array.from({ length: n }, (_, i) => (f.horarios || [])[i] ?? ''),
                  }));
                }}
                className={styles.filterInput}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 8 }}>
              Horários de alimentação
              <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 6 }}>({dietaForm.quantidadeRefeicoes} campo{dietaForm.quantidadeRefeicoes !== 1 ? 's' : ''})</span>
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Array.from({ length: dietaForm.quantidadeRefeicoes }, (_, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', color: '#94a3b8', minWidth: 70 }}>Refeição {i + 1}</span>
                  <input
                    type="time"
                    value={dietaForm.horarios[i] || ''}
                    onChange={(e) => setDietaForm(f => { const hs = [...f.horarios]; hs[i] = e.target.value; return { ...f, horarios: hs }; })}
                    className={styles.filterInput}
                    style={{ flex: 1, boxSizing: 'border-box' }}
                  />
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setShowCreateDieta(false)}>Cancelar</button>
            <button
              className={`${styles.btn} ${styles.btnSuccess}`}
              onClick={async () => {
                try {
                  const token = getToken();
                  const horariosValidos = dietaForm.horarios.slice(0, dietaForm.quantidadeRefeicoes);
                  await axios.post(`${apiUrl}/dietas`, {
                    descricao: dietaForm.descricao,
                    quantidade: dietaForm.quantidade,
                    horarios: horariosValidos,
                    quantidadeRefeicoes: dietaForm.quantidadeRefeicoes,
                    horaAlimentacao: horariosValidos[0] || '',
                  }, { headers: { Authorization: `Bearer ${token}` } });
                  setDietaForm({ descricao: '', quantidade: '', quantidadeRefeicoes: 1, horarios: [''] });
                  setShowCreateDieta(false);
                  await load();
                  setMasterNotification({ show: true, message: 'Dieta criada com sucesso!', type: 'success' });
                } catch (e) { setMasterNotification({ show: true, message: 'Erro ao criar dieta: ' + (e?.response?.data?.error || e.message), type: 'error' }); }
              }}
            >
              Criar dieta
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Editar Dieta */}
      <Modal isOpen={showEditDietaModal} onClose={() => { setShowEditDietaModal(false); setEditingDietaId(''); }} title="Editar Dieta" showCloseButton>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Descrição</label>
            <input
              value={editingDieta.descricao}
              onChange={(e) => setEditingDieta(v => ({ ...v, descricao: e.target.value }))}
              placeholder="Descrição da dieta"
              className={styles.filterInput}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Quantidade por refeição (g)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={editingDieta.quantidade}
                onChange={(e) => setEditingDieta(v => ({ ...v, quantidade: e.target.value }))}
                placeholder="ex: 2.5"
                className={styles.filterInput}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Refeições por dia</label>
              <input
                type="number"
                min="1"
                max="10"
                value={editingDieta.quantidadeRefeicoes || 1}
                onChange={(e) => {
                  const n = Math.max(1, Math.min(10, parseInt(e.target.value) || 1));
                  setEditingDieta(v => ({
                    ...v,
                    quantidadeRefeicoes: n,
                    horarios: Array.from({ length: n }, (_, i) => (v.horarios || [])[i] ?? ''),
                  }));
                }}
                className={styles.filterInput}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 8 }}>Horários de alimentação</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Array.from({ length: editingDieta.quantidadeRefeicoes || 1 }, (_, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', color: '#94a3b8', minWidth: 70 }}>Refeição {i + 1}</span>
                  <input
                    type="time"
                    value={(editingDieta.horarios || [])[i] || ''}
                    onChange={(e) => setEditingDieta(v => { const hs = [...(v.horarios || [])]; hs[i] = e.target.value; return { ...v, horarios: hs }; })}
                    className={styles.filterInput}
                    style={{ flex: 1, boxSizing: 'border-box' }}
                  />
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => { setShowEditDietaModal(false); setEditingDietaId(''); }}>Cancelar</button>
            <button
              className={`${styles.btn} ${styles.btnSuccess}`}
              onClick={async () => {
                try {
                  const token = getToken();
                  const horariosValidos = (editingDieta.horarios || []).filter(h => h !== '');
                  await axios.put(`${apiUrl}/dietas/${editingDietaId}`, {
                    descricao: editingDieta.descricao,
                    quantidade: editingDieta.quantidade,
                    horarios: horariosValidos,
                    quantidadeRefeicoes: horariosValidos.length || 1,
                    horaAlimentacao: horariosValidos[0] || '',
                  }, { headers: { Authorization: `Bearer ${token}` } });
                  setShowEditDietaModal(false);
                  setEditingDietaId('');
                  setEditingDieta({ descricao: '', quantidade: '', quantidadeRefeicoes: 1, horarios: [''] });
                  await load();
                  setMasterNotification({ show: true, message: 'Dieta atualizada com sucesso!', type: 'success' });
                } catch (e) { setMasterNotification({ show: true, message: 'Erro ao salvar edição: ' + (e?.response?.data?.error || e.message), type: 'error' }); }
              }}
            >
              Salvar alterações
            </button>
          </div>
        </div>
      </Modal>

      {showLinkModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: 20, borderRadius: 8, width: '95%', maxWidth: 480 }}>
            <h3 style={{ marginTop: 0 }}>Relacionar sensor a cativeiro</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Cativeiro</label>
                <select value={linkForm.cativeiroId} onChange={(e) => setLinkForm(f => ({ ...f, cativeiroId: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }}>
                  <option value="">Selecione</option>
                  {cativeiros.map(c => (
                    <option key={c._id} value={c._id}>{c.nome || c._id}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button onClick={() => setShowLinkModal(false)} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={async () => {
                try {
                  const token = getToken();
                  const cId = linkForm.cativeiroId;
                  if (!cId) {
                    setMasterNotification({ show: true, message: 'Selecione um cativeiro.', type: 'error' });
                    return;
                  }
                  // Verifica se o sensor já está vinculado a este cativeiro
                  const existingRes = await axios.get(`${apiUrl}/cativeiros/${cId}/sensores`, { headers: { Authorization: `Bearer ${token}` } });
                  const existingIds = (Array.isArray(existingRes.data) ? existingRes.data : [])
                    .map(item => String((item?.id_sensor?._id || item?.id_sensor || item?._id || item) || ''));
                  if (existingIds.includes(String(linkForm.sensorId))) {
                    setMasterNotification({ show: true, message: 'Este sensor já está vinculado a este cativeiro.', type: 'error' });
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
                  setMasterNotification({ show: true, message: 'Sensor vinculado com sucesso!', type: 'success' });
                } catch (e) {
                  setMasterNotification({ show: true, message: 'Erro ao relacionar: ' + (e?.response?.data?.error || e.message), type: 'error' });
                }
              }} style={{ border: 'none', background: '#3b82f6', color: '#fff', borderRadius: 6, padding: '8px 12px', cursor: 'pointer' }}>Relacionar</button>
            </div>
          </div>
        </div>
      )}
      {/* Modal de edição de fazenda */}
      {showEditFazendaModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 8, width: '95%', maxWidth: 480 }}>
            <h3 style={{ marginTop: 0 }}>Editar fazenda</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Nome</label>
                <input value={editFazendaForm.nome} onChange={e => setEditFazendaForm(f => ({ ...f, nome: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box' }} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Rua</label>
                <input value={editFazendaForm.rua} onChange={e => setEditFazendaForm(f => ({ ...f, rua: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Bairro</label>
                <input value={editFazendaForm.bairro} onChange={e => setEditFazendaForm(f => ({ ...f, bairro: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Cidade</label>
                <input value={editFazendaForm.cidade} onChange={e => setEditFazendaForm(f => ({ ...f, cidade: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Número</label>
                <input value={editFazendaForm.numero} onChange={e => setEditFazendaForm(f => ({ ...f, numero: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box' }} />
              </div>
              {(() => {
                const allAdmins = (users || []).filter(u => u.role === 'admin');
                if (allAdmins.length === 0) return null;
                const hasLinkedAdmin = getFazendaAdmins(editFazendaForm.id).length > 0;
                return (
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Admin responsável</label>
                    <select
                      value={editFazendaForm.adminId}
                      onChange={e => setEditFazendaForm(f => ({ ...f, adminId: e.target.value }))}
                      style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box' }}
                    >
                      {!hasLinkedAdmin && <option value="">Sem admin responsável (opcional)</option>}
                      {allAdmins.map(a => (
                        <option key={a.id || a._id} value={a.id || a._id}>{a.nome} — {a.email}</option>
                      ))}
                    </select>
                  </div>
                );
              })()}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowEditFazendaModal(false)} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleUpdateFazenda} style={{ border: 'none', background: '#3b82f6', color: '#fff', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontWeight: 600 }}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação de mudança de role */}
      {pendingRoleChange && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={() => setPendingRoleChange(null)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '28px 28px 24px', maxWidth: 400, width: '90%', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.05rem', fontWeight: 700, color: '#1e293b' }}>Alterar permissão</h3>
            <hr style={{ border: 'none', borderTop: '1px solid #f1f5f9', margin: '0 0 18px' }} />
            <p style={{ margin: '0 0 20px', fontSize: '0.9rem', color: '#475569', lineHeight: 1.6 }}>
              Tem certeza que deseja alterar a permissão de <strong style={{ color: '#1e293b' }}>{pendingRoleChange.userName}</strong> de <strong style={{ color: '#1e293b' }}>{pendingRoleChange.currentRole}</strong> para <strong style={{ color: '#1e293b' }}>{pendingRoleChange.newRole}</strong>?
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setPendingRoleChange(null)}
                style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontFamily: 'Poppins, sans-serif', fontSize: '0.855rem', fontWeight: 500, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={async () => { await changeRole(pendingRoleChange.userId, pendingRoleChange.newRole); setPendingRoleChange(null); }}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(90deg, #f7b0b7 0%, #a3c7f7 100%)', color: '#0f172a', fontFamily: 'Poppins, sans-serif', fontSize: '0.855rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de criação de fazenda */}
      {showCreateFazendaModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 8, width: '95%', maxWidth: 480 }}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Nova fazenda</h3>
            <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0 0 16px 0' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Nome</label>
                <input value={newFazendaForm.nome} onChange={e => setNewFazendaForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome da fazenda" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box' }} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Rua</label>
                <input value={newFazendaForm.rua} onChange={e => setNewFazendaForm(f => ({ ...f, rua: e.target.value }))} placeholder="Rua" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Bairro</label>
                <input value={newFazendaForm.bairro} onChange={e => setNewFazendaForm(f => ({ ...f, bairro: e.target.value }))} placeholder="Bairro" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Cidade</label>
                <input value={newFazendaForm.cidade} onChange={e => setNewFazendaForm(f => ({ ...f, cidade: e.target.value }))} placeholder="Cidade" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Número</label>
                <input value={newFazendaForm.numero} onChange={e => setNewFazendaForm(f => ({ ...f, numero: e.target.value }))} placeholder="Número" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box' }} />
              </div>
              {(() => {
                const allAdmins = (users || []).filter(u => u.role === 'admin');
                if (allAdmins.length === 0) return null;
                return (
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Admin responsável</label>
                    <select
                      value={newFazendaForm.adminId}
                      onChange={e => setNewFazendaForm(f => ({ ...f, adminId: e.target.value }))}
                      style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, boxSizing: 'border-box' }}
                    >
                      <option value="">Sem admin responsável (opcional)</option>
                      {allAdmins.map(a => (
                        <option key={a.id || a._id} value={a.id || a._id}>{a.nome} — {a.email}</option>
                      ))}
                    </select>
                  </div>
                );
              })()}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowCreateFazendaModal(false)} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>Cancelar</button>
              <button
                onClick={handleCreateFazenda}
                disabled={!newFazendaForm.nome || !newFazendaForm.rua || !newFazendaForm.bairro || !newFazendaForm.cidade || !newFazendaForm.numero}
                style={{ border: 'none', background: '#3b82f6', color: '#fff', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontWeight: 600 }}
              >Criar fazenda</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de criação de cativeiro */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 8, width: '95%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Criar cativeiro</h3>
            <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0 0 16px 0' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Fazenda</label>
                <select value={createForm.fazendaId} onChange={(e) => setCreateForm(f => ({ ...f, fazendaId: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }}>
                  {fazendas.map(f => (
                    <option key={f._id} value={f._id}>{getFazendaName(f._id)}</option>
                  ))}
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Nome</label>
                <input value={createForm.nome} onChange={(e) => setCreateForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome do cativeiro" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Tipo de camarão</label>
                <select value={createForm.id_tipo_camarao} onChange={(e) => setCreateForm(f => ({ ...f, id_tipo_camarao: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }}>
                  {tiposCamarao.map(t => (
                    <option key={t._id} value={t._id}>{t.nome}</option>
                  ))}
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Data de instalação</label>
                <input type="date" value={createForm.data_instalacao} onChange={(e) => setCreateForm(f => ({ ...f, data_instalacao: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Temp ideal (°C)</label>
                <input value={createForm.temp_media_diaria} onChange={(e) => setCreateForm(f => ({ ...f, temp_media_diaria: e.target.value }))} placeholder="ex: 26" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>pH ideal</label>
                <input value={createForm.ph_medio_diario} onChange={(e) => setCreateForm(f => ({ ...f, ph_medio_diario: e.target.value }))} placeholder="ex: 7.5" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Amônia ideal (mg/L)</label>
                <input value={createForm.amonia_media_diaria} onChange={(e) => setCreateForm(f => ({ ...f, amonia_media_diaria: e.target.value }))} placeholder="ex: 0.05" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Imagem do cativeiro</label>
                <input type="file" accept="image/*" onChange={(e) => setCreateForm(f => ({ ...f, fotoFile: e.target.files?.[0] || null }))} style={{ width: '100%' }} />
              </div>
              <div style={{ gridColumn: 'span 2', borderTop: '1px solid #eee', paddingTop: 8 }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Dieta (opcional)</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={createForm.dietaAtivar} onChange={(e) => setCreateForm(f => ({ ...f, dietaAtivar: e.target.checked }))} />
                    Ativar dieta na criação
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', opacity: createForm.dietaAtivar ? 1 : 0.6 }}>
                  <input disabled={!createForm.dietaAtivar} value={createForm.dietaDescricao} onChange={(e) => setCreateForm(f => ({ ...f, dietaDescricao: e.target.value }))} placeholder="Descrição" style={{ flex: 1, padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
                  <input disabled={!createForm.dietaAtivar} type="number" step="0.01" value={createForm.dietaQuantidade} onChange={(e) => setCreateForm(f => ({ ...f, dietaQuantidade: e.target.value }))} placeholder="Quantidade (g)" style={{ width: 160, padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowCreateModal(false)} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={submitCreateModal} style={{ border: 'none', background: '#10b981', color: '#fff', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontWeight: 600 }}>Criar</button>
            </div>
          </div>
        </div>
      )}
      {/* Modal de edição de cativeiro */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Editar cativeiro">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Nome</label>
            <input value={editForm.nome} onChange={(e) => setEditForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome do cativeiro" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Tipo de camarão</label>
            <select value={editForm.id_tipo_camarao} onChange={(e) => setEditForm(f => ({ ...f, id_tipo_camarao: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }}>
              {tiposCamarao.map(t => (
                <option key={t._id} value={t._id}>{t.nome}</option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Data de instalação</label>
            <input type="date" value={editForm.data_instalacao} onChange={(e) => setEditForm(f => ({ ...f, data_instalacao: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Temp ideal (°C)</label>
            <input value={editForm.temp_media_diaria} onChange={(e) => setEditForm(f => ({ ...f, temp_media_diaria: e.target.value }))} placeholder="ex: 26" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>pH ideal</label>
            <input value={editForm.ph_medio_diario} onChange={(e) => setEditForm(f => ({ ...f, ph_medio_diario: e.target.value }))} placeholder="ex: 7.5" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Amônia ideal (mg/L)</label>
            <input value={editForm.amonia_media_diaria} onChange={(e) => setEditForm(f => ({ ...f, amonia_media_diaria: e.target.value }))} placeholder="ex: 0.05" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
          </div>
          <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button onClick={() => setShowEditModal(false)} style={{ border: '1px solid #e5e7eb', background: '#fff', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>Cancelar</button>
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
                alert('Erro ao editar cativeiro.');
              }
            }} style={{ border: 'none', background: '#3b82f6', color: '#fff', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>Salvar</button>
          </div>
        </div>
      </Modal>
      {/* Modal de limites de avisos (temperatura e sensibilidade de pH/amônia) */}
      <Modal isOpen={showLimitesModal} onClose={() => setShowLimitesModal(false)} title={`Limites de avisos — ${limitesForm.nome}`}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: 'span 2', fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>
            Define quando a detecção de tendência abre um aviso para este viveiro. Deixe um par de
            campos em branco para manter o padrão do sistema naquele parâmetro.
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Temp. mínima (°C)</label>
            <input type="number" step="0.1" value={limitesForm.minimo}
              onChange={(e) => setLimitesForm(f => ({ ...f, minimo: e.target.value }))}
              placeholder="padrão: ideal − 2°C" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Temp. máxima (°C)</label>
            <input type="number" step="0.1" value={limitesForm.maximo}
              onChange={(e) => setLimitesForm(f => ({ ...f, maximo: e.target.value }))}
              placeholder="padrão: ideal + 2°C" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Limiar de pH</label>
            <input type="number" step="0.01" min="0.05" max="3" value={limitesForm.phLimiar}
              onChange={(e) => setLimitesForm(f => ({ ...f, phLimiar: e.target.value }))}
              placeholder="padrão: 0,35" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Limiar de amônia (%)</label>
            <input type="number" step="0.01" min="0.05" max="1" value={limitesForm.amoniaLimiarPct}
              onChange={(e) => setLimitesForm(f => ({ ...f, amoniaLimiarPct: e.target.value }))}
              placeholder="padrão: 0,25 (25%)" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
          </div>
          <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button onClick={() => setShowLimitesModal(false)} disabled={limitesSubmitting} style={{ border: '1px solid #e5e7eb', background: '#fff', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={salvarLimitesAvisos} disabled={limitesSubmitting} style={{ border: 'none', background: '#3b82f6', color: '#fff', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>
              {limitesSubmitting ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </Modal>
      {/* Modal de trilha de auditoria da chave do dispositivo */}
      <Modal isOpen={showHistoricoChaveModal} onClose={() => setShowHistoricoChaveModal(false)} title={`Trilha da chave do dispositivo — ${historicoChaveCativeiro.nome}`}>
        <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 14 }}>
          Registra quem gerou cada chave do ESP32 deste viveiro e quando — a chave em si nunca fica
          guardada. Útil para investigar se um aviso de sensor inativo coincide com uma troca de chave.
        </div>
        {historicoChaveLoading ? (
          <div style={{ color: '#64748b', padding: '12px 0' }}>Carregando...</div>
        ) : historicoChave.length === 0 ? (
          <div style={{ color: '#64748b', padding: '12px 0' }}>Nenhuma chave foi gerada para este viveiro ainda.</div>
        ) : (
          <div style={{ position: 'relative', paddingLeft: 20 }}>
            <div style={{ position: 'absolute', left: 5, top: 6, bottom: 6, width: 2, background: '#e2e8f0' }} />
            {historicoChave.map((item, index) => (
              <div key={index} style={{ position: 'relative', paddingBottom: index === historicoChave.length - 1 ? 0 : 18 }}>
                <div style={{
                  position: 'absolute', left: -20, top: 2, width: 12, height: 12, borderRadius: '50%',
                  background: index === 0 ? '#3b82f6' : '#cbd5e1', border: '2px solid #fff', boxShadow: '0 0 0 1px #e2e8f0',
                }} />
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>
                  {new Date(item.geradoEm).toLocaleString('pt-BR')}
                  {index === 0 && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>CHAVE ATUAL</span>}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: 2 }}>
                  {item.geradoPor ? (
                    <>Gerada por <strong>{item.geradoPor.nome}</strong> ({item.geradoPor.email}) — {item.geradoPor.role}</>
                  ) : (
                    <em>Usuário não encontrado (pode ter sido removido depois)</em>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={() => setShowHistoricoChaveModal(false)} style={{ border: '1px solid #e5e7eb', background: '#fff', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>Fechar</button>
        </div>
      </Modal>
      {/* Modal de aprovação de funcionário */}
      <Modal isOpen={showApproveFuncionarioModal} onClose={() => {
        setShowApproveFuncionarioModal(false);
        setPendingApproveRequestId(null);
        setSelectedFazendaId('');
      }} title={(() => {
        const request = items.find(r => r._id === pendingApproveRequestId) || allRequests.find(r => r._id === pendingApproveRequestId);
        return request && request.action === 'associar_funcionario' 
          ? 'Aprovar Associação de Funcionário' 
          : 'Aprovar Cadastro de Funcionário';
      })()}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
              Selecionar Fazenda: <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select 
              value={selectedFazendaId} 
              onChange={(e) => setSelectedFazendaId(e.target.value)} 
              style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
            >
              <option value="">-- Selecione uma fazenda --</option>
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
                  ? 'O funcionário será associado a esta fazenda e terá acesso aos cativeiros dela.'
                  : 'O funcionário será relacionado a esta fazenda e terá acesso aos cativeiros dela.';
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
              Cancelar
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
              Confirmar Aprovação
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal de confirmação substituição de dieta */}
      <Modal isOpen={showAssignConfirm} onClose={() => setShowAssignConfirm(false)} title="Substituir dieta?" showCloseButton>
        {assignConfirmData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#374151', lineHeight: 1.6 }}>
              O cativeiro <strong>{assignConfirmData.cativeiroNome}</strong> já possui a dieta <strong>&quot;{assignConfirmData.dietaAtualNome}&quot;</strong> ativa.
              Deseja substituí-la por <strong>&quot;{assignConfirmData.dietaNovaNome}&quot;</strong>?
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setShowAssignConfirm(false)}>Cancelar</button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={async () => {
                  try {
                    const token = getToken();
                    await axios.post(`${apiUrl}/dietas/assign/${assignConfirmData.cativeiroId}`, { dietaId: assignConfirmData.dietaId, ativo: true }, { headers: { Authorization: `Bearer ${token}` } });
                    await loadDietaAtual(assignConfirmData.cativeiroId);
                    setAssignForm({ cativeiroId: '', dietaId: '' });
                    setShowAssignConfirm(false);
                    setAssignConfirmData(null);
                    setMasterNotification({ show: true, message: `Dieta substituída com sucesso!`, type: 'success' });
                  } catch (e) { setMasterNotification({ show: true, message: 'Erro ao substituir: ' + (e?.response?.data?.error || e.message), type: 'error' }); }
                }}
              >
                Sim, substituir
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Flash notification */}
      <Modal isOpen={showDeleteConvModal} onClose={() => setShowDeleteConvModal(false)} title="Excluir conversa?" showCloseButton>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, fontSize: '0.95rem', color: '#4b5563', lineHeight: 1.5 }}>
            Tem certeza que deseja excluir esta conversa com <strong>{getConversationTitle(chatConversations.find(c => c._id === chatSelectedId) || {})}</strong>?
            Todas as mensagens serão apagadas permanentemente.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setShowDeleteConvModal(false)}>Cancelar</button>
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
                  setMasterNotification({ show: true, message: 'Conversa excluída com sucesso!', type: 'success' });
                } catch (e) {
                  setShowDeleteConvModal(false);
                  setMasterNotification({ show: true, message: 'Erro ao excluir conversa: ' + (e?.response?.data?.error || e.message), type: 'error' });
                }
              }}
            >Excluir</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showDeleteSensorModal} onClose={() => setShowDeleteSensorModal(false)} title="Excluir sensor?" showCloseButton>
        {deleteSensorData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ margin: 0, fontSize: '0.95rem', color: '#4b5563', lineHeight: 1.5 }}>
              Tem certeza que deseja excluir o sensor <strong>&quot;{deleteSensorData.apelido}&quot;</strong> ({deleteSensorData.tipo})?
              Esta ação não pode ser desfeita.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setShowDeleteSensorModal(false)}>Cancelar</button>
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
                    setMasterNotification({ show: true, message: 'Sensor excluído com sucesso!', type: 'success' });
                  } catch (e) { setMasterNotification({ show: true, message: 'Erro ao excluir sensor: ' + (e?.response?.data?.error || e.message), type: 'error' }); }
                }}
              >Excluir</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={showDeleteDietaModal} onClose={() => setShowDeleteDietaModal(false)} title="Excluir dieta?" showCloseButton>
        {deleteDietaData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ margin: 0, fontSize: '0.95rem', color: '#4b5563', lineHeight: 1.5 }}>
              Tem certeza que deseja excluir a dieta <strong>&quot;{deleteDietaData.descricao}&quot;</strong>?
              Esta ação não pode ser desfeita.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setShowDeleteDietaModal(false)}>Cancelar</button>
              <button
                className={`${styles.btn}`}
                style={{ background: '#ef4444', color: '#fff', border: 'none' }}
                onClick={async () => {
                  try {
                    const token = getToken();
                    await axios.delete(`${apiUrl}/dietas/${deleteDietaData.id}`, { headers: { Authorization: `Bearer ${token}` } });
                    setShowDeleteDietaModal(false);
                    setDeleteDietaData(null);
                    await load();
                    setMasterNotification({ show: true, message: 'Dieta excluída com sucesso!', type: 'success' });
                  } catch (e) { setMasterNotification({ show: true, message: 'Erro ao excluir dieta: ' + (e?.response?.data?.error || e.message), type: 'error' }); }
                }}
              >Excluir</button>
            </div>
          </div>
        )}
      </Modal>

      <Notification
        isVisible={masterNotification.show}
        message={masterNotification.message}
        type={masterNotification.type}
        onClose={() => setMasterNotification({ show: false, message: '', type: 'success' })}
      />

      <Modal isOpen={showLogoutModal} onClose={() => !isLoggingOut && setShowLogoutModal(false)} title="Sair da conta" closeOnBackdropClick={!isLoggingOut}>
        <p style={{ margin: 0, fontSize: '0.95rem', color: '#4b5563', fontFamily: 'Poppins, sans-serif', lineHeight: 1.5 }}>
          Tem certeza que deseja sair? Você precisará fazer login novamente para acessar o sistema.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            onClick={() => setShowLogoutModal(false)}
            disabled={isLoggingOut}
            style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#f9fafb', color: '#374151', fontSize: '0.9rem', fontFamily: 'Poppins, sans-serif', fontWeight: 500, cursor: isLoggingOut ? 'not-allowed' : 'pointer', opacity: isLoggingOut ? 0.5 : 1 }}
          >
            Cancelar
          </button>
          <button
            onClick={confirmLogout}
            disabled={isLoggingOut}
            style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontSize: '0.9rem', fontFamily: 'Poppins, sans-serif', fontWeight: 500, cursor: isLoggingOut ? 'not-allowed' : 'pointer', opacity: isLoggingOut ? 0.7 : 1, minWidth: 80 }}
          >
            {isLoggingOut ? 'Saindo...' : 'Sair'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
