import { useRouter } from 'next/router';
import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import MemberLayout from '@/components/MemberLayout';
import panelStyles from '@/styles/panel.module.css';
import { carregarHistorico } from '@/lib/parametros';
import { useAuthToken, fotoCativeiroUrl } from "@/lib/fotoCativeiro";

const PERIODO_MAP = {
  dia:    { label: 'Últimas 24 horas', dias: 1 },
  semana: { label: 'Últimos 7 dias',   dias: 7 },
  mes:    { label: 'Últimos 30 dias',  dias: 30 },
};

const PARAM_CFG = [
  { key: 'temperatura', label: 'Temp.',  unit: '°C',    decimals: 1, color: '#f97316', icon: '🌡️' },
  { key: 'ph',          label: 'pH',     unit: '',      decimals: 1, color: '#3b82f6', icon: '🧪' },
  { key: 'amonia',      label: 'Amônia experimental', unit: '', decimals: 3, color: '#a855f7', icon: '⚗️' },
];

function calcStats(dados, field) {
  const vals = dados.map(d => d[field]).filter(v => typeof v === 'number');
  if (!vals.length) return { avg: null, min: null, max: null };
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return { avg, min: Math.min(...vals), max: Math.max(...vals) };
}

function fmt(v, decimals, unit) {
  if (v === null || v === undefined) return '—';
  return `${v.toFixed(decimals)}${unit}`;
}

