import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import Modal from '../../components/Modal';

import { useAuth } from '@/hooks/useAuth';

import { HiOutlineClipboardList, HiOutlineBell, HiOutlineExclamationCircle, HiOutlineOfficeBuilding, HiOutlineUsers, HiOutlineChatAlt2, HiOutlineChartBar } from 'react-icons/hi';
import { useUnreadAvisos } from '@/hooks/useUnreadAvisos';
import styles from '../../styles/panel.module.css';
import Notification from '../../components/Notification';
import AdminMonitoramentoTab from '../../components/AdminMonitoramentoTab';



export default function AdminPanel() {
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const router = useRouter();
  const [initialTabApplied, setInitialTabApplied] = useState(false);
  const [items, setItems] = useState([]);
  const [allRequests, setAllRequests] = useState([]);
  const [filteredRequests, setFilteredRequests] = useState([]);
  const [cativeiros, setCativeiros] = useState([]);
  const [fazendas, setFazendas] = useState([]);
  const [users, setUsers] = useState([]);
  const [tiposCamarao, setTiposCamarao] = useState([]);
  const [, setCondicoesIdeais] = useState([]);
  const [sensores, setSensores] = useState([]); // mantemos carregado para futuras funcionalidades
  const [previewImage, setPreviewImage] = useState({});  // cativeiroId -> imageUrl
  const [photoErrors, setPhotoErrors] = useState({});   // cativeiroId -> bool (foto não encontrada)
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [funcionarios, setFuncionarios] = useState([]);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const fileInputRef = useRef(null);
  const [uploadTargetCativeiro, setUploadTargetCativeiro] = useState(null);
  const [showNewTipoModal, setShowNewTipoModal] = useState(false);
  const [showAssociarFuncionarioModal, setShowAssociarFuncionarioModal] = useState(false);
  const [funcionarioEmail, setFuncionarioEmail] = useState('');
  const [associarFuncionarioLoading, setAssociarFuncionarioLoading] = useState(false);
  const [newTipoNome, setNewTipoNome] = useState('');
  const [swapForm, setSwapForm] = useState({ cativeiroId: '', temperatura: false, ph: false, amonia: false });
  const [linkForm, setLinkForm] = useState({ cativeiroId: '', temperatura: false, ph: false, amonia: false, allowed: { temperatura: true, ph: true, amonia: true } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('cativeiros'); // requests | solicitacoes | cativeiros
  const [requesterFilter, setRequesterFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  // Chat state
  const [chatConversations, setChatConversations] = useState([]);
  const [chatSelectedId, setChatSelectedId] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatText, setChatText] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [showDeleteConvModal, setShowDeleteConvModal] = useState(false);
  const [adminNotification, setAdminNotification] = useState({ show: false, message: '', type: 'success' });
  const chatEndRef = useRef(null);

  const getMyId = () => {
    const fromUser = user?.id || user?._id;
    const stored = (typeof window !== 'undefined') ? (JSON.parse(sessionStorage.getItem('usuarioCamarize') || localStorage.getItem('usuarioCamarize') || '{}')) : {};
    const fromStorage = stored?.id || stored?._id;
    return String(fromUser || fromStorage || '');
  };

  const getDisplayName = (senderId) => {
    const me = getMyId();
    if (String(senderId) === String(me)) return 'Você (Admin)';
    const u = (users || []).find(x => String(x.id || x._id) === String(senderId));
    // users aqui contém masters; default para Master
    return u?.nome || u?.email || 'Master';
  };

  const getConversationTitle = (conv) => {
    const me = getMyId();
    const otherId = (Array.isArray(conv?.participants) ? conv.participants : []).find(p => String(p) !== String(me));
    const u = (users || []).find(x => String(x.id || x._id) === String(otherId));
    return u?.nome || u?.email || 'Master';
  };
  const [expandedFazenda, setExpandedFazenda] = useState({}); // id -> bool
  const [expandedCativeiro, setExpandedCativeiro] = useState({}); // id -> bool
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    id: '', cativeiroNome: '', nome: '', id_tipo_camarao: '',
    data_instalacao: '', temp_media_diaria: '', ph_medio_diario: '', amonia_media_diaria: ''
  });
  const [showLimitesModal, setShowLimitesModal] = useState(false);
  const [limitesForm, setLimitesForm] = useState({ id: '', nome: '', minimo: '', maximo: '', phLimiar: '', amoniaLimiarPct: '' });
  const [limitesSubmitting, setLimitesSubmitting] = useState(false);

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

  // Dietas por cativeiro (cache simples)
  const [cativeiroDieta, setCativeiroDieta] = useState({}); // id -> { descricao }
  const [showDietaModal, setShowDietaModal] = useState(false);
  const [dietaModalCativeiroId, setDietaModalCativeiroId] = useState(null);
  const [dietaModalCativeiroNome, setDietaModalCativeiroNome] = useState('');
  const [dietaForm, setDietaForm] = useState({
    descricao: '',
    quantidade: '',
    quantidadeRefeicoes: 1,
    horarios: [''],
  });

  const [newCativeiro, setNewCativeiro] = useState({
    fazendaId: '',
    nome: '',
    id_tipo_camarao: '',
    data_instalacao: '',
    temp_media_diaria: '',
    ph_medio_diario: '',
    amonia_media_diaria: ''
  });

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  // Deriva o tipo do sensor a partir de múltiplas fontes
  const getSensorType = (sensor) => {
    // 1) Se o sensor vier populado com id_tipo_sensor como objeto, usar descricao/nome
    try {
      if (!sensor) return '';
      if (typeof sensor.id_tipo_sensor === 'object' && sensor.id_tipo_sensor) {
        const desc = sensor.id_tipo_sensor.descricao || sensor.id_tipo_sensor.nome;
        if (desc) return String(desc).toLowerCase();
      }
      // 2) direto do campo (string) ou campo alternativo 'tipo'
      const directField = sensor.id_tipo_sensor || sensor.tipo;
      if (typeof directField === 'string' && directField.trim()) return directField.toLowerCase();

      // 3) lookup pelo id (quando `sensor` é id ou objeto com _id)
      const sid = typeof sensor === 'string' ? sensor : (sensor?._id || sensor?.id);
      if (sid) {
        const full = (sensores || []).find(x => String(x._id) === String(sid));
        if (full) {
          if (typeof full.id_tipo_sensor === 'object' && full.id_tipo_sensor) {
            const d = full.id_tipo_sensor.descricao || full.id_tipo_sensor.nome;
            if (d) return String(d).toLowerCase();
          }
          if (typeof full.id_tipo_sensor === 'string' && full.id_tipo_sensor.trim()) return full.id_tipo_sensor.toLowerCase();
          const alias = String(full?.apelido || '').toLowerCase();
          if (alias.includes('temp')) return 'temperatura';
          if (alias.includes('ph')) return 'ph';
          if (alias.includes('amonia') || alias.includes('nh3')) return 'amonia';
        }
      }

      // 4) heurística pelo próprio apelido no objeto parcial
      const aliasLocal = String(sensor && sensor.apelido || '').toLowerCase();
      if (aliasLocal.includes('temp')) return 'temperatura';
      if (aliasLocal.includes('ph')) return 'ph';
      if (aliasLocal.includes('amonia') || aliasLocal.includes('nh3')) return 'amonia';
    } catch (e) {
      // se algo falhar, devolve string vazia para evitar mostrar [object Object]
      return '';
    }
    return '';
  };

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [reqs, fzs, cats, tipos, condicoes, sens, us, funcs] = await Promise.all([
        axios.get(`${apiUrl}/requests`, { headers }),
        axios.get(`${apiUrl}/fazendas`, { headers }),
        axios.get(`${apiUrl}/cativeiros`, { headers }),
        axios.get(`${apiUrl}/camaroes`, { headers }),
        axios.get(`${apiUrl}/condicoes-ideais`, { headers }),
        axios.get(`${apiUrl}/sensores`, { headers }),
        axios.get(`${apiUrl}/users/masters/all`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${apiUrl}/users/funcionarios/fazenda`, { headers }).catch(() => ({ data: [] })),
      ]);
      setItems(reqs.data);
      setFazendas(fzs.data);
      setCativeiros(prev => {
        const sensorMap = {};
        prev.forEach(c => { if (Array.isArray(c.sensores)) sensorMap[c._id] = c.sensores; });
        return cats.data.map(c => sensorMap[c._id] ? { ...c, sensores: sensorMap[c._id] } : c);
      });
      setTiposCamarao(tipos.data);
      setCondicoesIdeais(condicoes.data);
      setSensores(sens.data);
      setUsers(us.data || []);
      setFuncionarios(funcs.data || []);
    } catch (e) {
      console.error('Erro ao carregar dados:', e);
      const errorMessage = e?.response?.data?.error || e?.message || 'Erro ao carregar dados';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const loadAllRequests = async () => {
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.get(`${apiUrl}/requests/all-admin`, { headers });
      return response.data;
    } catch (e) {
      console.error('Erro ao carregar requests dos funcionários:', e);
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
    if (role === 'master') { router.replace('/master'); return; }
    if (role !== 'admin') { router.replace('/login'); }
  }, [authLoading, isAuthenticated, user]);

  // Respeitar query ?tab=... para abrir diretamente a aba correspondente
  useEffect(() => {
    if (typeof window === 'undefined' || initialTabApplied) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const qTab = params.get('tab');
      if (qTab && ['requests', 'solicitacoes', 'cativeiros', 'monitoramento'].includes(qTab)) {
        setTab(qTab);
      }
      setInitialTabApplied(true);
    } catch {}
  }, [initialTabApplied]);

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
    return () => { if (timer) clearInterval(timer); };
  }, [tab, chatSelectedId]);

  const openConversation = async (convId) => {
    try {
      setChatSelectedId(convId);
      setChatLoading(true);
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const msgs = await axios.get(`${apiUrl}/chat/conversations/${convId}/messages`, { headers });
      setChatMessages(msgs.data || []);
    } catch {} finally {
      setChatLoading(false);
    }
  };

  const startConversationWithMaster = async (masterId) => {
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      let me = (user?.id) || (JSON.parse(sessionStorage.getItem('usuarioCamarize') || localStorage.getItem('usuarioCamarize') || '{}')?.id);
      if (!me) {
        const meRes = await axios.get(`${apiUrl}/users/me`, { headers });
        me = meRes.data?._id || meRes.data?.id;
      }
      if (!me || !masterId) throw new Error('IDs inválidos');
      const res = await axios.post(`${apiUrl}/chat/conversations`, { adminId: me, masterId }, { headers });
      await loadConversationsOnce();
      setTab('chat');
      if (res?.data?._id) openConversation(res.data._id);
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || 'Falha desconhecida';
      alert('Não foi possível iniciar a conversa: ' + msg);
    }
  };

  const loadConversationsOnce = async () => {
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const convs = await axios.get(`${apiUrl}/chat/conversations/mine`, { headers });
      setChatConversations(convs.data || []);
    } catch {}
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
    let filtered = [...allRequests];
    if (requesterFilter) {
      filtered = filtered.filter(item =>
        item.requesterUser?.nome?.toLowerCase().includes(requesterFilter.toLowerCase()) ||
        item.requesterUser?.email?.toLowerCase().includes(requesterFilter.toLowerCase())
      );
    }
    if (dateFilter) {
      const [year, month, day] = dateFilter.split('-').map(Number);
      const filterDate = new Date(year, month - 1, day);
      const fy = filterDate.getFullYear();
      const fm = filterDate.getMonth();
      const fd = filterDate.getDate();
      filtered = filtered.filter(item => {
        const d = new Date(item.createdAt);
        return d.getFullYear() === fy && d.getMonth() === fm && d.getDate() === fd;
      });
    }
    setFilteredRequests(filtered);
    // Filtro por ação (nome da ação ou label mapeada)
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

  const loadSensorsForCativeiro = async (cativeiroId) => {
    try {
      const token = getToken();
      const res = await axios.get(`${apiUrl}/cativeiros/${cativeiroId}/sensores`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const raw = Array.isArray(res.data) ? res.data : [];
      const sensores = raw.map(item => item?.id_sensor || item).filter(Boolean);
      setCativeiros(prev => prev.map(c => c._id === cativeiroId ? { ...c, sensores } : c));
    } catch (e) {}
  };

  const loadDietaAtual = async (cativeiroId) => {
    try {
      const res = await axios.get(`${apiUrl}/dietas/atual/${cativeiroId}`);
      if (res?.data) {
        setCativeiroDieta(prev => ({ ...prev, [cativeiroId]: res.data }));
      }
    } catch (e) {
      setCativeiroDieta(prev => ({ ...prev, [cativeiroId]: null }));
    }
  };

  const solicitarEdicaoDieta = async () => {
    if (!dietaForm.quantidade || String(dietaForm.quantidade).trim() === '') {
      setAdminNotification({ show: true, message: 'Quantidade de ração (g) é obrigatória.', type: 'error' });
      return;
    }
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const atual = cativeiroDieta[dietaModalCativeiroId];
      const horariosValidos = (dietaForm.horarios || []).slice(0, dietaForm.quantidadeRefeicoes).filter(h => h);
      const payload = {
        cativeiroId: dietaModalCativeiroId,
        cativeiroNome: dietaModalCativeiroNome,
        dietaId: atual?.dietaId || null,
        descricao: dietaForm.descricao || '',
        quantidade: dietaForm.quantidade,
        quantidadeRefeicoes: dietaForm.quantidadeRefeicoes,
        horarios: horariosValidos,
      };
      await axios.post(`${apiUrl}/requests`, { action: 'editar_dieta', payload }, { headers });
      setShowDietaModal(false);
      setAdminNotification({ show: true, message: 'Solicitação de dieta enviada ao Master.', type: 'success' });
    } catch (e) {
      setAdminNotification({ show: true, message: 'Erro ao enviar solicitação: ' + (e?.response?.data?.error || e.message), type: 'error' });
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
    };
    return map[action] || action;
  };

  const formatRequestDetails = (action, payload) => {
    const getCativeiroNomeById = (cid) => {
      const c = cativeiros.find(x => String(x._id) === String(cid));
      return c ? (c.nome || c._id) : (cid || 'N/A');
    };
    if (action === 'editar_cativeiro_add_sensor') {
      const nome = getCativeiroNomeById(payload?.cativeiroId);
      return (
        <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, marginTop: 8, border: '1px solid #e2e8f0' }}>
          <div><strong>Cativeiro:</strong> {nome}</div>
          <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>Solicitação de vínculo de sensores (Master decidirá quais associar).</div>
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
    if (action === 'editar_cativeiro') {
      const nome = payload?.cativeiroNome || getCativeiroNomeById(payload?.cativeiroId);
      const tipoCam = typeof payload?.id_tipo_camarao !== 'undefined' ? (tiposCamarao.find(t => String(t._id) === String(payload.id_tipo_camarao)) || null) : null;
      return (
        <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, marginTop: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ marginBottom: 6 }}><strong>Cativeiro:</strong> {nome}</div>
          <div><strong>Alterações solicitadas:</strong></div>
          <ul style={{ marginTop: 6, marginLeft: 18 }}>
            {typeof payload?.nome !== 'undefined' && (<li><strong>Nome:</strong> {payload.nome || 'N/A'}</li>)}
            {typeof payload?.id_tipo_camarao !== 'undefined' && (
              <li><strong>Tipo de Camarão:</strong> {tipoCam ? tipoCam.nome : payload.id_tipo_camarao}</li>
            )}
            {typeof payload?.data_instalacao !== 'undefined' && (
              <li><strong>Data de instalação:</strong> {payload.data_instalacao ? new Date(payload.data_instalacao).toLocaleDateString('pt-BR') : 'N/A'}</li>
            )}
            {typeof payload?.temp_media_diaria !== 'undefined' && (<li><strong>Temp ideal (°C):</strong> {payload.temp_media_diaria}</li>)}
            {typeof payload?.ph_medio_diario !== 'undefined' && (<li><strong>pH ideal:</strong> {payload.ph_medio_diario}</li>)}
            {typeof payload?.amonia_media_diaria !== 'undefined' && (<li><strong>Amônia ideal (mg/L):</strong> {payload.amonia_media_diaria}</li>)}
          </ul>
        </div>
      );
    }
    if (action === 'editar_sensor') {
      // Mostrar tipo e apelido do sensor quando disponível em `sensores`
      const sensorMatch = (sensores || []).find(s => String(s._id) === String(payload?.id) || String(s.id) === String(payload?.id));
      const tipo = sensorMatch ? (typeof sensorMatch.id_tipo_sensor === 'object' ? sensorMatch.id_tipo_sensor.descricao || sensorMatch.id_tipo_sensor.nome : sensorMatch.id_tipo_sensor) : null;
      const apelido = sensorMatch ? (sensorMatch.apelido || '') : (payload?.apelido || 'N/A');
      return (
        <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, marginTop: 8, border: '1px solid #e2e8f0' }}>
          <div><strong>Sensor:</strong> {tipo ? `${tipo} | ${apelido}` : (payload?.apelido || payload?.id || 'N/A')}</div>
          {payload?.apelido && <div><strong>Novo Apelido:</strong> {payload.apelido}</div>}
        </div>
      );
    }
    if (action === 'editar_dieta') {
      const horarios = Array.isArray(payload?.horarios) ? payload.horarios.filter(h => h) : [];
      return (
        <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, marginTop: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ marginBottom: 6 }}><strong>Cativeiro:</strong> {payload?.cativeiroNome || payload?.cativeiroId || 'N/A'}</div>
          <ul style={{ margin: '6px 0 0 18px' }}>
            {payload?.descricao && <li><strong>Descrição:</strong> {payload.descricao}</li>}
            {typeof payload?.quantidade !== 'undefined' && <li><strong>Quantidade:</strong> {payload.quantidade}g por refeição</li>}
            {typeof payload?.quantidadeRefeicoes !== 'undefined' && <li><strong>Refeições/dia:</strong> {payload.quantidadeRefeicoes}</li>}
            {horarios.length > 0 && <li><strong>Horários:</strong> {horarios.join(', ')}</li>}
          </ul>
        </div>
      );
    }
    return (
      <pre style={{ background: '#f9fafb', padding: 8, borderRadius: 4, fontSize: '12px', marginTop: 4, overflow: 'auto', maxHeight: '200px' }}>{JSON.stringify(payload, null, 2)}</pre>
    );
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

  const getFazendaName = (id) => {
    const idStr = String(id);
    const f = fazendas.find(fz => String(fz._id) === idStr);
    if (!f) return 'Sem fazenda';
    return f.nome || id;
  };

  const solicitarVinculoSensores = async (cativeiro) => {
    // Garante sensores atualizados antes de calcular faltantes
    let sensoresAtuais = Array.isArray(cativeiro.sensores) && cativeiro.sensores.length > 0 ? cativeiro.sensores : [];
    try {
      if (sensoresAtuais.length === 0) {
        const token = getToken();
        const res = await axios.get(`${apiUrl}/cativeiros/${cativeiro._id}/sensores`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const raw = Array.isArray(res.data) ? res.data : [];
        sensoresAtuais = raw.map(item => item?.id_sensor || item).filter(Boolean);
      }
    } catch {}

    const tiposAtuais = new Set((sensoresAtuais || []).map(s => getSensorType(s)).filter(Boolean));
    const faltaTemperatura = !tiposAtuais.has('temperatura');
    const faltaPh = !tiposAtuais.has('ph');
    const faltaAmonia = !tiposAtuais.has('amonia');

    if (!faltaTemperatura && !faltaPh && !faltaAmonia) {
      setAdminNotification({ show: true, message: 'Este cativeiro já possui sensores de temperatura, pH e amônia.', type: 'error' });
      return;
    }

    setLinkForm({
      cativeiroId: cativeiro._id,
      temperatura: false,
      ph: false,
      amonia: false,
      allowed: { temperatura: faltaTemperatura, ph: faltaPh, amonia: faltaAmonia }
    });
    setShowLinkModal(true);
  };

  const abrirSwapModal = (cativeiroId) => {
    setSwapForm({ cativeiroId, temperatura: false, ph: false, amonia: false });
    setShowSwapModal(true);
  };

  const solicitarTrocaSensores = async () => {
    try {
      const { cativeiroId, temperatura, ph, amonia } = swapForm;
      if (!cativeiroId) { setShowSwapModal(false); return; }
      const tipos = [];
      if (temperatura) tipos.push('temperatura');
      if (ph) tipos.push('ph');
      if (amonia) tipos.push('amonia');
      if (tipos.length === 0) { setAdminNotification({ show: true, message: 'Selecione pelo menos um tipo para trocar.', type: 'error' }); return; }
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post(`${apiUrl}/requests`, {
        action: 'editar_cativeiro_remove_sensor',
        payload: { cativeiroId, tipos },
        fazenda: null
      }, { headers });
      setShowSwapModal(false);
      setAdminNotification({ show: true, message: 'Solicitação de troca enviada para o Master.', type: 'success' });
    } catch (e) {
      setAdminNotification({ show: true, message: 'Erro ao solicitar troca: ' + (e?.response?.data?.error || e.message), type: 'error' });
    }
  };

  const solicitarEdicaoCativeiro = async () => {
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const { id, cativeiroNome, nome, id_tipo_camarao, data_instalacao, temp_media_diaria, ph_medio_diario, amonia_media_diaria } = editForm;
      const payload = { cativeiroId: id, cativeiroNome, nome, id_tipo_camarao };
      if (data_instalacao) payload.data_instalacao = new Date(data_instalacao).toISOString();
      if (temp_media_diaria !== '') payload.temp_media_diaria = temp_media_diaria;
      if (ph_medio_diario !== '') payload.ph_medio_diario = ph_medio_diario;
      if (amonia_media_diaria !== '') payload.amonia_media_diaria = amonia_media_diaria;
      await axios.post(`${apiUrl}/requests`, { action: 'editar_cativeiro', payload }, { headers });
      setShowEditModal(false);
      setAdminNotification({ show: true, message: 'Solicitação de edição enviada ao Master.', type: 'success' });
    } catch (e) {
      setAdminNotification({ show: true, message: 'Erro ao enviar solicitação: ' + (e?.response?.data?.error || e.message), type: 'error' });
    }
  };

  // Handlers to upload photo for a cativeiro (used by the "Alterar foto" button)
  const handleCativeiroFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setAdminNotification({ show: true, message: 'Por favor selecione uma imagem.', type: 'error' }); e.target.value = ''; return; }
    if (file.size > 5 * 1024 * 1024) { setAdminNotification({ show: true, message: 'A imagem deve ter menos de 5MB.', type: 'error' }); e.target.value = ''; return; }
    if (!uploadTargetCativeiro) { setAdminNotification({ show: true, message: 'Alvo inválido para upload.', type: 'error' }); e.target.value = ''; return; }
    const localUrl = URL.createObjectURL(file);
    setPreviewImage(prev => ({ ...prev, [uploadTargetCativeiro]: localUrl }));
    setPhotoErrors(prev => { const next = { ...prev }; delete next[uploadTargetCativeiro]; return next; });
    await uploadCativeiroPhoto(uploadTargetCativeiro, file);
    e.target.value = '';
    setUploadTargetCativeiro(null);
  };

  const uploadCativeiroPhoto = async (cativeiroId, file) => {
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const form = new FormData();
      form.append('foto', file);
      await axios.post(`${apiUrl}/cativeiros/${cativeiroId}/foto`, form, { headers: { ...headers, 'Content-Type': 'multipart/form-data' } });
      setAdminNotification({ show: true, message: 'Foto atualizada com sucesso!', type: 'success' });
      await load();
    } catch (err) {
      setAdminNotification({ show: true, message: 'Falha ao atualizar foto. Tente novamente.', type: 'error' });
      setPreviewImage(prev => { const next = { ...prev }; delete next[cativeiroId]; return next; });
    }
  };

  const act = async (id, op) => {
    const token = getToken();
    await axios.post(`${apiUrl}/requests/${id}/${op}`, {}, { headers: { Authorization: `Bearer ${token}` } });
    await load();
  };

  const applyAndApprove = async (item) => {
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const { action, payload, _id } = item;
      if (action === 'editar_cativeiro' && payload?.cativeiroId) {
        const body = {};
        if (typeof payload.nome !== 'undefined') body.nome = payload.nome;
        if (typeof payload.id_tipo_camarao !== 'undefined') body.id_tipo_camarao = payload.id_tipo_camarao;
        // Suporta formatos alternativos dos campos das condições ideais
        if (typeof payload.temp_media_diaria !== 'undefined') body.temp_media_diaria = payload.temp_media_diaria;
        if (typeof payload.ph_medio_diario !== 'undefined') body.ph_medio_diario = payload.ph_medio_diario;
        if (typeof payload.amonia_media_diaria !== 'undefined') body.amonia_media_diaria = payload.amonia_media_diaria;
        if (typeof payload.temp_ideal !== 'undefined') body.temp_media_diaria = payload.temp_ideal;
        if (typeof payload.ph_ideal !== 'undefined') body.ph_medio_diario = payload.ph_ideal;
        if (typeof payload.amonia_ideal !== 'undefined') body.amonia_media_diaria = payload.amonia_ideal;
        if (payload.condicoes_ideais && typeof payload.condicoes_ideais === 'object') {
          const ci = payload.condicoes_ideais;
          if (typeof ci.temp_ideal !== 'undefined') body.temp_media_diaria = ci.temp_ideal;
          if (typeof ci.ph_ideal !== 'undefined') body.ph_medio_diario = ci.ph_ideal;
          if (typeof ci.amonia_ideal !== 'undefined') body.amonia_media_diaria = ci.amonia_ideal;
        }
        // Se alguma condição ideal foi informada e não veio id_tipo_camarao no payload,
        // enviamos o id_tipo_camarao atual do cativeiro para o backend criar/atualizar CondicoesIdeais
        const hasCondicoes = ['temp_media_diaria','ph_medio_diario','amonia_media_diaria'].some(k => typeof body[k] !== 'undefined');
        if (hasCondicoes && typeof body.id_tipo_camarao === 'undefined') {
          const cat = cativeiros.find(c => c._id === payload.cativeiroId);
          const tipoAtual = cat?.id_tipo_camarao?._id || cat?.id_tipo_camarao;
          if (tipoAtual) body.id_tipo_camarao = tipoAtual;
        }
        if (Object.keys(body).length === 0) {
          alert('Nada para aplicar neste request.');
          return;
        }
        await axios.patch(`${apiUrl}/cativeiros/${payload.cativeiroId}`, body, { headers });
      } else if (action === 'editar_sensor' && payload?.id && payload?.apelido) {
        await axios.patch(`${apiUrl}/sensores/${payload.id}`, { apelido: payload.apelido }, { headers });
      } else {
        alert('Este tipo de solicitação não é leve ou falta informação.');
        return;
      }
      // Recarrega dados do cativeiro para refletir alterações já aplicadas
      await load();
      await act(_id, 'approve');
    } catch (e) {
      alert('Falha ao aplicar alteração: ' + (e?.response?.data?.error || e.message));
    }
  };

  const associarFuncionarioDiretamente = async () => {
    if (!funcionarioEmail || !funcionarioEmail.trim()) {
      alert('Por favor, informe o email do funcionário.');
      return;
    }

    try {
      setAssociarFuncionarioLoading(true);
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };

      // Associar funcionário diretamente à fazenda do admin
      const response = await axios.post(`${apiUrl}/users/associar-funcionario`, {
        email: funcionarioEmail.trim()
      }, { headers });

      alert(response.data.message || 'Funcionário associado com sucesso à sua fazenda!');
      setShowAssociarFuncionarioModal(false);
      setFuncionarioEmail('');
      await load();
    } catch (e) {
      const errorMsg = e?.response?.data?.error || e.message || 'Erro desconhecido';
      alert('Erro ao associar funcionário: ' + errorMsg);
    } finally {
      setAssociarFuncionarioLoading(false);
    }
  };

  const solicitarCriacaoCativeiro = async () => {
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      
      const payload = {
        fazendaId: newCativeiro.fazendaId,
        nome: newCativeiro.nome,
        id_tipo_camarao: newCativeiro.id_tipo_camarao,
        data_instalacao: newCativeiro.data_instalacao,
        temp_media_diaria: newCativeiro.temp_media_diaria,
        ph_medio_diario: newCativeiro.ph_medio_diario,
        amonia_media_diaria: newCativeiro.amonia_media_diaria
      };

      await axios.post(`${apiUrl}/requests`, {
        action: 'cadastrar_cativeiro',
        payload: payload,
        fazenda: newCativeiro.fazendaId
      }, { headers });

      alert('Solicitação de criação de cativeiro enviada para o Master!');
      setShowCreateModal(false);
      setNewCativeiro({
        fazendaId: '',
        nome: '',
        id_tipo_camarao: '',
        data_instalacao: '',
        temp_media_diaria: '',
        ph_medio_diario: '',
        amonia_media_diaria: ''
      });
      await load();
    } catch (e) {
      alert('Erro ao enviar solicitação: ' + (e?.response?.data?.error || e.message));
    }
  };

  const localRole = typeof window !== 'undefined' ? (JSON.parse(sessionStorage.getItem('usuarioCamarize') || localStorage.getItem('usuarioCamarize') || '{}')?.role) : undefined;
  const effectiveRole = user?.role || localRole;
  if (authLoading || loading || !isAuthenticated || !effectiveRole || effectiveRole !== 'admin') return <div className={styles.loadingScreen}>Carregando...</div>;
  if (error) return <div className={styles.loadingScreen} style={{ color: '#ef4444' }}>{error}</div>;

  const adminNavItems = [
    { id: 'requests', icon: HiOutlineClipboardList, label: 'Histórico' },
    { id: 'avisos', icon: HiOutlineExclamationCircle, label: 'Avisos', badge: avisosNaoVistos || null },
    { id: 'solicitacoes', icon: HiOutlineBell, label: 'Solicitações', badge: items.length || null },
    { id: 'cativeiros', icon: HiOutlineOfficeBuilding, label: 'Cativeiros' },
    { id: 'monitoramento', icon: HiOutlineChartBar, label: 'Monitoramento' },
    { id: 'funcionarios', icon: HiOutlineUsers, label: 'Funcionários' },
    { id: 'chat', icon: HiOutlineChatAlt2, label: 'Chat' },
  ];

  const adminPageTitles = {
    requests: ['Histórico', 'Histórico de ações dos funcionários'],
    avisos: ['Avisos', 'Alertas gerados pelo monitoramento dos viveiros'],
    solicitacoes: ['Solicitações', 'Aprovações pendentes de funcionários'],
    cativeiros: ['Fazendas & Cativeiros', 'Gerencie suas fazendas e cativeiros'],
    monitoramento: ['Monitoramento', 'Dashboard e relatórios dos cativeiros em tempo real'],
    funcionarios: ['Funcionários', 'Equipe associada à sua fazenda'],
    chat: ['Chat com Masters', 'Comunicação com os masters do sistema'],
  };

  return (
    <div className={styles.layout}>
      <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleCativeiroFileChange} />

      {mobileMenuOpen && (
        <div className={styles.backdrop} onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* SIDEBAR */}
      <aside className={`${styles.sidebar} ${mobileMenuOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarHeader}>
          <img src="/images/logo.svg" className={styles.sidebarLogo} alt="Logo" />
          <div className={styles.sidebarRole}>Painel Admin</div>
        </div>
        <nav className={styles.sidebarNav}>
          {adminNavItems.map(({ id, icon: Icon, label, badge }) => (
            <button
              key={id}
              className={`${styles.navItem} ${tab === id ? styles.navItemActive : ''}`}
              onClick={() => { setTab(id); if (id === 'chat') loadConversationsOnce(); setMobileMenuOpen(false); }}
            >
              <Icon className={styles.navIcon} />
              <span className={styles.navLabel}>{label}</span>
              {badge > 0 && <span className={styles.navBadge}>{badge}</span>}
            </button>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <div className={styles.userCard}>
            <div className={styles.userAvatar}>{user?.nome?.[0]?.toUpperCase() || 'A'}</div>
            <div className={styles.userInfo}>
              <div className={styles.userName}>{user?.nome || 'Admin'}</div>
              <div className={styles.userRoleBadge}>Administrador</div>
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
            <h1 className={styles.pageTitle}>{(adminPageTitles[tab] || [''])[0]}</h1>
            <p className={styles.pageSubtitle}>{(adminPageTitles[tab] || ['', ''])[1]}</p>
          </div>
        </header>
        <div className={styles.content}>

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
              onClick={() => { setRequesterFilter(''); setDateFilter(''); setActionFilter(''); }}
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
                <strong>{item.requesterUser?.nome || item.requester?.nome || 'N/A'}</strong>
                {(item.requesterUser?.email || item.requester?.email) && (
                  <span style={{ color: '#6b7280', marginLeft: 6 }}>({item.requesterUser?.email || item.requester?.email})</span>
                )}
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: item.payload ? 4 : 0 }}>
                {new Date(item.createdAt).toLocaleString('pt-BR')}
              </div>
              {item.payload && (
                <div>{formatRequestDetails(item.action, item.payload)}</div>
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
                <strong>{item.requesterUser?.nome || item.requester?.nome || 'N/A'}</strong>
                {(item.requesterUser?.email || item.requester?.email) && (
                  <span style={{ color: '#6b7280', marginLeft: 6 }}>({item.requesterUser?.email || item.requester?.email})</span>
                )}
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: item.payload ? 4 : 0 }}>
                {new Date(item.createdAt).toLocaleString('pt-BR')}
              </div>
              {item.payload && (
                <div>{formatRequestDetails(item.action, item.payload)}</div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  onClick={() => applyAndApprove(item)}
                  className={`${styles.btn} ${styles.btnSuccess} ${styles.btnSm}`}
                >
                  Aplicar e Aprovar
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

      {tab === 'cativeiros' && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Fazendas e Cativeiros</h2>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                {fazendas.length} fazenda{fazendas.length !== 1 ? 's' : ''} · {cativeiros.length} cativeiro{cativeiros.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className={`${styles.btn} ${styles.btnSecondary}`}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
              Solicitar novo cativeiro
            </button>
          </div>
          {Object.entries(groupedByFazenda()).map(([fzId, cats]) => (
            <div key={fzId} className={styles.accordion}>
              <div
                onClick={() => setExpandedFazenda(prev => ({ ...prev, [fzId]: !prev[fzId] }))}
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
                    {user?.nome ? `Admin: ${user.nome}` : 'Sem admin responsável'}
                  </div>
                </div>
                <div className={styles.accordionHeaderRight}>
                  <span className={styles.accordionArrow} style={{ display: 'inline-block', transition: 'transform 0.2s', transform: expandedFazenda[fzId] ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                </div>
              </div>
              {expandedFazenda[fzId] && (
                <div className={styles.accordionBody}>
                  {cats.length === 0 && (
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>Nenhum cativeiro nesta fazenda.</p>
                  )}
                  {cats.map(cativeiro => (
                    <div key={cativeiro._id} className={styles.subAccordion}>
                      <div
                        onClick={() => {
                          const willExpand = !expandedCativeiro[cativeiro._id];
                          setExpandedCativeiro(prev => ({ ...prev, [cativeiro._id]: willExpand }));
                          if (willExpand) {
                            loadSensorsForCativeiro(cativeiro._id);
                            if (!cativeiroDieta[cativeiro._id]) loadDietaAtual(cativeiro._id);
                          }
                        }}
                        className={`${styles.subAccordionHeader} ${expandedCativeiro[cativeiro._id] ? styles.subAccordionHeaderOpen : ''}`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 30, height: 30, borderRadius: 7, background: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg width="15" height="15" fill="none" viewBox="0 0 24 24"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 21V12h6v9" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1e293b', lineHeight: 1.2 }}>{cativeiro.nome || cativeiro._id}</div>
                            {(cativeiro.id_tipo_camarao?.nome || (typeof cativeiro.id_tipo_camarao === 'string' && cativeiro.id_tipo_camarao)) && (
                              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 1 }}>
                                {cativeiro.id_tipo_camarao?.nome || cativeiro.id_tipo_camarao}
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {Array.isArray(cativeiro.sensores) && cativeiro.sensores.length > 0 && (
                            <span style={{ background: '#dbeafe', color: '#1d4ed8', borderRadius: 20, padding: '2px 8px', fontSize: '11px', fontWeight: 600, border: '1px solid #bfdbfe' }}>
                              {cativeiro.sensores.length} sensor{cativeiro.sensores.length !== 1 ? 'es' : ''}
                            </span>
                          )}
                          <span style={{ color: '#94a3b8', fontSize: 11, display: 'inline-block', transition: 'transform 0.2s', transform: expandedCativeiro[cativeiro._id] ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                        </div>
                      </div>
                      {expandedCativeiro[cativeiro._id] && (
                        <div className={styles.subAccordionBody}>
                          {/* Action bar */}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
                            <button
                              className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
                              onClick={() => {
                                setEditForm({
                                  id: cativeiro._id,
                                  cativeiroNome: cativeiro.nome || '',
                                  nome: cativeiro.nome || '',
                                  id_tipo_camarao: String(cativeiro.id_tipo_camarao?._id || cativeiro.id_tipo_camarao || ''),
                                  data_instalacao: cativeiro.data_instalacao ? new Date(cativeiro.data_instalacao).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
                                  temp_media_diaria: String(cativeiro.condicoes_ideais?.temp_ideal ?? cativeiro.temp_media_diaria ?? ''),
                                  ph_medio_diario: String(cativeiro.condicoes_ideais?.ph_ideal ?? cativeiro.ph_medio_diario ?? ''),
                                  amonia_media_diaria: String(cativeiro.condicoes_ideais?.amonia_ideal ?? cativeiro.amonia_media_diaria ?? ''),
                                });
                                setShowEditModal(true);
                              }}
                            >
                              <svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path d="M15.232 5.232a3 3 0 1 1 4.243 4.243L7.5 21H3v-4.5L15.232 5.232Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              Solicitar Edição
                            </button>
                            <button
                              className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
                              onClick={() => abrirModalLimites(cativeiro)}
                              title="Configurar limites de temperatura e sensibilidade dos avisos"
                            >
                              <svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              Alertas
                            </button>
                            <button
                              className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
                              onClick={() => abrirHistoricoChave(cativeiro)}
                              title="Ver trilha de quem gerou a chave do dispositivo deste viveiro"
                            >
                              <svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              Chave
                            </button>
                          </div>

                          {/* Info grid */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 8, marginBottom: 18 }}>
                            {[
                              ['Tipo de camarão', cativeiro.id_tipo_camarao?.nome || (typeof cativeiro.id_tipo_camarao === 'string' ? cativeiro.id_tipo_camarao : '—')],
                              ['Instalação', cativeiro.data_instalacao ? new Date(cativeiro.data_instalacao).toLocaleDateString('pt-BR') : '—'],
                              ['Temp ideal', cativeiro.condicoes_ideais?.temp_ideal != null ? `${cativeiro.condicoes_ideais.temp_ideal} °C` : cativeiro.temp_media_diaria ? `${cativeiro.temp_media_diaria} °C` : '—'],
                              ['pH ideal', String(cativeiro.condicoes_ideais?.ph_ideal ?? cativeiro.ph_medio_diario ?? '—')],
                              ['Amônia ideal', cativeiro.condicoes_ideais?.amonia_ideal != null ? `${cativeiro.condicoes_ideais.amonia_ideal} mg/L` : cativeiro.amonia_media_diaria ? `${cativeiro.amonia_media_diaria} mg/L` : '—'],
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
                              {(previewImage[cativeiro._id] || !photoErrors[cativeiro._id]) ? (
                                <img
                                  src={previewImage[cativeiro._id] || `${apiUrl}/cativeiros/${cativeiro._id}/foto`}
                                  alt="Foto do cativeiro"
                                  style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0', flexShrink: 0 }}
                                  onError={() => { if (!previewImage[cativeiro._id]) setPhotoErrors(prev => ({ ...prev, [cativeiro._id]: true })); }}
                                />
                              ) : (
                                <div style={{ width: 48, height: 48, borderRadius: 8, background: '#f1f5f9', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M3 9a2 2 0 0 1 2-2h.93a2 2 0 0 0 1.664-.89l.812-1.22A2 2 0 0 1 10.07 4h3.86a2 2 0 0 1 1.664.89l.812 1.22A2 2 0 0 0 18.07 7H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="13" r="3" stroke="#94a3b8" strokeWidth="1.5"/></svg>
                                </div>
                              )}
                              <button
                                onClick={() => { setUploadTargetCativeiro(cativeiro._id); fileInputRef.current?.click(); }}
                                className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
                              >
                                Alterar foto
                              </button>
                            </div>
                          </div>

                          {/* Sensores */}
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Sensores vinculados</div>
                            {!Array.isArray(cativeiro.sensores) ? (
                              <div style={{ color: '#94a3b8', fontSize: '0.82rem', marginBottom: 10 }}>Carregando...</div>
                            ) : cativeiro.sensores.length === 0 ? (
                              <div style={{ color: '#94a3b8', fontSize: '0.82rem', fontStyle: 'italic', marginBottom: 10 }}>Nenhum sensor vinculado.</div>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                                {cativeiro.sensores.map(s => {
                                  const tipo = getSensorType(s);
                                  const SCFG = { temperatura: { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa', label: 'Temp' }, ph: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', label: 'pH' }, amonia: { bg: '#fdf4ff', color: '#7e22ce', border: '#e9d5ff', label: 'Amônia' }, sensor: { bg: '#f8fafc', color: '#475569', border: '#e2e8f0', label: '—' } };
                                  const cfg = SCFG[tipo] || SCFG.sensor;
                                  return (
                                    <div key={s._id || s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 20, padding: '4px 10px' }}>
                                      <span style={{ color: cfg.color, fontWeight: 700, fontSize: '10px', textTransform: 'uppercase' }}>{cfg.label}</span>
                                      <span style={{ color: '#1e293b', fontWeight: 600, fontSize: '12px' }}>{s.apelido || '—'}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: 8 }}>
                              {(() => {
                                const tiposAtuais = new Set((cativeiro.sensores || []).map(s => getSensorType(s)).filter(Boolean));
                                const allHave = tiposAtuais.has('temperatura') && tiposAtuais.has('ph') && tiposAtuais.has('amonia');
                                return (
                                  <button onClick={() => solicitarVinculoSensores(cativeiro)} disabled={allHave} title={allHave ? 'Já possui sensores de temperatura, pH e amônia' : 'Solicitar vínculo de sensores que faltam'} style={{ flex: 1 }} className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}>
                                    Solicitar Vínculo
                                  </button>
                                );
                              })()}
                              <button onClick={() => abrirSwapModal(cativeiro._id)} className={`${styles.btn} ${styles.btnSm}`} style={{ flex: 1, background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}>
                                Solicitar Troca
                              </button>
                            </div>
                          </div>

                          {/* Dieta ativa */}
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Dieta ativa</div>
                            {cativeiroDieta[cativeiro._id] === undefined && <div style={{ color: '#94a3b8', fontSize: '0.82rem' }}>Carregando...</div>}
                            {cativeiroDieta[cativeiro._id] === null && (
                              <div style={{ color: '#94a3b8', fontSize: '0.82rem', fontStyle: 'italic', background: '#f8fafc', border: '1px dashed #e2e8f0', borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
                                Nenhuma dieta ativa para este cativeiro.
                              </div>
                            )}
                            {cativeiroDieta[cativeiro._id] && (() => {
                              const d = cativeiroDieta[cativeiro._id];
                              const horarios = Array.isArray(d.horarios) && d.horarios.length > 0 ? d.horarios : null;
                              return (
                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 10px', borderRadius: 20, fontSize: '12px', fontWeight: 700, border: '1px solid #bbf7d0' }}>{d.descricao || '—'}</span>
                                    {typeof d.quantidade !== 'undefined' && <span style={{ fontSize: '0.82rem', color: '#166534' }}><b>{d.quantidade}g</b> por refeição</span>}
                                    {typeof d.quantidadeRefeicoes !== 'undefined' && <span style={{ fontSize: '0.82rem', color: '#166534' }}><b>{d.quantidadeRefeicoes}×</b> ao dia</span>}
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
                            <button
                              onClick={() => {
                                const dietaAtual = cativeiroDieta[cativeiro._id];
                                if (dietaAtual) {
                                  const horarios = Array.isArray(dietaAtual.horarios) ? dietaAtual.horarios : [];
                                  const qtd = dietaAtual.quantidadeRefeicoes || (horarios.length > 0 ? horarios.length : 1);
                                  setDietaForm({ descricao: dietaAtual.descricao || '', quantidade: String(dietaAtual.quantidade || ''), quantidadeRefeicoes: qtd, horarios: Array.from({ length: qtd }, (_, i) => horarios[i] ?? '') });
                                } else {
                                  setDietaForm({ descricao: '', quantidade: '', quantidadeRefeicoes: 1, horarios: [''] });
                                }
                                setDietaModalCativeiroId(cativeiro._id);
                                setDietaModalCativeiroNome(cativeiro.nome || '');
                                setShowDietaModal(true);
                              }}
                              style={{ width: '100%' }}
                              className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
                            >
                              Gerenciar Dieta
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {tab === 'monitoramento' && (
        <AdminMonitoramentoTab />
      )}

      {tab === 'funcionarios' && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Funcionários Associados à Fazenda</h2>
            <button
              onClick={() => {
                setFuncionarioEmail('');
                setShowAssociarFuncionarioModal(true);
              }}
              style={{
                padding: '8px 16px',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              Associar Funcionário
            </button>
          </div>

          {funcionarios.length === 0 ? (
            <div style={{ 
              padding: '40px', 
              textAlign: 'center', 
              background: '#f9fafb', 
              borderRadius: 8,
              border: '1px solid #e5e7eb'
            }}>
              <p style={{ color: '#6b7280', margin: 0 }}>
                Nenhum funcionário associado à fazenda ainda.
              </p>
            </div>
          ) : (
            <div>
              {funcionarios.map((funcionario) => (
                <div
                  key={funcionario.id}
                  className={styles.funcionarioCard}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                    {/* Foto do perfil ou inicial */}
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        background: funcionario.foto_perfil 
                          ? `url(${funcionario.foto_perfil}) center/cover`
                          : '#10b981',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: '600',
                        fontSize: '18px',
                        flexShrink: 0
                      }}
                    >
                      {!funcionario.foto_perfil && (funcionario.nome?.[0]?.toUpperCase() || 'F')}
                    </div>

                    {/* Informações do funcionário */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ 
                        fontWeight: '600', 
                        fontSize: '16px',
                        color: '#111827',
                        marginBottom: '4px'
                      }}>
                        {funcionario.nome || 'Sem nome'}
                      </div>
                      <div style={{ 
                        fontSize: '14px', 
                        color: '#6b7280',
                        wordBreak: 'break-word'
                      }}>
                        {funcionario.email}
                      </div>
                      <div style={{ 
                        fontSize: '12px', 
                        color: '#9ca3af',
                        marginTop: '4px'
                      }}>
                        Funcionário
                      </div>
                    </div>

                    {/* Toggle Ativo/Inativo */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          padding: '6px 12px',
                          background: funcionario.ativo ? '#d1fae5' : '#fee2e2',
                          color: funcionario.ativo ? '#065f46' : '#991b1b',
                          borderRadius: 20,
                          fontSize: '12px',
                          fontWeight: '600',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {funcionario.ativo ? 'Ativo' : 'Inativo'}
                      </div>
                      <div
                        onClick={async (e) => {
                          e.stopPropagation();
                          const novoStatus = !funcionario.ativo;
                          
                          try {
                            const token = getToken();
                            const headers = { Authorization: `Bearer ${token}` };
                            const response = await axios.post(
                              `${apiUrl}/users/funcionarios/atualizar-status`,
                              { 
                                funcionarioId: String(funcionario.id),
                                ativo: novoStatus
                              },
                              { headers }
                            );
                            
                            // Atualizar estado local com o valor retornado do servidor
                            const statusAtualizado = response.data?.ativo !== undefined ? response.data.ativo : novoStatus;
                            setFuncionarios(prev => 
                              prev.map(f => 
                                String(f.id) === String(funcionario.id)
                                  ? { ...f, ativo: statusAtualizado }
                                  : f
                              )
                            );
                          } catch (error) {
                            const errorMsg = error?.response?.data?.error || error.message || 'Erro desconhecido';
                            alert('Erro ao atualizar status: ' + errorMsg);
                          }
                        }}
                        style={{
                          width: '50px',
                          height: '26px',
                          borderRadius: '13px',
                          background: funcionario.ativo ? '#10b981' : '#9ca3af',
                          position: 'relative',
                          cursor: 'pointer',
                          transition: 'background 0.3s',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '2px'
                        }}
                      >
                        <div
                          style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            background: 'white',
                            transition: 'transform 0.3s',
                            transform: funcionario.ativo ? 'translateX(24px)' : 'translateX(0)',
                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {funcionarios.length > 0 && (
            <div style={{ 
              marginTop: '20px', 
              padding: '12px', 
              background: '#f0f9ff', 
              borderRadius: 8,
              border: '1px solid #bae6fd',
              fontSize: '13px',
              color: '#0369a1'
            }}>
              Total de funcionários associados: <strong>{funcionarios.length}</strong>
            </div>
          )}
        </section>
      )}

      {tab === 'chat' && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Chat com Masters</h2>
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
                  onChange={(e) => { const val = e.target.value; if (val) { startConversationWithMaster(val); e.target.value = ''; } }}
                  className={styles.formSelect}
                  style={{ width: '100%' }}
                >
                  <option value="">Selecione um master...</option>
                  {(users || []).filter(u => u.role === 'master').map(u => (
                    <option key={u.id || u._id} value={u.id || u._id}>{u.nome || u.email}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Área principal */}
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
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Master</div>
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
                {chatLoading && <div style={{ color: '#94a3b8', fontSize: '0.82rem', textAlign: 'center' }}>Carregando mensagens...</div>}
                {!chatLoading && chatSelectedId && chatMessages.map(m => {
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

      {showSwapModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ background: '#fff', padding: 20, borderRadius: 8, width: '95%', maxWidth: 420 }}>
            <h3 style={{ marginTop: 0 }}>Solicitar troca de sensores</h3>
            <p style={{ marginTop: 0, color: '#555' }}>Selecione os tipos de sensores que deseja trocar neste cativeiro.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={swapForm.temperatura} onChange={(e) => setSwapForm(f => ({ ...f, temperatura: e.target.checked }))} />
                Temperatura
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={swapForm.ph} onChange={(e) => setSwapForm(f => ({ ...f, ph: e.target.checked }))} />
                pH
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={swapForm.amonia} onChange={(e) => setSwapForm(f => ({ ...f, amonia: e.target.checked }))} />
                Amônia
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowSwapModal(false)} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={solicitarTrocaSensores} style={{ border: 'none', background: '#3b82f6', color: '#fff', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}>Solicitar</button>
            </div>
          </div>
        </div>
      )}

      {showLinkModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ background: '#fff', padding: 20, borderRadius: 8, width: '95%', maxWidth: 420 }}>
            <h3 style={{ marginTop: 0 }}>Solicitar vínculo de sensores</h3>
            <p style={{ marginTop: 0, color: '#555' }}>Selecione os tipos de sensores que deseja vincular neste cativeiro.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: linkForm.allowed.temperatura ? 1 : 0.5, pointerEvents: linkForm.allowed.temperatura ? 'auto' : 'none' }} title={linkForm.allowed.temperatura ? '' : 'Já possui sensor de temperatura'}>
                <input type="checkbox" disabled={!linkForm.allowed.temperatura} checked={linkForm.temperatura} onChange={(e) => { if (!linkForm.allowed.temperatura) return; setLinkForm(f => ({ ...f, temperatura: e.target.checked })); }} />
                Temperatura
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: linkForm.allowed.ph ? 1 : 0.5, pointerEvents: linkForm.allowed.ph ? 'auto' : 'none' }} title={linkForm.allowed.ph ? '' : 'Já possui sensor de pH'}>
                <input type="checkbox" disabled={!linkForm.allowed.ph} checked={linkForm.ph} onChange={(e) => { if (!linkForm.allowed.ph) return; setLinkForm(f => ({ ...f, ph: e.target.checked })); }} />
                pH
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: linkForm.allowed.amonia ? 1 : 0.5, pointerEvents: linkForm.allowed.amonia ? 'auto' : 'none' }} title={linkForm.allowed.amonia ? '' : 'Já possui sensor de amônia'}>
                <input type="checkbox" disabled={!linkForm.allowed.amonia} checked={linkForm.amonia} onChange={(e) => { if (!linkForm.allowed.amonia) return; setLinkForm(f => ({ ...f, amonia: e.target.checked })); }} />
                Amônia
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowLinkModal(false)} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={async () => {
                try {
                  const token = getToken();
                  const headers = { Authorization: `Bearer ${token}` };
                  const tipos = [];
                  if (linkForm.allowed.temperatura && linkForm.temperatura) tipos.push('temperatura');
                  if (linkForm.allowed.ph && linkForm.ph) tipos.push('ph');
                  if (linkForm.allowed.amonia && linkForm.amonia) tipos.push('amonia');
                  if (tipos.length === 0) { setAdminNotification({ show: true, message: 'Selecione pelo menos um tipo para vincular.', type: 'error' }); return; }
                  await axios.post(`${apiUrl}/requests`, {
                    action: 'editar_cativeiro_add_sensor',
                    payload: { cativeiroId: linkForm.cativeiroId, tipos },
                    fazenda: null
                  }, { headers });
                  setShowLinkModal(false);
                  setAdminNotification({ show: true, message: 'Solicitação de vínculo enviada para o Master.', type: 'success' });
                } catch (e) {
                  setAdminNotification({ show: true, message: 'Erro ao solicitar vínculo: ' + (e?.response?.data?.error || e.message), type: 'error' });
                }
              }} style={{ border: 'none', background: '#3b82f6', color: '#fff', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}>Solicitar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para solicitar criação de cativeiro */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#fff',
            padding: 24,
            borderRadius: 8,
            width: '95%',
            maxWidth: 600,
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ marginBottom: 16 }}>Solicitar novo cativeiro</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: '14px', fontWeight: '500', color: '#374151' }}>Fazenda:</label>
                <select
                  value={newCativeiro.fazendaId}
                  onChange={(e) => setNewCativeiro(prev => ({ ...prev, fazendaId: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '14px' }}
                >
                  <option value="">Selecione uma fazenda</option>
                  {fazendas.map(fazenda => (
                    <option key={fazenda._id} value={fazenda._id}>
                      {fazenda.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: '14px', fontWeight: '500', color: '#374151' }}>Nome do cativeiro:</label>
                <input
                  type="text"
                  value={newCativeiro.nome}
                  onChange={(e) => setNewCativeiro(prev => ({ ...prev, nome: e.target.value }))}
                  placeholder="Ex: Cativeiro A"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '14px' }}
                />
              </div>

              {/* Dieta removida da criação de cativeiro: usar /dietas e /dietas/assign */}

              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: '14px', fontWeight: '500', color: '#374151' }}>Tipo de camarão:</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    value={newCativeiro.id_tipo_camarao}
                    onChange={(e) => setNewCativeiro(prev => ({ ...prev, id_tipo_camarao: e.target.value }))}
                    style={{ flex: 1, padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '14px' }}
                  >
                    <option value="">Selecione um tipo</option>
                    {tiposCamarao.map(tipo => (
                      <option key={tipo._id} value={tipo._id}>{tipo.nome}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => { setNewTipoNome(''); setShowNewTipoModal(true); }}
                    style={{
                      padding: '10px 12px',
                      background: '#10b981',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: '14px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    + Novo
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: '14px', fontWeight: '500', color: '#374151' }}>Data de instalação:</label>
                <input
                  type="date"
                  value={newCativeiro.data_instalacao}
                  onChange={(e) => setNewCativeiro(prev => ({ ...prev, data_instalacao: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '14px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: '14px', fontWeight: '500', color: '#374151' }}>Condições ideais:</label>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1', minWidth: '120px' }}>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: '12px', color: '#6b7280' }}>Temperatura (°C):</label>
                    <input
                      type="number"
                      step="0.1"
                      value={newCativeiro.temp_media_diaria}
                      onChange={(e) => setNewCativeiro(prev => ({ ...prev, temp_media_diaria: e.target.value }))}
                      placeholder="26.0"
                      style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '14px' }}
                    />
                  </div>
                  <div style={{ flex: '1', minWidth: '100px' }}>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: '12px', color: '#6b7280' }}>pH:</label>
                    <input
                      type="number"
                      step="0.1"
                      value={newCativeiro.ph_medio_diario}
                      onChange={(e) => setNewCativeiro(prev => ({ ...prev, ph_medio_diario: e.target.value }))}
                      placeholder="7.5"
                      style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '14px' }}
                    />
                  </div>
                  <div style={{ flex: '1', minWidth: '140px' }}>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: '12px', color: '#6b7280' }}>Amônia (mg/L):</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newCativeiro.amonia_media_diaria}
                      onChange={(e) => setNewCativeiro(prev => ({ ...prev, amonia_media_diaria: e.target.value }))}
                      placeholder="0.05"
                      style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '14px' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 20, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCreateModal(false)}
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
                onClick={solicitarCriacaoCativeiro}
                disabled={!newCativeiro.fazendaId || !newCativeiro.nome || !newCativeiro.id_tipo_camarao}
                style={{
                  padding: '8px 16px',
                  background: newCativeiro.fazendaId && newCativeiro.nome && newCativeiro.id_tipo_camarao ? '#3b82f6' : '#9ca3af',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: newCativeiro.fazendaId && newCativeiro.nome && newCativeiro.id_tipo_camarao ? 'pointer' : 'not-allowed'
                }}
              >
                Solicitar
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Solicitar edição">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Nome</label>
            <input value={editForm.nome} onChange={(e) => setEditForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome do cativeiro" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Tipo de camarão</label>
            <select value={editForm.id_tipo_camarao} onChange={(e) => setEditForm(f => ({ ...f, id_tipo_camarao: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6 }}>
              <option value="">Selecione um tipo</option>
              {tiposCamarao.map(t => <option key={t._id} value={t._id}>{t.nome}</option>)}
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
            <button onClick={solicitarEdicaoCativeiro} style={{ border: 'none', background: '#3b82f6', color: '#fff', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>Enviar Solicitação</button>
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

      <Modal isOpen={showNewTipoModal} onClose={() => setShowNewTipoModal(false)} title="Novo tipo de camarão">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: '14px', fontWeight: '500', color: '#374151' }}>Nome</label>
            <input
              type="text"
              value={newTipoNome}
              onChange={(e) => setNewTipoNome(e.target.value)}
              placeholder="Ex: Rosa, preto"
              autoFocus
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '14px' }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setShowNewTipoModal(false)} style={{ padding: '8px 16px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Cancelar</button>
            <button
              onClick={async () => {
                try {
                  const nome = (newTipoNome || '').trim();
                  if (!nome) return;
                  const token = getToken();
                  const headers = { Authorization: `Bearer ${token}` };
                  const response = await axios.post(`${apiUrl}/camaroes`, { nome }, { headers });
                  setShowNewTipoModal(false);
                  setNewTipoNome('');
                  setNewCativeiro(prev => ({ ...prev, id_tipo_camarao: response.data._id }));
                  await load();
                } catch (e) {
                  alert('Erro ao criar tipo de camarão: ' + (e?.response?.data?.error || e.message));
                }
              }}
              disabled={!newTipoNome.trim()}
              style={{ padding: '8px 16px', background: newTipoNome.trim() ? '#10b981' : '#9ca3af', color: '#fff', border: 'none', borderRadius: 6, cursor: newTipoNome.trim() ? 'pointer' : 'not-allowed' }}
            >
              Salvar
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal de Dieta */}
      <Modal isOpen={showDietaModal} onClose={() => { setShowDietaModal(false); setDietaModalCativeiroId(null); }} title="Gerenciar Dieta" showCloseButton>
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
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Quantidade por refeição (g) <span style={{ color: '#ef4444' }}>*</span></label>
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
                  setDietaForm(f => ({ ...f, quantidadeRefeicoes: n, horarios: Array.from({ length: n }, (_, i) => (f.horarios || [])[i] ?? '') }));
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
                    value={(dietaForm.horarios || [])[i] || ''}
                    onChange={(e) => setDietaForm(f => { const hs = [...(f.horarios || [])]; hs[i] = e.target.value; return { ...f, horarios: hs }; })}
                    className={styles.filterInput}
                    style={{ flex: 1, boxSizing: 'border-box' }}
                  />
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => { setShowDietaModal(false); setDietaModalCativeiroId(null); }}>Cancelar</button>
            <button
              className={`${styles.btn} ${styles.btnSuccess}`}
              disabled={!dietaForm.quantidade || String(dietaForm.quantidade).trim() === ''}
              onClick={solicitarEdicaoDieta}
            >
              Enviar Solicitação
            </button>
          </div>
        </div>
      </Modal>
      
      {/* Modal para associar funcionário */}
      <Modal isOpen={showAssociarFuncionarioModal} onClose={() => {
        setShowAssociarFuncionarioModal(false);
        setFuncionarioEmail('');
      }} title="Associar Funcionário à Fazenda">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: '14px', fontWeight: '500', color: '#374151' }}>
              Email do Funcionário: <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="email"
              value={funcionarioEmail}
              onChange={(e) => setFuncionarioEmail(e.target.value)}
              placeholder="exemplo@email.com"
              autoFocus
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '14px' }}
            />
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: 4 }}>
              Informe o email do funcionário que já está cadastrado no sistema. O funcionário será associado diretamente à sua fazenda.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                setShowAssociarFuncionarioModal(false);
                setFuncionarioEmail('');
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
              onClick={associarFuncionarioDiretamente}
              disabled={!funcionarioEmail || !funcionarioEmail.trim() || associarFuncionarioLoading}
              style={{
                padding: '8px 16px',
                background: (!funcionarioEmail || !funcionarioEmail.trim() || associarFuncionarioLoading) ? '#9ca3af' : '#10b981',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: (!funcionarioEmail || !funcionarioEmail.trim() || associarFuncionarioLoading) ? 'not-allowed' : 'pointer'
              }}
            >
              {associarFuncionarioLoading ? 'Associando...' : 'Associar Funcionário'}
            </button>
          </div>
        </div>
      </Modal>

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
                  setAdminNotification({ show: true, message: 'Conversa excluída com sucesso!', type: 'success' });
                } catch (e) {
                  setShowDeleteConvModal(false);
                  setAdminNotification({ show: true, message: 'Erro ao excluir conversa: ' + (e?.response?.data?.error || e.message), type: 'error' });
                }
              }}
            >Excluir</button>
          </div>
        </div>
      </Modal>

      <Notification
        isVisible={adminNotification.show}
        message={adminNotification.message}
        type={adminNotification.type}
        onClose={() => setAdminNotification({ show: false, message: '', type: 'success' })}
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
