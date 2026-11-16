import { useRouter } from 'next/router';
import styles from './AuthError.module.css';

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
          <span>⚠️</span>
        </div>
        <h2 className={styles.errorTitle}>
          Restricted Access
        </h2>
        <p className={styles.errorMessage}>
          {error || 'You need to be signed in to access this page'}
        </p>
      </div>
      
      <div className={styles.errorActions}>
        <button 
          onClick={handleLogin}
          className={styles.loginBtn}
        >
          Sign in
        </button>
        {onRetry && (
          <button 
            onClick={handleRetry}
            className={styles.retryBtn}
          >
            Try Again
          </button>
        )}
      </div>
    </div>
  );
} 