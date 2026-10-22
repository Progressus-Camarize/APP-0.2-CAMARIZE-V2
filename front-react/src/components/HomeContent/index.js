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

  const fetchCativeiros = async () => {
    try {
      setLoading(true);
      setError(null);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
      const token = typeof window !== "undefined" ? (sessionStorage.getItem('token') || localStorage.getItem("token")) : null;
      if (!token) {
        setError('Você precisa estar logado para acessar esta página');
        setLoading(false);
        return;
      }
      const res = await axios.get(`${apiUrl}/cativeiros`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCativeiros(res.data);
    } catch (err) {
      console.error('Erro ao buscar cativeiros:', err);
      if (err.response?.status === 401) {
        setError('Sessão expirada. Faça login novamente para continuar.');
      } else {
        setError('Erro ao carregar os dados. Tente novamente.');
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
    showNotification('Cativeiro marcado para exclusão', 'warning', 'Desfazer', () => {
      const pending = pendingDeletion[id] || { timeoutId };
      clearTimeout(pending.timeoutId);
      setPendingDeletion((prev) => {
        const cp = { ...prev };
        delete cp[id];
        return cp;
      });
      showNotification('Exclusão desfeita.', 'success');
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
            Cativeiros
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
              title="Sobre o Camarize"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 16V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="12" cy="8" r="1" fill="currentColor"/>
              </svg>
              Sobre
            </button>
            {role !== 'membro' && (
              <button
                ref={addRef}
                className={`${panelStyles.btn} ${panelStyles.btnSecondary} ${panelStyles.btnSm}`}
                onClick={() => router.push('/create-cativeiros')}
                title="Cadastrar Cativeiro"
              >
                + Cativeiro
              </button>
            )}
          </div>
        </div>

        <div className={styles.cativeiroList}>
        {cativeiros.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyMessage}>Sem cativeiros cadastrados</div>
            {(() => {
              const comeceAqui = (
                <div className={panelStyles.infoPanel} style={{ maxWidth: 480 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Comece por aqui</div>
                  <div style={{ fontSize: 13, marginBottom: 12 }}>Crie seu primeiro cativeiro e conecte sensores para ver dados no dashboard.</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {role !== 'membro' && (
                      <button className={`${panelStyles.btn} ${panelStyles.btnPrimary} ${panelStyles.btnSm}`} onClick={() => router.push('/create-cativeiros')}>+ Cadastrar cativeiro</button>
                    )}
                    <button className={`${panelStyles.btn} ${panelStyles.btnSecondary} ${panelStyles.btnSm}`} onClick={() => router.push('/sensores')}>🔧 Gerenciar sensores</button>
                  </div>
                </div>
              );
              // Funcionário sem fazenda vê o pedido de vínculo no lugar das dicas
              return role === 'membro' ? <SolicitarVinculo fallback={comeceAqui} /> : comeceAqui;
            })()}
          </div>
        ) : (
          cativeiros.map((cativeiro, idx) => {
            const fotoUrl = fotoCativeiroUrl(process.env.NEXT_PUBLIC_API_URL || '/api', cativeiro._id, authToken);
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
                  alt={`Cativeiro ${idx + 1}`}
                  className={styles.cativeiroImg}
                  onError={(e) => { e.target.src = "/images/cativeiro1.jpg"; }}
                />
                <div className={styles.cativeiroInfo}>
                  <div className={styles.cativeiroNome}>{cativeiro.nome || `Cativeiro ${idx + 1}`}</div>
                  <div className={styles.cativeiroCultivo}>{
                    (typeof cativeiro.id_tipo_camarao === 'object' && cativeiro.id_tipo_camarao?.nome)
                      ? cativeiro.id_tipo_camarao.nome
                      : (cativeiro.id_tipo_camarao || 'Tipo não informado')
                  }</div>
                </div>
                
                <div className={styles.cativeiroActions}>
                  <button 
                    className={styles.actionBtn} 
                    onClick={(e) => handleEditCativeiro(e, cativeiro._id)}
                    title="Editar"
                  >
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                      <path d="M15.232 5.232a3 3 0 1 1 4.243 4.243L7.5 21H3v-4.5l12.232-12.268Z" stroke="#7ecbff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  {role !== 'membro' && (
                    <button 
                      className={styles.actionBtn} 
                      onClick={(e) => handleDeleteCativeiro(e, cativeiro._id)}
                      title="Excluir"
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
              { ref: infoRef, title: 'Sobre o Camarize', content: 'Saiba o que é o Camarize e por que monitoramos temperatura, pH e amônia.' },
              ...(cativeiros.length > 0 ? [{ ref: firstCativeiroRef, title: 'Cativeiro', content: 'Clique no cativeiro para abrir o dashboard com dados em tempo real.' }] : []),
              { ref: addRef, title: 'Adicionar cativeiro', content: 'Cadastre um novo cativeiro para começar a monitorar.' },
              { ref: sidebarRefs?.['/status-cativeiros'], title: 'Status', content: 'Veja o status geral de saúde de todos os seus cativeiros.' },
              { ref: sidebarRefs?.['/sensores'], title: 'Sensores', content: 'Gerencie os sensores IoT conectados aos seus cativeiros.' },
              { ref: sidebarRefs?.['/requests'], title: 'Solicitações', content: 'Envie e acompanhe solicitações ao administrador da fazenda.' },
              { ref: sidebarRefs?.['/notifications'], title: 'Notificações', content: 'Veja alertas e avisos gerados pelo sistema de monitoramento.' },
              { ref: sidebarRefs?.['/settings'], title: 'Configurações', content: 'Gerencie as informações da sua fazenda e preferências do sistema.' },
              { ref: sidebarRefs?.['/profile'], title: 'Perfil', content: 'Visualize e edite seus dados pessoais e foto de perfil.' },
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
        title="Confirmar Exclusão"
        showCloseButton={false}
      >
        <p style={{ margin: '0 0 16px', fontSize: '0.9rem', color: '#6b7280', lineHeight: 1.5 }}>
          Tem certeza que deseja excluir este cativeiro? Esta ação não pode ser desfeita.
        </p>
        
        {/* Botões */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            className={`${panelStyles.btn} ${panelStyles.btnSecondary}`}
            onClick={() => { setShowDeleteModal(false); setCativeiroToDelete(null); }}
          >
            Cancelar
          </button>
          <button
            className={`${panelStyles.btn} ${panelStyles.btnDanger}`}
            onClick={confirmDelete}
          >
            Excluir
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
          showProgress={notification.message?.toLowerCase().includes('marcado para exclusão')}
          progressDuration={3000}
          duration={notification.message?.toLowerCase().includes('marcado para exclusão') ? 3000 : 3000}
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
              showNotification('Cativeiro excluído com sucesso!', 'success');
            } catch (err) {
              console.error('Erro ao deletar cativeiro:', err);
              setPendingDeletion((prev) => {
                const cp = { ...prev };
                delete cp[idToDelete];
                return cp;
              });
              showNotification('Erro ao excluir cativeiro. Ação desfeita.', 'error');
            }
          }}
        />
      )}

      {/* Modal de Informações */}
      <Modal
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
        title="Sobre o Camarize"
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
            🦐 O que é o Camarize?
          </h3>
          <p style={{
            margin: 0,
            fontSize: '15px',
            lineHeight: '1.6',
            color: '#4b5563'
          }}>
            O Camarize é um sistema inteligente de monitoramento para cativeiros de camarão. 
            Ele ajuda você a acompanhar em tempo real as condições ideais para o cultivo, 
            garantindo a saúde e produtividade dos seus camarões.
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
            📊 Por que monitorar estes parâmetros?
          </h3>
          <p style={{
            margin: '0 0 16px 0',
            fontSize: '15px',
            lineHeight: '1.6',
            color: '#4b5563'
          }}>
            O monitoramento constante destes três parâmetros é essencial para o sucesso 
            do cultivo de camarões. Qualquer variação pode afetar diretamente a saúde 
            e o crescimento dos animais.
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
                Temperatura da Água
              </h4>
            </div>
            <p style={{
              margin: 0,
              fontSize: '14px',
              lineHeight: '1.5',
              color: '#92400e'
            }}>
              <strong>Por que é importante:</strong> A temperatura afeta diretamente o metabolismo, 
              crescimento e reprodução dos camarões. Temperaturas inadequadas podem causar 
              estresse, doenças e até mortalidade.
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
                pH da Água
              </h4>
            </div>
            <p style={{
              margin: 0,
              fontSize: '14px',
              lineHeight: '1.5',
              color: '#1e40af'
            }}>
              <strong>Por que é importante:</strong> O pH influencia a disponibilidade de 
              nutrientes, a toxicidade de substâncias e o bem-estar dos camarões. 
              Valores inadequados podem causar problemas respiratórios e de crescimento.
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
                Nível de Amônia
              </h4>
            </div>
            <p style={{
              margin: 0,
              fontSize: '14px',
              lineHeight: '1.5',
              color: '#be185d'
            }}>
              <strong>Por que é importante:</strong> A amônia é tóxica para os camarões 
              mesmo em baixas concentrações. Níveis elevados podem causar danos nas 
              brânquias, estresse e mortalidade.
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
            ✅ Benefícios do Monitoramento
          </h4>
          <ul style={{
            margin: 0,
            paddingLeft: '20px',
            fontSize: '14px',
            lineHeight: '1.6',
            color: '#166534'
          }}>
            <li>Prevenção de doenças e mortalidade</li>
            <li>Otimização do crescimento dos camarões</li>
            <li>Redução de perdas na produção</li>
            <li>Melhoria na qualidade da água</li>
            <li>Aumento da produtividade do cativeiro</li>
          </ul>
        </div>

        {/* Botão de fechar */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
          <button className={`${panelStyles.btn} ${panelStyles.btnPrimary}`} onClick={() => setShowInfoModal(false)}>
            Entendi!
          </button>
        </div>
      </Modal>
    </>
  );
}