import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import MemberLayout from "@/components/MemberLayout";
import Modal from "@/components/Modal";
import Notification from "@/components/Notification";
import panelStyles from "@/styles/panel.module.css";
import { useAuthToken, fotoCativeiroUrl } from "@/lib/fotoCativeiro";
import { rotaListaDeCativeiros } from "@/components/Sidebar/menus";

export default function EditCativeiroPage() {
  const authToken = useAuthToken();
  const router = useRouter();
  const { id } = router.query;

  const [cativeiro, setCativeiro] = useState(null);
  const [tiposCamarao, setTiposCamarao] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });

  const [editForm, setEditForm] = useState({
    id: '', cativeiroNome: '', nome: '', id_tipo_camarao: '',
    data_instalacao: '', temp_media_diaria: '', ph_medio_diario: '', amonia_media_diaria: ''
  });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
  const getToken = () =>
    typeof window !== 'undefined'
      ? sessionStorage.getItem('token') || localStorage.getItem('token')
      : null;

  useEffect(() => {
    async function fetchTipos() {
      try {
        const res = await axios.get(`${apiUrl}/tipos-camarao`, { headers: { Authorization: `Bearer ${getToken()}` } });
        setTiposCamarao(Array.isArray(res.data) ? res.data : []);
      } catch { setTiposCamarao([]); }
    }
    fetchTipos();
  }, []);

  useEffect(() => {
    if (!id || !router.isReady) return;
    async function fetchCativeiro() {
      try {
        const token = getToken();
        const res = await axios.get(`${apiUrl}/cativeiros/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setCativeiro(res.data);
      } catch {
        setNotification({ show: true, message: 'Erro ao carregar dados do cativeiro.', type: 'error' });
        router.push(rotaListaDeCativeiros());
      } finally {
        setLoading(false);
      }
    }
    fetchCativeiro();
  }, [id, router.isReady]);

  const abrirModal = () => {
    setEditForm({
      id: cativeiro._id,
      cativeiroNome: cativeiro.nome || '',
      nome: cativeiro.nome || '',
      id_tipo_camarao: String(cativeiro.id_tipo_camarao?._id || cativeiro.id_tipo_camarao || ''),
      data_instalacao: cativeiro.data_instalacao
        ? new Date(cativeiro.data_instalacao).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      temp_media_diaria: String(cativeiro.condicoes_ideais?.temp_ideal ?? cativeiro.temp_media_diaria ?? ''),
      ph_medio_diario: String(cativeiro.condicoes_ideais?.ph_ideal ?? cativeiro.ph_medio_diario ?? ''),
      amonia_media_diaria: String(cativeiro.condicoes_ideais?.amonia_ideal ?? cativeiro.amonia_media_diaria ?? ''),
    });
    setShowEditModal(true);
  };

  const solicitarEdicaoCativeiro = async () => {
    setSubmitting(true);
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const { id: cativeiroId, cativeiroNome, nome, id_tipo_camarao, data_instalacao, temp_media_diaria, ph_medio_diario, amonia_media_diaria } = editForm;
      const payload = { cativeiroId, cativeiroNome, nome, id_tipo_camarao };
      if (data_instalacao) payload.data_instalacao = new Date(data_instalacao).toISOString();
      if (temp_media_diaria !== '') payload.temp_media_diaria = temp_media_diaria;
      if (ph_medio_diario !== '') payload.ph_medio_diario = ph_medio_diario;
      if (amonia_media_diaria !== '') payload.amonia_media_diaria = amonia_media_diaria;
      await axios.post(`${apiUrl}/requests`, { action: 'editar_cativeiro', payload }, { headers });
      setShowEditModal(false);
      setNotification({ show: true, message: 'Solicitação de edição enviada ao administrador!', type: 'success' });
      setTimeout(() => router.push(rotaListaDeCativeiros()), 2200);
    } catch (e) {
      setNotification({ show: true, message: 'Erro ao enviar solicitação: ' + (e?.response?.data?.error || e.message), type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <MemberLayout title="Editar Cativeiro" subtitle="Solicite alterações ao administrador">
        <div className={panelStyles.loadingScreen} style={{ minHeight: 'unset', padding: '60px 0' }}>
          Carregando dados do cativeiro...
        </div>
      </MemberLayout>
    );
  }

  const fotoUrl = fotoCativeiroUrl(apiUrl, id, authToken);

  return (
    <MemberLayout title="Editar Cativeiro" subtitle="Solicite alterações ao administrador">
      <div className={panelStyles.section}>

        {/* Cabeçalho */}
        <div className={panelStyles.sectionHeader} style={{ marginBottom: 20 }}>
          <div>
            <h2 className={panelStyles.sectionTitle}>{cativeiro?.nome || 'Cativeiro'}</h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
              Preencha os campos abaixo para solicitar uma edição ao administrador
            </p>
          </div>
          <button
            className={`${panelStyles.btn} ${panelStyles.btnSecondary} ${panelStyles.btnSm}`}
            onClick={() => router.back()}
          >
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
              <path d="M19 12H5M12 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Voltar
          </button>
        </div>

        {/* Card do cativeiro atual */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ height: 4, background: 'linear-gradient(90deg, #f7b0b7 0%, #a3c7f7 100%)' }} />
          <div style={{ display: 'flex', gap: 16, padding: '16px 18px', alignItems: 'center' }}>
            <img
              src={fotoUrl}
              alt={cativeiro?.nome}
              onError={(e) => { e.target.src = '/images/cativeiro1.jpg'; }}
              style={{ width: 72, height: 72, borderRadius: 10, objectFit: 'cover', flexShrink: 0, border: '1px solid #e2e8f0' }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>{cativeiro?.nome}</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4 }}>
                {cativeiro?.id_tipo_camarao?.nome || cativeiro?.id_tipo_camarao || 'Tipo não informado'}
              </div>
              {cativeiro?.condicoes_ideais && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  {[
                    { label: '🌡️', value: cativeiro.condicoes_ideais.temp_ideal, unit: '°C' },
                    { label: '🧪', value: cativeiro.condicoes_ideais.ph_ideal, unit: '' },
                    { label: '⚗️', value: cativeiro.condicoes_ideais.amonia_ideal, unit: ' mg/L' },
                  ].filter(p => p.value != null).map(p => (
                    <span key={p.label} style={{ background: '#f1f5f9', color: '#475569', fontSize: '11px', padding: '2px 8px', borderRadius: 6, fontWeight: 500 }}>
                      {p.label} {p.value}{p.unit}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Botão abrir modal */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            className={`${panelStyles.btn} ${panelStyles.btnSecondary} ${panelStyles.btnSm}`}
            onClick={abrirModal}
          >
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24">
              <path d="M15.232 5.232a3 3 0 1 1 4.243 4.243L7.5 21H3v-4.5L15.232 5.232Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Solicitar Edição
          </button>
        </div>

        <div className={panelStyles.infoPanel} style={{ marginTop: 14 }}>
          As alterações serão enviadas como solicitação ao administrador da fazenda para aprovação.
        </div>
      </div>

      {/* Modal de edição — idêntico ao admin */}
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
            <button onClick={() => setShowEditModal(false)} disabled={submitting} style={{ border: '1px solid #e5e7eb', background: '#fff', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={solicitarEdicaoCativeiro} disabled={submitting} style={{ border: 'none', background: '#3b82f6', color: '#fff', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>
              {submitting ? 'Enviando...' : 'Enviar Solicitação'}
            </button>
          </div>
        </div>
      </Modal>

      {notification.show && (
        <Notification
          isVisible={notification.show}
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification({ show: false, message: '', type: 'success' })}
        />
      )}
    </MemberLayout>
  );
}
