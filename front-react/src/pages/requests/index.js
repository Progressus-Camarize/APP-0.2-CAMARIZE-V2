import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import axios from 'axios';
import { useAuth } from '@/hooks/useAuth';
import MemberLayout from '@/components/MemberLayout';
import { SolicitacaoCard, SolicitacoesFiltros, SolicitacoesVazio, cardStyles } from '@/components/SolicitacaoCard';
import { rotuloAcao, DetalhesGenericos, DetalhesCalibracao, DetalhesSensor } from '@/lib/solicitacoes';

export default function MyRequests() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [items, setItems] = useState([]);
  const [tiposCamarao, setTiposCamarao] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const getToken = () => (typeof window !== 'undefined' ? (sessionStorage.getItem('token') || localStorage.getItem('token')) : null);

  const load = async () => {
    try {
      setLoading(true);
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [res, tipos] = await Promise.all([
        axios.get(`${apiUrl}/requests/mine`, { headers }),
        axios.get(`${apiUrl}/camaroes`, { headers }).catch(() => ({ data: [] }))
      ]);
      setItems(res.data || []);
      setTiposCamarao(tipos.data || []);
    } catch (e) {
      setError('Failed to load your requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && isAuthenticated) load();
  }, [authLoading, isAuthenticated]);

  const filtered = items.filter(item => {
    if (!dateFilter) return true;
    const [y, m, d] = dateFilter.split('-').map(Number);
    const fd = new Date(y, m - 1, d);
    const di = new Date(item.createdAt);
    return di.getFullYear() === fd.getFullYear() && di.getMonth() === fd.getMonth() && di.getDate() === fd.getDate();
  });

  const actionLabel = (action) => ({
    editar_cativeiro: 'Edit pond',
    editar_sensor: 'Edit sensor',
    cadastrar_cativeiro: 'Create pond',
    excluir_cativeiro: 'Delete pond',
    cadastrar_sensor: 'Register sensor',
    excluir_sensor: 'Delete sensor',
    editar_cativeiro_add_sensor: 'Add sensor to pond',
    editar_cativeiro_remove_sensor: 'Remove sensor from pond',
    editar_dieta: 'Manage pond diet',
    aplicar_calibracao: 'Apply calibration'
  })[action] || rotuloAcao(action);

  const getTipoCamaraoNome = (id) => {
    const t = tiposCamarao.find(x => String(x._id) === String(id));
    return t ? t.nome : id;
  };



  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      await axios.delete(`${apiUrl}/requests/${itemToDelete}`, { headers });
      setItems(prev => prev.filter(x => String(x._id) !== String(itemToDelete)));
    } catch (e) {
      alert('Failed to delete. Please try again.');
    } finally {
      setShowDeleteModal(false);
      setItemToDelete(null);
    }
  };

  const renderPayloadPretty = (item) => {
    const { action, payload = {} } = item;
    if (action === 'editar_cativeiro') {
      const fields = [];
      if (payload.cativeiroNome) fields.push({ label: 'Pond', value: payload.cativeiroNome });
      if (typeof payload.nome !== 'undefined') fields.push({ label: 'Pond name', value: payload.nome });
      if (typeof payload.id_tipo_camarao !== 'undefined') fields.push({ label: 'Shrimp type', value: getTipoCamaraoNome(payload.id_tipo_camarao) });
      if (typeof payload.data_instalacao !== 'undefined') fields.push({ label: 'Installation date', value: payload.data_instalacao ? new Date(payload.data_instalacao).toLocaleDateString('en-US') : 'N/A' });
      if (typeof payload.temp_media_diaria !== 'undefined') fields.push({ label: 'Ideal temperature (°C)', value: payload.temp_media_diaria });
      if (typeof payload.ph_medio_diario !== 'undefined') fields.push({ label: 'Ideal pH', value: payload.ph_medio_diario });
      if (typeof payload.amonia_media_diaria !== 'undefined') fields.push({ label: 'Ideal ammonia (mg/L)', value: payload.amonia_media_diaria });
      if (fields.length === 0) return null;
      return (
        <div className={cardStyles.detalhes}>
          <div className={cardStyles.detalhesTitulo}>Requested changes</div>
          <ul>
            {fields.map((f, i) => (
              <li key={i}><strong>{f.label}:</strong> {String(f.value)}</li>
            ))}
          </ul>
        </div>
      );
    }

    if (action === 'editar_dieta') {
      const horarios = Array.isArray(payload?.horarios) ? payload.horarios.filter(h => h) : [];
      const fields = [];
      if (payload.cativeiroNome) fields.push({ label: 'Pond', value: payload.cativeiroNome });
      if (payload.descricao) fields.push({ label: 'Description', value: payload.descricao });
      if (typeof payload.quantidade !== 'undefined') fields.push({ label: 'Amount', value: `${payload.quantidade}g per meal` });
      if (typeof payload.quantidadeRefeicoes !== 'undefined') fields.push({ label: 'Meals/day', value: payload.quantidadeRefeicoes });
      if (horarios.length > 0) fields.push({ label: 'Times', value: horarios.join(', ') });
      if (fields.length === 0) return null;
      return (
        <div className={cardStyles.detalhes}>
          <div className={cardStyles.detalhesTitulo}>Requested changes</div>
          <ul>
            {fields.map((f, i) => (
              <li key={i}><strong>{f.label}:</strong> {String(f.value)}</li>
            ))}
          </ul>
        </div>
      );
    }

    if (action === 'editar_sensor') {
      return <DetalhesSensor payload={payload} />;
    }

    if (action === 'aplicar_calibracao') {
      return <DetalhesCalibracao payload={payload} rodape="The result takes effect once the farm administrator approves it." />;
    }

    // Demais ações (inclusive antigas, como relatório individual): lista legível, ids técnicos ocultos
    return <DetalhesGenericos payload={payload} titulo="Request details" />;
  };

  const titulo = 'My Requests';
  const subtitulo = 'History and status of your requests';

  if (authLoading || loading) {
    return (
      <MemberLayout title={titulo} subtitle={subtitulo}>
        <SolicitacoesVazio carregando texto="Loading requests..." />
      </MemberLayout>
    );
  }
  if (!isAuthenticated) return (
    <MemberLayout title={titulo} subtitle={subtitulo}>
      <SolicitacoesVazio titulo="Session expired" texto="Log in again to see your requests." />
    </MemberLayout>
  );
  if (error) return (
    <MemberLayout title={titulo} subtitle={subtitulo}>
      <SolicitacoesVazio titulo="Failed to load" texto={error} />
    </MemberLayout>
  );

  return (
    <MemberLayout title={titulo} subtitle={subtitulo}>
      <SolicitacoesFiltros
        data={dateFilter}
        onData={setDateFilter}
        onLimpar={() => setDateFilter('')}
        filtrados={filtered.length}
        total={items.length}
        rotulo="requests"
      />

      {filtered.length === 0 && (
        items.length > 0
          ? <SolicitacoesVazio titulo="Nothing found" texto="No requests on this date." />
          : <SolicitacoesVazio titulo="No requests" texto="You haven't sent any requests to the administrator yet." />
      )}

      <div className={cardStyles.list}>
        {filtered.map(item => (
          <SolicitacaoCard
            key={item._id}
            item={item}
            titulo={actionLabel(item.action)}
            detalhes={item.payload && Object.keys(item.payload).length > 0 ? renderPayloadPretty(item) : null}
          />
        ))}
      </div>

      <Modal isOpen={showDeleteModal} onClose={() => { setShowDeleteModal(false); setItemToDelete(null); }} title="Delete request">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>Are you sure you want to delete this request?</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className={`${cardStyles.btn} ${cardStyles.btnFalse}`}
              onClick={() => { setShowDeleteModal(false); setItemToDelete(null); }}>
              Cancel
            </button>
            <button type="button" className={`${cardStyles.btn} ${cardStyles.btnDanger}`} onClick={confirmDelete}>
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </MemberLayout>
  );
}
