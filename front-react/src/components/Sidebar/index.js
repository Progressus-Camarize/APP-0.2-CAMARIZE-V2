import styles from '@/styles/panel.module.css';

// Barra lateral dos painéis (membro, admin e master) — Figma "components / sidebar".
// Cada item: { key, label, icon, active, onClick, badge?, disabled?, hint?, ref? }
export default function Sidebar({ items, userName, roleLabel, open, onLogout }) {
  const initials = (userName || '?')
    .split(' ')
    .filter(Boolean)
    .map(parte => parte[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`}>
      <div className={styles.sidebarHeader}>
        <img src="/images/logo-sidebar.svg" className={styles.sidebarLogo} alt="Camarize" width={152} height={28} />
      </div>

      <nav className={styles.sidebarNav}>
        {items.map(item => (
          <button
            key={item.key}
            ref={item.ref}
            type="button"
            className={`${styles.navItem} ${item.active ? styles.navItemActive : ''} ${item.disabled ? styles.navItemDisabled : ''}`}
            onClick={item.disabled ? undefined : item.onClick}
            disabled={item.disabled}
            aria-current={item.active ? 'page' : undefined}
            title={item.disabled ? `${item.label} — ${item.hint || 'em breve'}` : item.label}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            <span className={styles.navLabel}>{item.label}</span>
            {item.disabled && <span className={styles.navHint}>{item.hint || 'em breve'}</span>}
            {item.badge > 0 && <span className={styles.navBadge}>{item.badge}</span>}
          </button>
        ))}
      </nav>

      <div className={styles.sidebarFooter}>
        <div className={styles.userCard}>
          <div className={styles.userAvatar}>{initials}</div>
          <div className={styles.userInfo}>
            <div className={styles.userName}>{userName || ''}</div>
            <div className={styles.userRoleBadge}>{roleLabel}</div>
          </div>
        </div>
        <button type="button" className={styles.sidebarLogoutBtn} onClick={onLogout}>
          Sair da conta
        </button>
      </div>
    </aside>
  );
}
