import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { HiOutlineChip } from 'react-icons/hi';
import styles from '@/styles/panel.module.css';
import Modal from '../Modal';
import Sidebar from '../Sidebar';
import { ADMIN_MENU, MASTER_MENU, ABA_DAS_PAGINAS_DE_CATIVEIRO } from '../Sidebar/menus';
import { useUnreadAvisos } from '@/hooks/useUnreadAvisos';
import { useSolicitacoesPendentes } from '@/hooks/useSolicitacoesPendentes';

const NAV_ITEMS = [
  {
    label: 'Início',
    href: '/home',
    icon: (
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M9 21V12h6v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    label: 'Status',
    href: '/status-cativeiros',
    icon: (
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
        <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
      </svg>
    ),
  },
  {
    label: 'Sensores',
    href: '/sensores',
    icon: <HiOutlineChip size={18} />,
  },
  {
    label: 'Solicitações',
    href: '/requests',
    icon: (
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="2"/>
        <path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: 'Notificações',
    href: '/notifications',
    icon: (
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: 'Configurações',
    href: '/settings',
    icon: (
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="2"/>
      </svg>
    ),
  },
  {
    label: 'Perfil',
    href: '/profile',
    icon: (
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
      </svg>
    ),
  },
];

const ROLE_LABELS = { membro: 'Membro', admin: 'Admin', master: 'Master' };

const HamburgerIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

export default function MemberLayout({ children, title, subtitle, navItemRefs }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { count: avisosNaoVistos } = useUnreadAvisos();

  useEffect(() => {
    const raw = sessionStorage.getItem('usuarioCamarize') || localStorage.getItem('usuarioCamarize');
    if (raw) {
      try { setUser(JSON.parse(raw)); } catch {}
    }
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const token = sessionStorage.getItem('token') || localStorage.getItem('token');
      if (token) {
        await fetch('/api/users/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {}
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('usuarioCamarize');
    localStorage.removeItem('token');
    localStorage.removeItem('usuarioCamarize');
    window.location.href = '/';
  };

  const isActive = (href) => {
    if (href === '/home') return router.pathname === '/home';
    return router.pathname === href || router.pathname.startsWith(href + '/');
  };

  // Admin e master também abrem estas páginas (dashboard, edição de cativeiro, relatórios...)
  // a partir do painel: a barra deve continuar sendo a do papel deles, voltando às abas do painel
  const role = user?.role || 'membro';
  const painel = role === 'admin' ? ADMIN_MENU : role === 'master' ? MASTER_MENU : null;
  // Membro não decide solicitações: o contador só consulta a API para admin/master
  const { count: solicitacoesPendentes } = useSolicitacoesPendentes({ ativo: !!painel });
  // Contadores compartilhados com os painéis (mesmo valor em todas as telas)
  const badges = { avisos: avisosNaoVistos, solicitacoes: solicitacoesPendentes };
  // Até ler o usuário, a barra fica sem itens (evita piscar o menu de outro papel)
  const sidebarItems = !user ? [] : painel
    ? painel.map(({ id, icon: Icon, label, disabled, hint }) => ({
        key: id,
        label,
        disabled,
        hint,
        badge: badges[id],
        icon: <Icon />,
        active: id === ABA_DAS_PAGINAS_DE_CATIVEIRO[role],
        onClick: () => { router.push(`/${role}?tab=${id}`); setMobileMenuOpen(false); },
      }))
    : NAV_ITEMS.map(item => ({
        key: item.href,
        label: item.label,
        icon: item.icon,
        badge: item.href === '/notifications' ? avisosNaoVistos : undefined,
        ref: navItemRefs?.[item.href],
        active: isActive(item.href),
        onClick: () => { router.push(item.href); setMobileMenuOpen(false); },
      }));

  return (
    <div className={styles.layout}>
      {mobileMenuOpen && (
        <div className={styles.backdrop} onClick={() => setMobileMenuOpen(false)} />
      )}

      <Sidebar
        open={mobileMenuOpen}
        userName={user?.nome}
        roleLabel={ROLE_LABELS[role] || 'Membro'}
        onLogout={() => { setMobileMenuOpen(false); setShowLogoutModal(true); }}
        items={sidebarItems}
      />

      <main className={styles.main}>
        {(title || subtitle) && (
          <div className={styles.topBar}>
            <button className={styles.hamburgerBtn} onClick={() => setMobileMenuOpen(true)} aria-label="Abrir menu">
              <HamburgerIcon />
            </button>
            <div>
              {title && <h1 className={styles.pageTitle}>{title}</h1>}
              {subtitle && <p className={styles.pageSubtitle}>{subtitle}</p>}
            </div>
          </div>
        )}
        <div className={styles.content}>
          {children}
        </div>
      </main>

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
            onClick={handleLogout}
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
