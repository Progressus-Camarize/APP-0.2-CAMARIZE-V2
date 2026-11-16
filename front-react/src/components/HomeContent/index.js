import { useRouter } from "next/router";
import styles from "./HomeContent.module.css";
import panelStyles from "@/styles/panel.module.css";
import AuthError from "../AuthError";
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import Notification from "../Notification";
import Modal from '../Modal';
import GuidedTour from "../GuidedTour";
import SolicitarVinculo from "../SolicitarVinculo";
import { useAuthToken, fotoCativeiroUrl } from "@/lib/fotoCativeiro";

const gramasBr = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 });

// Quanto da ração prevista para hoje a placa já informou como servida
function RacaoDoDia({ resumo }) {
  if (!resumo?.dieta || !resumo.gramasPrevistas) return null;
  const pct = Math.min(100, Math.round((resumo.gramasServidas / resumo.gramasPrevistas) * 100));
  return (
    <div className={styles.racao} title={`${resumo.refeicoesServidas} of ${resumo.refeicoesPrevistas} meals served today`}>
      <span className={styles.racaoTexto}>
        Feed today <strong>{gramasBr(resumo.gramasServidas)} of {gramasBr(resumo.gramasPrevistas)} g</strong>
      </span>
      <span className={styles.racaoBarra} aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
    </div>
  );
}

