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
      setError('Erro ao carregar suas solicitações');
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
    editar_cativeiro: 'Editar cativeiro',
    editar_sensor: 'Editar sensor',
    cadastrar_cativeiro: 'Cadastrar cativeiro',
    excluir_cativeiro: 'Excluir cativeiro',
    cadastrar_sensor: 'Cadastrar sensor',
    excluir_sensor: 'Excluir sensor',
    editar_cativeiro_add_sensor: 'Adicionar sensor ao cativeiro',
    editar_cativeiro_remove_sensor: 'Remover sensor do cativeiro',
    editar_dieta: 'Gerenciar dieta de cativeiro',
    aplicar_calibracao: 'Aplicar calibração'
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
      alert('Falha ao excluir. Tente novamente.');
    } finally {
      setShowDeleteModal(false);
      setItemToDelete(null);
    }
  };

  const renderPayloadPretty = (item) => {
    const { action, payload = {} } = item;
    if (action === 'editar_cativeiro') {
      const fields = [];
      if (payload.cativeiroNome) fields.push({ label: 'Cativeiro', value: payload.cativeiroNome });
      if (typeof payload.nome !== 'undefined') fields.push({ label: 'Nome do cativeiro', value: payload.nome });
      if (typeof payload.id_tipo_camarao !== 'undefined') fields.push({ label: 'Tipo de camarão', value: getTipoCamaraoNome(payload.id_tipo_camarao) });
      if (typeof payload.data_instalacao !== 'undefined') fields.push({ label: 'Data de instalação', value: payload.data_instalacao ? new Date(payload.data_instalacao).toLocaleDateString('pt-BR') : 'N/A' });
      if (typeof payload.temp_media_diaria !== 'undefined') fields.push({ label: 'Temperatura ideal (°C)', value: payload.temp_media_diaria });
      if (typeof payload.ph_medio_diario !== 'undefined') fields.push({ label: 'pH ideal', value: payload.ph_medio_diario });
      if (typeof payload.amonia_media_diaria !== 'undefined') fields.push({ label: 'Amônia ideal (mg/L)', value: payload.amonia_media_diaria });
      if (fields.length === 0) return null;
      return (
        <div className={cardStyles.detalhes}>
          <div className={cardStyles.detalhesTitulo}>Alterações solicitadas</div>
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
      if (payload.cativeiroNome) fields.push({ label: 'Cativeiro', value: payload.cativeiroNome });
      if (payload.descricao) fields.push({ label: 'Descrição', value: payload.descricao });
      if (typeof payload.quantidade !== 'undefined') fields.push({ label: 'Quantidade', value: `${payload.quantidade}g por refeição` });
      if (typeof payload.quantidadeRefeicoes !== 'undefined') fields.push({ label: 'Refeições/dia', value: payload.quantidadeRefeicoes });
      if (horarios.length > 0) fields.push({ label: 'Horários', value: horarios.join(', ') });
      if (fields.length === 0) return null;
      return (
        <div className={cardStyles.detalhes}>
          <div className={cardStyles.detalhesTitulo}>Alterações solicitadas</div>
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
      return <DetalhesCalibracao payload={payload} rodape="O resultado passa a valer depois que o administrador da fazenda aprovar." />;
    }

    // Demais ações (inclusive antigas, como relatório individual): lista legível, ids técnicos ocultos
    return <DetalhesGenericos payload={payload} titulo="Detalhes da solicitação" />;
  };

  const titulo = 'Minhas Solicitações';
  const subtitulo = 'Histórico e status das suas solicitações';

  if (authLoading || loading) {
    return (
      <MemberLayout title={titulo} subtitle={subtitulo}>
        <SolicitacoesVazio carregando texto="Carregando solicitações..." />
      </MemberLayout>
    );
  }
  if (!isAuthenticated) return (
    <MemberLayout title={titulo} subtitle={subtitulo}>
      <SolicitacoesVazio titulo="Sessão expirada" texto="Faça login novamente para ver suas solicitações." />
    </MemberLayout>
  );
  if (error) return (
    <MemberLayout title={titulo} subtitle={subtitulo}>
      <SolicitacoesVazio titulo="Erro ao carregar" texto={error} />
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
        rotulo="solicitações"
      />

      {filtered.length === 0 && (
        items.length > 0
          ? <SolicitacoesVazio titulo="Nada encontrado" texto="Nenhuma solicitação nessa data." />
          : <SolicitacoesVazio titulo="Nenhuma solicitação" texto="Você ainda não enviou solicitações ao administrador." />
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

      <Modal isOpen={showDeleteModal} onClose={() => { setShowDeleteModal(false); setItemToDelete(null); }} title="Excluir solicitação">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>Tem certeza que deseja excluir esta solicitação?</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className={`${cardStyles.btn} ${cardStyles.btnFalse}`}
              onClick={() => { setShowDeleteModal(false); setItemToDelete(null); }}>
              Cancelar
            </button>
            <button type="button" className={`${cardStyles.btn} ${cardStyles.btnDanger}`} onClick={confirmDelete}>
              Excluir
            </button>
          </div>
        </div>
      </Modal>
    </MemberLayout>
  );
}