export default function RelatorioGeral() {
  const authToken = useAuthToken();
  const router = useRouter();
  const { periodo } = router.query;
  const relatorioRef = useRef();

  const [cativeiros, setCativeiros] = useState([]);
  const [dadosPorCativeiro, setDadosPorCativeiro] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
  const getToken = () =>
    typeof window !== 'undefined'
      ? sessionStorage.getItem('token') || localStorage.getItem('token')
      : null;

  const periodoInfo = PERIODO_MAP[periodo] || {};

  useEffect(() => {
    if (!router.isReady) return;

    if (!periodo || !PERIODO_MAP[periodo]) {
      setLoading(false);
      setError('Período inválido. Volte e selecione um período.');
      return;
    }

    const info = PERIODO_MAP[periodo];

    async function fetchAll() {
      setLoading(true);
      setError(null);
      try {
        const token = getToken();
        if (!token) { setError('Sessão expirada. Faça login novamente.'); setLoading(false); return; }
        const headers = { Authorization: `Bearer ${token}` };

        const res = await axios.get(`${apiUrl}/cativeiros`, { headers });
        const lista = Array.isArray(res.data) ? res.data : [];
        setCativeiros(lista);

        const results = await Promise.all(
          lista.map(c =>
            carregarHistorico(apiUrl, c._id, info.dias, headers)
              .then(dados => ({ id: c._id, dados }))
              .catch(() => ({ id: c._id, dados: [] }))
          )
        );

        const mapa = {};
        results.forEach(({ id, dados }) => { mapa[id] = dados; });
        setDadosPorCativeiro(mapa);
      } catch (err) {
        setError(err.response?.status === 401
          ? 'Sessão expirada. Faça login novamente.'
          : 'Erro ao carregar dados. Tente novamente.');
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, [router.isReady, periodo]);

  const handlePrint = () => window.print();

  const handleSavePDF = async () => {
    try {
      const html2pdf = await import('html2pdf.js');
      const pdf = html2pdf.default || html2pdf;
      pdf().set({
        margin: 1,
        filename: `relatorio-geral-${periodo}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }).from(relatorioRef.current).save();
    } catch {
      window.print();
    }
  };

  const geradoEm = new Date().toLocaleString('pt-BR');

  if (loading) {
    return (
      <MemberLayout title="Relatório Geral" subtitle={periodoInfo.label || '...'}>
        <div className={panelStyles.loadingScreen} style={{ minHeight: 'unset', padding: '60px 0' }}>
          Carregando dados do relatório...
        </div>
      </MemberLayout>
    );
  }

  if (error) {
    return (
      <MemberLayout title="Relatório Geral" subtitle="Erro">
        <div className={panelStyles.emptyState}>
          <div className={panelStyles.emptyStateIcon}>⚠️</div>
          <p className={panelStyles.emptyStateText}>{error}</p>
          <button
            className={`${panelStyles.btn} ${panelStyles.btnSecondary}`}
            style={{ marginTop: 16 }}
            onClick={() => router.back()}
          >
            ← Voltar
          </button>
        </div>
      </MemberLayout>
    );
  }

  return (
    <MemberLayout title="Relatório Geral" subtitle={periodoInfo.label}>
      <div className={panelStyles.section}>

        {/* Cabeçalho */}
        <div className={panelStyles.sectionHeader} style={{ marginBottom: 20 }}>
          <div>
            <h2 className={panelStyles.sectionTitle}>Relatório Geral</h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
              {periodoInfo.label} · {cativeiros.length} cativeiro{cativeiros.length !== 1 ? 's' : ''} · Gerado em {geradoEm}
            </p>
          </div>
          <div className={panelStyles.sectionActions}>
            <button
              className={`${panelStyles.btn} ${panelStyles.btnSecondary} ${panelStyles.btnSm}`}
              onClick={() => router.back()}
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
                <path d="M19 12H5M12 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Voltar
            </button>
            <button
              className={`${panelStyles.btn} ${panelStyles.btnSecondary} ${panelStyles.btnSm}`}
              onClick={handlePrint}
            >
              🖨️ Imprimir
            </button>
            <button
              className={`${panelStyles.btn} ${panelStyles.btnPrimary} ${panelStyles.btnSm}`}
              onClick={handleSavePDF}
            >
              ⬇️ PDF
            </button>
          </div>
        </div>

        <div ref={relatorioRef}>
          {cativeiros.length === 0 ? (
            <div className={panelStyles.emptyState}>
              <div className={panelStyles.emptyStateIcon}>📋</div>
              <p className={panelStyles.emptyStateText}>Nenhum cativeiro encontrado.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {cativeiros.map((cativeiro) => {
                const dados = dadosPorCativeiro[cativeiro._id] || [];
                const fotoUrl = fotoCativeiroUrl(apiUrl, cativeiro._id, authToken);
                return (
                  <div
                    key={cativeiro._id}
                    style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}
                  >
                    <div style={{ height: 4, background: 'linear-gradient(90deg, #f7b0b7 0%, #a3c7f7 100%)' }} />
                    <div style={{ padding: '16px 18px' }}>

                      {/* Topo do card */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                        <img
                          src={fotoUrl}
                          alt={cativeiro.nome}
                          onError={(e) => { e.target.src = '/images/cativeiro1.jpg'; }}
                          style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', flexShrink: 0, border: '1px solid #e2e8f0' }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>{cativeiro.nome}</div>
                          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                            {cativeiro.id_tipo_camarao?.nome || cativeiro.id_tipo_camarao || 'Tipo não informado'}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>
                            {dados.length} leitura{dados.length !== 1 ? 's' : ''} no período
                          </div>
                        </div>
                      </div>

                      {/* Estatísticas */}
                      {dados.length === 0 ? (
                        <div className={panelStyles.infoPanel} style={{ marginTop: 0 }}>
                          📭 Nenhuma leitura registrada no período.
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                          {PARAM_CFG.map(cfg => {
                            const stats = calcStats(dados, cfg.key);
                            return (
                              <div
                                key={cfg.key}
                                style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px' }}
                              >
                                <div style={{ fontSize: '0.7rem', color: cfg.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                                  {cfg.icon} {cfg.label}
                                </div>
                                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1e293b', marginBottom: 4 }}>
                                  {fmt(stats.avg, cfg.decimals, cfg.unit)}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                  Mín {fmt(stats.min, cfg.decimals, cfg.unit)} · Máx {fmt(stats.max, cfg.decimals, cfg.unit)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </MemberLayout>
  );
}
