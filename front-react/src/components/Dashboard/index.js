import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import axios from "axios";
import MemberLayout from "../MemberLayout";
import Modal from "../Modal";
import panelStyles from "@/styles/panel.module.css";
import { TbThermometer, TbWifiOff, TbFlask2 } from "react-icons/tb";

const AVISO_BANNER_ICONES = { temperatura: TbThermometer, sensor_inativo: TbWifiOff };
const AvisoBannerIcone = ({ tipo }) => {
  const Icone = AVISO_BANNER_ICONES[tipo] || TbFlask2;
  return <Icone aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 4 }} />;
};

const SENSOR_CFG = [
  { key: 'temperatura',  label: 'Temperatura',  unit: '°C',    decimals: 1, icon: '🌡️', stripe: '#f97316', bg: '#fff7ed', badgeColor: '#c2410c' },
  { key: 'ph',           label: 'pH',            unit: '',      decimals: 1, icon: '🧪', stripe: '#3b82f6', bg: '#eff6ff', badgeColor: '#1d4ed8' },
  { key: 'amonia',       label: 'Amônia (experimental)', unit: '', decimals: 2, icon: '⚗️', stripe: '#a855f7', bg: '#fdf4ff', badgeColor: '#7e22ce' },
];

// Default ranges for typical aquaculture values.
// If data exceeds a default, the range expands by adding one full default-interval
// as headroom — this keeps each parameter's expansion proportional to its own scale,
// so out-of-range dots from different parameters land at different Y positions.
const DEFAULT_RANGES = {
  temperatura: { min: 15, max: 35 },
  ph:          { min: 5,  max: 9  },
  amonia:      { min: 0,  max: 0.6 },
};

function computeRange(serie, campo) {
  const { min: defMin, max: defMax } = DEFAULT_RANGES[campo];
  const nums = serie.filter(v => v !== null);
  if (!nums.length) return { min: defMin, max: defMax };
  const dataMax = Math.max(...nums);
  const dataMin = Math.min(...nums);
  if (dataMax <= defMax && dataMin >= defMin) return { min: defMin, max: defMax };
  const defInterval = defMax - defMin;
  const min = Math.min(defMin, dataMin - defInterval * 0.1);
  const max = Math.max(defMax, dataMax) + defInterval;
  return { min, max };
}

const SVG_W = 600, SVG_H = 160, PAD_L = 10, PAD_R = 16, PAD_T = 14, PAD_BOT = 28;