export default function HomeContent({ sidebarRefs, hideTour = false }) {
  const authToken = useAuthToken();
  const router = useRouter();
  const [role, setRole] = useState('membro');
  const [cativeiros, setCativeiros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [cativeiroToDelete, setCativeiroToDelete] = useState(null);
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success', actionLabel: null, onAction: null });
  const [showTour, setShowTour] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState({}); // id -> { timeoutId }

  // Refs para o tour
  const infoRef = useRef(null);
  const addRef = useRef(null);
  const firstCativeiroRef = useRef(null);

  const showNotification = (message, type = 'success', actionLabel = null, onAction = null) => {
    setNotification({ show: true, message, type, actionLabel, onAction });
  };

  const hideNotification = () => {
    setNotification({ show: false, message: '', type: 'success' });
  };

  const [racaoHoje, setRacaoHoje] = useState({}); // cativeiroId -> resumo de /alimentacoes/hoje

  const fetchCativeiros = async () => {
    try {
      setLoading(true);
      setError(null);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
      const token = typeof window !== "undefined" ? (sessionStorage.getItem('token') || localStorage.getItem("token")) : null;
      if (!token) {
        setError('You need to be signed in to access this page');
        setLoading(false);
        return;
      }
      const res = await axios.get(`${apiUrl}/cativeiros`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCativeiros(res.data);
      // Ração de hoje de cada cativeiro: não bloqueia a lista se falhar
      axios.get(`${apiUrl}/alimentacoes/hoje`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => setRacaoHoje(r.data?.cativeiros || {}))
        .catch(() => setRacaoHoje({}));
    } catch (err) {
      console.error('Erro ao buscar cativeiros:', err);
      if (err.response?.status === 401) {
        setError('Session expired. Please sign in again to continue.');
      } else {
        setError('Error loading data. Please try again.');
      }
      setCativeiros([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCativeiros();
  }, []);

  // Carregar role do usuário (para gating de botões)
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('usuarioCamarize') : null;
      const user = raw ? JSON.parse(raw) : null;
      if (user?.role) setRole(user.role);
    } catch {}
  }, []);

  const handleCativeiroClick = (id) => {
    router.push(`/dashboard?id=${id}`);
  };

  const handleEditCativeiro = (e, id) => {
    e.stopPropagation();
    router.push(`/edit-cativeiro?id=${id}`);
  };

  const handleDeleteCativeiro = async (e, id) => {
    e.stopPropagation();
    setCativeiroToDelete(id);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!cativeiroToDelete) return;

    // Exclusão com atraso + janela de desfazer (sem remover visualmente até confirmar)
    const id = cativeiroToDelete;
    if (!cativeiros.some((c) => c._id === id)) {
      setShowDeleteModal(false);
      setCativeiroToDelete(null);
      return;
    }
    setShowDeleteModal(false);
    setCativeiroToDelete(null);

    // Armazena intenção e delega o disparo ao timeout do toast
    const timeoutId = setTimeout(() => {}, 3000); // placeholder apenas para registro

    setPendingDeletion((prev) => ({
      ...prev,
      [id]: { timeoutId }
    }));

    // Notificação com desfazer real (sem tocar no backend se desfizer)
    showNotification('Pond marked for deletion', 'warning', 'Undo', () => {
      const pending = pendingDeletion[id] || { timeoutId };
      clearTimeout(pending.timeoutId);
      setPendingDeletion((prev) => {
        const cp = { ...prev };
        delete cp[id];
        return cp;
      });
      showNotification('Deletion undone.', 'success');
    });
  };

  // Mostrar tour apenas na primeira vez (comportamento original)
  useEffect(() => {
    try {
      if (loading) return;
      const getCurrentUserId = () => {
        try {
          const raw = localStorage.getItem('usuarioCamarize');
          if (!raw) return null;
          const user = JSON.parse(raw);
          return user?._id || user?.id || user?.userId || null;
        } catch {
          return null;
        }
      };
      const userId = getCurrentUserId();
      const tourKey = userId ? `camarize_home_tour_done_${userId}` : 'camarize_home_tour_done';
      const done = localStorage.getItem(tourKey);
      if (!done) {
        const t = setTimeout(() => setShowTour(true), 250);
        return () => clearTimeout(t);
      }
    } catch {}
  }, [loading]);

  // Se há erro, mostrar tela de erro
  if (error) {
    return <AuthError error={error} onRetry={() => window.location.reload()} />;
  }

  // Se está carregando, mostrar skeletons
  if (loading) {
    return (
      <div className={styles.skeletonList}>
        {[1,2,3,4].map((i) => (
          <div className={styles.skeletonItem} key={i}>
            <div className={styles.skeletonThumb} />
            <div>
              <div className={`${styles.skeletonText} ${styles.long}`} />
              <div className={`${styles.skeletonText} ${styles.short}`} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <section className={panelStyles.section}>
        <div className={panelStyles.sectionHeader}>
          <h2 className={panelStyles.sectionTitle}>
            Ponds
            {cativeiros.length > 0 && (
              <span className={panelStyles.filterCount} style={{ marginLeft: 10, fontSize: '0.78rem' }}>
                {cativeiros.length}
              </span>
            )}
          </h2>
          <div className={panelStyles.sectionActions}>
            <button
              ref={infoRef}
              className={`${panelStyles.btn} ${panelStyles.btnSecondary} ${panelStyles.btnSm}`}
              onClick={() => setShowInfoModal(true)}
              title="About Camarize"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 16V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="12" cy="8" r="1" fill="currentColor"/>
              </svg>
              About
            </button>
            {role !== 'membro' && (
              <button
                ref={addRef}
                className={`${panelStyles.btn} ${panelStyles.btnSecondary} ${panelStyles.btnSm}`}
                onClick={() => router.push('/create-cativeiros')}
                title="Add Pond"
              >
                + Pond
              </button>
            )}
          </div>
        </div>

        <div className={styles.cativeiroList}>
        {cativeiros.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyMessage}>No ponds registered</div>
            {(() => {
              const comeceAqui = (
                <div className={panelStyles.infoPanel} style={{ maxWidth: 480 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Start here</div>
                  <div style={{ fontSize: 13, marginBottom: 12 }}>Create your first pond and connect sensors to see data on the dashboard.</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {role !== 'membro' && (
                      <button className={`${panelStyles.btn} ${panelStyles.btnPrimary} ${panelStyles.btnSm}`} onClick={() => router.push('/create-cativeiros')}>+ Add pond</button>
                    )}
                    <button className={`${panelStyles.btn} ${panelStyles.btnSecondary} ${panelStyles.btnSm}`} onClick={() => router.push('/sensores')}>🔧 Manage sensors</button>
                  </div>
                </div>
              );
              // Funcionário sem fazenda vê o pedido de vínculo no lugar das dicas
              return role === 'membro' ? <SolicitarVinculo fallback={comeceAqui} /> : comeceAqui;
            })()}
          </div>
        ) : (
          cativeiros.map((cativeiro, idx) => {
            const fotoUrl = fotoCativeiroUrl(process.env.NEXT_PUBLIC_API_URL || '/api', cativeiro._id, authToken, cativeiro.foto_versao);
            return (
              <div
                key={cativeiro._id}
                className={styles.cativeiroItem}
                style={{ cursor: "pointer" }}
                onClick={() => handleCativeiroClick(cativeiro._id)}
                ref={idx === 0 ? firstCativeiroRef : null}
              >
                <img
                  src={fotoUrl}
                  alt={`Pond ${idx + 1}`}
                  className={styles.cativeiroImg}
                  onError={(e) => { e.target.src = "/images/cativeiro1.jpg"; }}
                />
                <div className={styles.cativeiroInfo}>
                  <div className={styles.cativeiroNome}>{cativeiro.nome || `Pond ${idx + 1}`}</div>
                  <div className={styles.cativeiroCultivo}>{
                    (typeof cativeiro.id_tipo_camarao === 'object' && cativeiro.id_tipo_camarao?.nome)
                      ? cativeiro.id_tipo_camarao.nome
                      : (cativeiro.id_tipo_camarao || 'Type not specified')
                  }</div>
                  <RacaoDoDia resumo={racaoHoje[cativeiro._id]} />
                </div>
                
                <div className={styles.cativeiroActions}>
                  <button 
                    className={styles.actionBtn} 
                    onClick={(e) => handleEditCativeiro(e, cativeiro._id)}
                    title="Edit"
                  >
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                      <path d="M15.232 5.232a3 3 0 1 1 4.243 4.243L7.5 21H3v-4.5l12.232-12.268Z" stroke="#7ecbff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  {role !== 'membro' && (
                    <button 
                      className={styles.actionBtn} 
                      onClick={(e) => handleDeleteCativeiro(e, cativeiro._id)}
                      title="Delete"
                    >
                      <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                        <path d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14Z" stroke="#ff6b6b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
        </div>
      </section>

      {/* Tour guiado - somente na primeira visita */}
      {showTour && !hideTour && (
        <GuidedTour
          steps={
            [
              { ref: infoRef, title: 'About Camarize', content: 'Learn what Camarize is and why we monitor temperature, pH and ammonia.' },
              ...(cativeiros.length > 0 ? [{ ref: firstCativeiroRef, title: 'Pond', content: 'Click a pond to open its dashboard with real-time data.' }] : []),
              { ref: addRef, title: 'Add pond', content: 'Register a new pond to start monitoring.' },
              { ref: sidebarRefs?.['/status-cativeiros'], title: 'Status', content: 'See the overall health status of all your ponds.' },
              { ref: sidebarRefs?.['/sensores'], title: 'Sensors', content: 'Manage the IoT sensors connected to your ponds.' },
              { ref: sidebarRefs?.['/requests'], title: 'Requests', content: 'Send and track requests to the farm administrator.' },
              { ref: sidebarRefs?.['/notifications'], title: 'Notifications', content: 'See alerts and warnings generated by the monitoring system.' },
              { ref: sidebarRefs?.['/settings'], title: 'Settings', content: 'Manage your farm information and system preferences.' },
              { ref: sidebarRefs?.['/profile'], title: 'Profile', content: 'View and edit your personal details and profile picture.' },
            ].filter(s => s.ref && s.ref.current)
          }
          onFinish={() => {
            try {
              const raw = localStorage.getItem('usuarioCamarize');
              let tourKey = 'camarize_home_tour_done';
              if (raw) {
                try {
                  const user = JSON.parse(raw);
                  const userId = user?._id || user?.id || user?.userId;
                  if (userId) tourKey = `camarize_home_tour_done_${userId}`;
                } catch {}
              }
              localStorage.setItem(tourKey, '1');
              try { sessionStorage.removeItem('camarize_home_tour_forced'); } catch {}
            } catch {}
            setShowTour(false);
            try {
              if (router?.query?.tour) {
                const { tour, ...rest } = router.query || {};
                router.replace({ pathname: router.pathname, query: { ...rest } }, undefined, { shallow: true });
              }
            } catch {}
          }}
        />
      )}
      
      {/* Modal de Exclusão */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setCativeiroToDelete(null); }}
        title="Confirm Deletion"
        showCloseButton={false}
      >
        <p style={{ margin: '0 0 16px', fontSize: '0.9rem', color: '#6b7280', lineHeight: 1.5 }}>
          Are you sure you want to delete this pond? This action cannot be undone.
        </p>
        
        {/* Botões */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            className={`${panelStyles.btn} ${panelStyles.btnSecondary}`}
            onClick={() => { setShowDeleteModal(false); setCativeiroToDelete(null); }}
          >
            Cancel
          </button>
          <button
            className={`${panelStyles.btn} ${panelStyles.btnDanger}`}
            onClick={confirmDelete}
          >
            Delete
          </button>
        </div>
      </Modal>
      {notification.show && (
        <Notification
          isVisible={notification.show}
          message={notification.message}
          type={notification.type}
          onClose={hideNotification}
          actionLabel={notification.actionLabel}
          onAction={notification.onAction}
          showProgress={notification.message?.toLowerCase().includes('marked for deletion')}
          progressDuration={3000}
          duration={notification.message?.toLowerCase().includes('marked for deletion') ? 3000 : 3000}
          onTimeout={async () => {
            // Executa a exclusão quando o toast some (sincronizado com a barra)
            const ids = Object.keys(pendingDeletion);
            if (ids.length === 0) return;
            const idToDelete = ids[0];
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
            const token = typeof window !== "undefined" ? (sessionStorage.getItem('token') || localStorage.getItem("token")) : null;
            try {
              await axios.delete(`${apiUrl}/cativeiros/${idToDelete}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
              });
              setPendingDeletion((prev) => {
                const cp = { ...prev };
                delete cp[idToDelete];
                return cp;
              });
              await fetchCativeiros();
              showNotification('Pond deleted successfully!', 'success');
            } catch (err) {
              console.error('Erro ao deletar cativeiro:', err);
              setPendingDeletion((prev) => {
                const cp = { ...prev };
                delete cp[idToDelete];
                return cp;
              });
              showNotification('Error deleting pond. Action undone.', 'error');
            }
          }}
        />
      )}

      {/* Modal de Informações */}
      <Modal
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
        title="About Camarize"
        showCloseButton
      >
        {/* O que é o Camarize */}
        <div>
          <h3 style={{
            margin: '0 0 12px 0',
            fontSize: '18px',
            fontWeight: '600',
            color: '#1f2937'
          }}>
            🦐 What is Camarize?
          </h3>
          <p style={{
            margin: 0,
            fontSize: '15px',
            lineHeight: '1.6',
            color: '#4b5563'
          }}>
            Camarize is a smart monitoring system for shrimp ponds. 
            It helps you track ideal farming conditions in real time, 
            ensuring the health and productivity of your shrimp.
          </p>
        </div>

        {/* Por que monitorar */}
        <div>
          <h3 style={{
            margin: '0 0 12px 0',
            fontSize: '18px',
            fontWeight: '600',
            color: '#1f2937'
          }}>
            📊 Why monitor these parameters?
          </h3>
          <p style={{
            margin: '0 0 16px 0',
            fontSize: '15px',
            lineHeight: '1.6',
            color: '#4b5563'
          }}>
            Constant monitoring of these three parameters is essential for successful 
            shrimp farming. Any variation can directly affect the health 
            and growth of the animals.
          </p>
        </div>

        {/* Parâmetros */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Temperatura */}
          <div style={{
            padding: '16px',
            borderRadius: '12px',
            background: '#fef3c7',
            border: '1px solid #fde68a'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '8px'
            }}>
              <span style={{ fontSize: '20px' }}>🌡️</span>
              <h4 style={{
                margin: 0,
                fontSize: '16px',
                fontWeight: '600',
                color: '#92400e'
              }}>
                Water Temperature
              </h4>
            </div>
            <p style={{
              margin: 0,
              fontSize: '14px',
              lineHeight: '1.5',
              color: '#92400e'
            }}>
              <strong>Why it matters:</strong> Temperature directly affects shrimp metabolism, 
              growth and reproduction. Unsuitable temperatures can cause 
              stress, disease and even mortality.
            </p>
          </div>

          {/* pH */}
          <div style={{
            padding: '16px',
            borderRadius: '12px',
            background: '#dbeafe',
            border: '1px solid #93c5fd'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '8px'
            }}>
              <span style={{ fontSize: '20px' }}>🧪</span>
              <h4 style={{
                margin: 0,
                fontSize: '16px',
                fontWeight: '600',
                color: '#1e40af'
              }}>
                Water pH
              </h4>
            </div>
            <p style={{
              margin: 0,
              fontSize: '14px',
              lineHeight: '1.5',
              color: '#1e40af'
            }}>
              <strong>Why it matters:</strong> pH influences nutrient availability, 
              the toxicity of substances and the well-being of the shrimp. 
              Unsuitable values can cause respiratory and growth problems.
            </p>
          </div>

          {/* Amônia */}
          <div style={{
            padding: '16px',
            borderRadius: '12px',
            background: '#fce7f3',
            border: '1px solid #f9a8d4'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '8px'
            }}>
              <span style={{ fontSize: '20px' }}>⚗️</span>
              <h4 style={{
                margin: 0,
                fontSize: '16px',
                fontWeight: '600',
                color: '#be185d'
              }}>
                Ammonia Level
              </h4>
            </div>
            <p style={{
              margin: 0,
              fontSize: '14px',
              lineHeight: '1.5',
              color: '#be185d'
            }}>
              <strong>Why it matters:</strong> Ammonia is toxic to shrimp 
              even at low concentrations. High levels can cause gill 
              damage, stress and mortality.
            </p>
          </div>
        </div>

        {/* Benefícios */}
        <div style={{
          padding: '16px',
          borderRadius: '12px',
          background: '#f0fdf4',
          border: '1px solid #86efac'
        }}>
          <h4 style={{
            margin: '0 0 12px 0',
            fontSize: '16px',
            fontWeight: '600',
            color: '#166534'
          }}>
            ✅ Benefits of Monitoring
          </h4>
          <ul style={{
            margin: 0,
            paddingLeft: '20px',
            fontSize: '14px',
            lineHeight: '1.6',
            color: '#166534'
          }}>
            <li>Prevention of disease and mortality</li>
            <li>Optimized shrimp growth</li>
            <li>Reduced production losses</li>
            <li>Improved water quality</li>
            <li>Increased pond productivity</li>
          </ul>
        </div>

        {/* Botão de fechar */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
          <button className={`${panelStyles.btn} ${panelStyles.btnPrimary}`} onClick={() => setShowInfoModal(false)}>
            Got it!
          </button>
        </div>
      </Modal>
    </>
  );
}