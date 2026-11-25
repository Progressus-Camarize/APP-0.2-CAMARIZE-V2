import { useRouter } from 'next/router';
import styles from './AuthError.module.css';
import { TbAlertTriangle } from 'react-icons/tb';

export default function AuthError({ error, onRetry }) {
  const router = useRouter();

  const handleLogin = () => {
    router.push('/login');
  };

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      window.location.reload();
    }
  };

  return (
    <div className={styles.errorContainer}>
      <button 
        className={styles.backBtn} 
        onClick={() => router.push('/login')} 
      >
        <span style={{ fontSize: 24, lineHeight: 1 }}>&larr;</span>
      </button>
      
      <div className={styles.errorContent}>
        <div className={styles.errorIcon}>
          <TbAlertTriangle aria-hidden="true" />
        </div>
        <h2 className={styles.errorTitle}>
          Acesso Restrito
        </h2>
        <p className={styles.errorMessage}>
          {error || 'Você precisa estar logado para acessar esta página'}
        </p>
      </div>
      
      <div className={styles.errorActions}>
        <button 
          onClick={handleLogin}
          className={styles.loginBtn}
        >
          Fazer Login
        </button>
        {onRetry && (
          <button 
            onClick={handleRetry}
            className={styles.retryBtn}
          >
            Tentar Novamente
          </button>
        )}
      </div>
    </div>
  );
} 