export default function Dashboard() {
  const router = useRouter();
  const { id } = router.query;

  const [dadosAtuais, setDadosAtuais]     = useState(null);
  const [dadosSemanais, setDadosSemanais] = useState([]);
  const [nomeCativeiro, setNomeCativeiro] = useState('');
  const [frescor, setFrescor] = useState(null);
  const [avisosAtivos, setAvisosAtivos] = useState([]);
  const [analise, setAnalise] = useState(null);
  const [agora, setAgora] = useState(Date.now());
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [sseKey, setSseKey]               = useState(0);
  const [showRelatorio, setShowRelatorio] = useState(false);
  const [tooltip, setTooltip]             = useState(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
  // SSE conecta direto na API (sem passar pelo proxy do Next.js que buferiza streaming).
  const sseUrl = process.env.NEXT_PUBLIC_SSE_URL || 'http://localhost:4000';
  const getToken = () => typeof window !== 'undefined'
    ? (sessionStorage.getItem('token') || localStorage.getItem('token'))
    : null;

  useEffect(() => {
    const timer = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Busca pontual via REST — usada pelo botão Atualizar como fallback
  const buscar = async () => {
    if (!id) return;
    const token = getToken();
    if (!token) { setError('Token não encontrado. Faça login novamente.'); return; }
    try {
      const { data } = await axios.get(`${apiUrl}/parametros/dashboard/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDadosAtuais(data.dadosAtuais);
      setDadosSemanais(data.dadosSemanais || []);
      setNomeCativeiro(data.cativeiro?.nome || '');
      setFrescor(data.frescor);
      setAvisosAtivos(data.avisosAtivos || []);
      setAnalise(data.analise);
      setError(null);
    } catch (err) {
      setError(err.response?.status === 401
        ? 'Sessão expirada. Faça login novamente.'
        : 'Erro ao carregar dados do dashboard.');
    }
  };

  // Reestabelece a conexão SSE incrementando a chave do efeito
  const reconectar = () => {
    setError(null);
    setSseKey(k => k + 1);
  };

  // Conexão SSE — dados chegam automaticamente a cada nova leitura do sensor.
  // sseKey é incrementado por reconectar(), forçando o efeito a recriar a conexão.
  useEffect(() => {
    if (!id) return;
    const token = getToken();
    if (!token) { setError('Token não encontrado. Faça login novamente.'); setLoading(false); return; }

    setLoading(true);
    const es = new EventSource(`${sseUrl}/parametros/stream/${id}?token=${encodeURIComponent(token)}`);

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setDadosAtuais(data.dadosAtuais);
      setDadosSemanais(data.dadosSemanais || []);
      setNomeCativeiro(data.cativeiro?.nome || '');
      setFrescor(data.frescor);
      setAvisosAtivos(data.avisosAtivos || []);
      setAnalise(data.analise);
      setError(null);
      setLoading(false);
    };

    es.onerror = () => {
      setError('Conexão em tempo real perdida. Os dados exibidos podem estar desatualizados.');
      setLoading(false);
      es.close();
    };

    return () => es.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sseKey]);

  const fmt = (v, dec, unit) => {
    if (v === '#' || v === null || v === undefined) return '—';
    return typeof v === 'number' ? `${v.toFixed(dec)}${unit}` : String(v);
  };

  const valores = {
    temperatura: dadosAtuais?.temperatura ?? null,
    ph:          dadosAtuais?.ph          ?? null,
    amonia:      dadosAtuais?.amonia      ?? null,
  };
  const idadeLeitura = frescor?.ultimaLeitura ? Math.max(0, Math.floor((agora - new Date(frescor.ultimaLeitura).getTime()) / 60_000)) : null;
  const dadosRecentes = idadeLeitura !== null && idadeLeitura <= 15;

  // Preserve nulls — null = gap in chart (no fake padding)
  const extractSerie = (campo) =>
    dadosSemanais.map(d => {
      if (!d) return null;
      const v = d[campo];
      return (v === '#' || v == null) ? null : v;
    });

  const tempSerie   = extractSerie('temperatura');
  const phSerie     = extractSerie('ph');
  const amoniaSerie = extractSerie('amonia');

  const temDadosSemanais = [...tempSerie, ...phSerie, ...amoniaSerie].some(v => v !== null);

  // Ranges: default bounds expanded to fit data if needed
  const tempRange   = computeRange(tempSerie,   'temperatura');
  const phRange     = computeRange(phSerie,     'ph');
  const amoniaRange = computeRange(amoniaSerie, 'amonia');

  // Real date labels: "DD/MM" from API's "YYYY-MM-DD" field
  const labels = dadosSemanais.map(d => {
    if (!d?.data) return '—';
    const [, month, day] = d.data.split('-');
    return `${day}/${month}`;
  });

  // Chart helpers
  const chartW = SVG_W - PAD_L - PAD_R;
  const stepX  = chartW / 6; // always 7 points, 6 intervals
  const xOf    = (i) => PAD_L + i * stepX;

  const toY = (v, range) => {
    if (v === null) return null;
    const { min, max } = range;
    return PAD_T + (1 - (v - min) / (max - min)) * (SVG_H - PAD_T - PAD_BOT);
  };

  // Line path with gaps at null values
  const buildPath = (serie, range) => {
    let d = '';
    let pen = false;
    serie.forEach((v, i) => {
      if (v === null) { pen = false; return; }
      const x = xOf(i).toFixed(1);
      const y = toY(v, range).toFixed(1);
      d += pen ? ` L ${x} ${y}` : `M ${x} ${y}`;
      pen = true;
    });
    return d;
  };

  // Closed area paths for gradient fill — one closed shape per continuous segment
  const buildAreaPath = (serie, range) => {
    const baseline = SVG_H - PAD_BOT;
    const segments = [];
    let seg = [];
    serie.forEach((v, i) => {
      if (v === null) { if (seg.length) { segments.push(seg); seg = []; } return; }
      seg.push({ x: xOf(i), y: toY(v, range) });
    });
    if (seg.length) segments.push(seg);
    return segments.map(pts => {
      let d = `M ${pts[0].x.toFixed(1)} ${baseline.toFixed(1)}`;
      pts.forEach(p => { d += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`; });
      d += ` L ${pts[pts.length - 1].x.toFixed(1)} ${baseline.toFixed(1)} Z`;
      return d;
    }).join(' ');
  };

  const showTooltip = (e, i, campo) => {
    setTooltip({
      x: e.clientX,
      y: e.clientY,
      label: labels[i] || '—',
      campo,
      temp:   tempSerie[i],
      ph:     phSerie[i],
      amonia: amoniaSerie[i],
    });
  };

  const moveTooltip = (e) =>
    setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null);

  const temDados = dadosAtuais !== null || dadosSemanais.length > 0;

  // Tela de loading: apenas na carga inicial sem dados
  if (loading && !temDados) {
    return (
      <MemberLayout title={nomeCativeiro || 'Dashboard'} subtitle="Dados em tempo real">
        <div className={panelStyles.loadingScreen} style={{ minHeight: 'unset', padding: '60px 0' }}>
          Carregando dados do cativeiro...
        </div>
      </MemberLayout>
    );
  }

  // Tela de erro completa: apenas quando falhou e não há nenhum dado para mostrar
  if (error && !temDados) {
    return (
      <MemberLayout title="Dashboard" subtitle="Dados em tempo real">
        <div className={panelStyles.emptyState}>
          <div className={panelStyles.emptyStateIcon}>⚠️</div>
          <p className={panelStyles.emptyStateText}>{error}</p>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 20 }}>
            <button
              className={`${panelStyles.btn} ${panelStyles.btnPrimary}`}
              style={{ minWidth: 160 }}
              onClick={reconectar}
            >
              Reconectar
            </button>
            <button
              onClick={() => router.push('/home')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', color: '#94a3b8', padding: '2px 8px' }}
            >
              ← Voltar para cativeiros
            </button>
          </div>
        </div>
      </MemberLayout>
    );
  }

  return (
    <MemberLayout title={nomeCativeiro || 'Dashboard'} subtitle="Parâmetros monitorados em tempo real">
      <div className={panelStyles.section}>
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#1e3a8a', fontSize: '0.82rem' }}>
          Última leitura: {idadeLeitura !== null ? `${idadeLeitura} min atrás` : 'sem dados'} · {dadosRecentes ? 'dados recentes' : 'dados antigos'}
          {frescor?.origem === 'legado' && ' · origem não autenticada'}
          <div style={{ marginTop: 4 }}>Análise: {dadosRecentes && analise?.suficiente ? 'leituras suficientes' : ({ lacuna: 'insuficiente: lacuna entre leituras', leitura_antiga: 'insuficiente: última leitura autenticada antiga', leituras_insuficientes: 'insuficiente: menos de seis leituras autenticadas' }[analise?.razao] || 'insuficiente para o momento')}</div>
          <div style={{ marginTop: 4 }}>pH e amônia: sensor sem calibração; medições experimentais. A fração de NH₃ livre depende de pH e temperatura e não é estimada aqui.</div>
        </div>
        {avisosAtivos.map(aviso => (
          <div key={aviso._id} style={{ background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 10, padding: '12px 16px', marginBottom: 10, color: '#78350f' }}>
            <strong><AvisoBannerIcone tipo={aviso.tipo} /> Aviso ativo</strong> · {aviso.mensagem}
            <div style={{ fontSize: '0.74rem', marginTop: 4 }}>Período analisado: {new Date(aviso.periodoInicio).toLocaleString('pt-BR')} a {new Date(aviso.periodoFim).toLocaleString('pt-BR')}{aviso.experimental ? ' · sensor sem calibração' : ''}</div>
          </div>
        ))}

        {/* Banner de erro inline — aparece quando SSE cai mas já há dados visíveis */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            background: '#fef9ec', border: '1px solid #fbbf24', borderRadius: 10,
            padding: '10px 14px', marginBottom: 16,
          }}>
            <span style={{ fontSize: '1rem', flexShrink: 0 }}>⚠️</span>
            <span style={{ flex: 1, fontSize: '0.8rem', color: '#92400e', fontWeight: 500, minWidth: 0 }}>
              {error}
            </span>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                className={`${panelStyles.btn} ${panelStyles.btnPrimary} ${panelStyles.btnSm}`}
                onClick={reconectar}
              >
                Reconectar
              </button>
              <button
                className={`${panelStyles.btn} ${panelStyles.btnSecondary} ${panelStyles.btnSm}`}
                onClick={buscar}
              >
                Atualizar dados
              </button>
            </div>
          </div>
        )}

        {/* Cabeçalho da seção */}
        <div className={panelStyles.sectionHeader} style={{ marginBottom: 20 }}>
          <div>
            <h2 className={panelStyles.sectionTitle}>Leituras Atuais</h2>
            {!dadosAtuais && (
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                Sem leituras recentes dos sensores
              </p>
            )}
          </div>
          <div className={panelStyles.sectionActions}>
            <button
              className={`${panelStyles.btn} ${panelStyles.btnSecondary} ${panelStyles.btnSm}`}
              onClick={() => router.push('/home')}
              title="Voltar para cativeiros"
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
                <path d="M19 12H5M12 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Voltar
            </button>
            <button
              className={`${panelStyles.btn} ${panelStyles.btnSecondary} ${panelStyles.btnSm}`}
              onClick={buscar}
              title="Atualizar dados"
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
                <path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Atualizar
            </button>
            <button
              className={`${panelStyles.btn} ${panelStyles.btnPrimary} ${panelStyles.btnSm}`}
              onClick={() => setShowRelatorio(true)}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                <path d="M12 4v12m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <rect x="4" y="18" width="16" height="2" rx="1" fill="currentColor"/>
              </svg>
              Relatório
            </button>
          </div>
        </div>

        {/* Cards dos sensores */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12, marginBottom: 24 }}>
          {SENSOR_CFG.map(cfg => {
            const raw = valores[cfg.key];
            const valorFmt = fmt(raw, cfg.decimals, cfg.unit);
            const semDados = valorFmt === '—';
            return (
              <div
                key={cfg.key}
                style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', transition: 'box-shadow 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.08)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'}
              >
                <div style={{ height: 4, background: cfg.stripe }} />
                <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                    {cfg.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {cfg.label}
                    </div>
                    <div style={{ fontSize: semDados ? '0.9rem' : '1.55rem', fontWeight: 700, color: semDados ? '#94a3b8' : cfg.badgeColor, lineHeight: 1.2, marginTop: 2 }}>
                      {valorFmt}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Gráfico de tendência semanal */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b' }}>Tendência Semanal</div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>
                Médias diárias dos últimos 7 dias
              </div>
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: '0.72rem', fontWeight: 600 }}>
              <span style={{ color: '#f97316' }}>▬ Temp.</span>
              <span style={{ color: '#3b82f6' }}>▬ pH</span>
              <span style={{ color: '#a855f7' }}>▬ Amônia (experimental)</span>
            </div>
          </div>

          {temDadosSemanais ? (
            <svg width="100%" viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ overflow: 'visible', display: 'block' }}>
              <defs>
                <linearGradient id="gradTemp" x1="0" y1={PAD_T} x2="0" y2={SVG_H - PAD_BOT} gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#f97316" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="gradPh" x1="0" y1={PAD_T} x2="0" y2={SVG_H - PAD_BOT} gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="gradAmonia" x1="0" y1={PAD_T} x2="0" y2={SVG_H - PAD_BOT} gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Linhas guia horizontais */}
              {[0.25, 0.5, 0.75, 1].map(f => {
                const y = f === 1 ? SVG_H - PAD_BOT : PAD_T + f * (SVG_H - PAD_T - PAD_BOT);
                return (
                  <line key={f} x1={PAD_L} y1={y} x2={SVG_W - PAD_R} y2={y}
                    stroke={f === 1 ? '#cbd5e1' : '#f1f5f9'} strokeWidth={f === 1 ? 1.5 : 1} />
                );
              })}

              {/* Áreas preenchidas (atrás das linhas) */}
              <path d={buildAreaPath(tempSerie, tempRange)} fill="url(#gradTemp)" />
              <path d={buildAreaPath(phSerie, phRange)} fill="url(#gradPh)" />
              <path d={buildAreaPath(amoniaSerie, amoniaRange)} fill="url(#gradAmonia)" />

              {/* Linhas */}
              <path d={buildPath(tempSerie, tempRange)} fill="none" stroke="#f97316" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              <path d={buildPath(phSerie, phRange)} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              <path d={buildPath(amoniaSerie, amoniaRange)} fill="none" stroke="#a855f7" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

              {/* Pontos interativos */}
              {tempSerie.map((v, i) => v !== null && (
                <circle key={i} cx={xOf(i)} cy={toY(v, tempRange)} r="3.5" fill="#fff" stroke="#f97316" strokeWidth="2"
                  style={{ cursor: 'crosshair' }}
                  onMouseEnter={(e) => showTooltip(e, i, 'temperatura')}
                  onMouseMove={moveTooltip}
                  onMouseLeave={() => setTooltip(null)}
                />
              ))}
              {phSerie.map((v, i) => v !== null && (
                <circle key={i} cx={xOf(i)} cy={toY(v, phRange)} r="3.5" fill="#fff" stroke="#3b82f6" strokeWidth="2"
                  style={{ cursor: 'crosshair' }}
                  onMouseEnter={(e) => showTooltip(e, i, 'ph')}
                  onMouseMove={moveTooltip}
                  onMouseLeave={() => setTooltip(null)}
                />
              ))}
              {amoniaSerie.map((v, i) => v !== null && (
                <circle key={i} cx={xOf(i)} cy={toY(v, amoniaRange)} r="3.5" fill="#fff" stroke="#a855f7" strokeWidth="2"
                  style={{ cursor: 'crosshair' }}
                  onMouseEnter={(e) => showTooltip(e, i, 'amonia')}
                  onMouseMove={moveTooltip}
                  onMouseLeave={() => setTooltip(null)}
                />
              ))}

              {/* Labels do eixo X — datas reais DD/MM */}
              {labels.map((label, i) => (
                <text key={i} x={xOf(i)} y={SVG_H - 8} fontSize="8" textAnchor="middle" fill="#94a3b8" fontFamily="Poppins, sans-serif">
                  {label}
                </text>
              ))}
            </svg>
          ) : (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8' }}>
              <div style={{ fontSize: '1.8rem', marginBottom: 8 }}>📊</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>Nenhuma leitura registrada nos últimos 7 dias</div>
              <div style={{ fontSize: '0.75rem', marginTop: 4 }}>Os dados aparecem assim que o sensor enviar leituras</div>
            </div>
          )}
        </div>

      </div>

      {/* Tooltip flutuante */}
      {tooltip && (() => {
        const TOOLTIP_W = 170;
        const left = tooltip.x + TOOLTIP_W + 14 > (typeof window !== 'undefined' ? window.innerWidth : 9999)
          ? tooltip.x - TOOLTIP_W - 6
          : tooltip.x + 14;
        const params = [
          { key: 'temperatura', icon: '🌡️', label: 'Temp.',  value: tooltip.temp,   dec: 1, unit: ' °C',   color: '#fb923c' },
          { key: 'ph',          icon: '🧪', label: 'pH',     value: tooltip.ph,     dec: 2, unit: '',       color: '#60a5fa' },
          { key: 'amonia',      icon: '⚗️', label: 'Amônia experimental', value: tooltip.amonia, dec: 3, unit: '', color: '#c084fc' },
        ];
        return (
          <div style={{
            position: 'fixed', left, top: tooltip.y - 90,
            background: '#1e293b', color: '#fff', borderRadius: 10,
            padding: '10px 14px', pointerEvents: 'none', zIndex: 9999,
            whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
            minWidth: TOOLTIP_W,
          }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', marginBottom: 8, letterSpacing: '0.04em' }}>
              {tooltip.label}
            </div>
            {params.map(p => {
              const active = p.key === tooltip.campo;
              const display = p.value !== null
                ? `${p.value.toFixed(p.dec)}${p.unit}`
                : 'sem dados';
              return (
                <div key={p.key} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: active ? '5px 8px' : '2px 8px',
                  borderRadius: 6,
                  background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                  marginBottom: 2,
                  opacity: active ? 1 : 0.4,
                  transition: 'opacity 0.1s',
                }}>
                  <span style={{ fontSize: active ? '0.95rem' : '0.8rem' }}>{p.icon}</span>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', minWidth: 32 }}>{p.label}</span>
                  <span style={{
                    fontWeight: active ? 700 : 400,
                    fontSize: active ? '0.92rem' : '0.78rem',
                    color: active ? p.color : '#cbd5e1',
                  }}>{display}</span>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Modal de Relatório */}
      <Modal isOpen={showRelatorio} onClose={() => setShowRelatorio(false)} title="Relatório Individual" showCloseButton>
        <p style={{ margin: '0 0 16px', fontSize: '0.9rem', color: '#6b7280', lineHeight: 1.5 }}>
          Selecione o período para o relatório de <strong>{nomeCativeiro}</strong>
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { key: 'dia',    label: '📅 Relatório Diário',   sub: 'Últimas 24h' },
            { key: 'semana', label: '📊 Relatório Semanal',  sub: 'Últimos 7 dias' },
            { key: 'mes',    label: '📈 Relatório Mensal',   sub: 'Últimos 30 dias' },
          ].map(({ key, label, sub }) => (
            <button
              key={key}
              onClick={() => { setShowRelatorio(false); router.push(`/rel-individual/${id}?periodo=${key}`); }}
              className={`${panelStyles.btn} ${panelStyles.btnPrimary}`}
              style={{ width: '100%', justifyContent: 'space-between', padding: '14px 18px', fontSize: '0.9rem' }}
            >
              <span>{label}</span>
              <span style={{ opacity: 0.75, fontSize: '0.8rem' }}>{sub}</span>
            </button>
          ))}
        </div>
      </Modal>
    </MemberLayout>
  );
}
