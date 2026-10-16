import { useEffect, useState } from 'react';

export default function Notification({ message, type = 'success', isVisible, onClose, duration = 3000, actionLabel, onAction, showProgress = false, progressDuration, onTimeout }) {
  const [animKey, setAnimKey] = useState(0);
  useEffect(() => {
    if (isVisible && duration > 0) {
      const timer = setTimeout(() => {
        try { onTimeout?.(); } catch {}
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  // Reinicia a animação sempre que a notificação é mostrada ou o conteúdo muda
  useEffect(() => {
    if (isVisible) {
      setAnimKey((k) => k + 1);
    }
  }, [isVisible, message, type]);

  if (!isVisible) return null;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        );
      case 'error':
        return (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        );
      case 'warning':
        return (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        );
      default:
        return (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        );
    }
  };

  const getStyles = () => {
    // Tema único em azul bebê para todos os tipos
    return {
      background: 'linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)', // azul com maior contraste
      borderColor: '#1e40af',
      iconColor: '#fff'
    };
  };

  const styles = getStyles();

  return (
    <>
    <div key={animKey}
      style={{
        position: 'fixed',
        top: '56px',
        left: '50%',
        transform: 'translate(-50%, -20px) scale(0.98)',
        right: 'auto',
        zIndex: 9999,
        minWidth: '380px',
        maxWidth: '92vw',
        background: styles.background,
        border: `1px solid ${styles.borderColor}`,
        borderRadius: '12px',
        padding: '16px 20px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        color: '#fff',
        fontSize: '14px',
        fontWeight: '500',
        lineHeight: '1.4',
        opacity: 0,
        willChange: 'transform, opacity',
        animation: 'toastSlideDown 600ms cubic-bezier(0.22, 0.61, 0.36, 1) forwards',
        overflow: 'hidden'
      }}
    >
      <div style={{ color: styles.iconColor, flexShrink: 0 }}>
        {getIcon()}
      </div>
      <div style={{ flex: 1 }}>
        {message}
      </div>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          style={{
            background: 'rgba(255,255,255,0.15)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.35)',
            borderRadius: '8px',
            padding: '8px 10px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '12px',
            marginRight: '8px'
          }}
        >
          {actionLabel}
        </button>
      )}
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          color: 'rgba(255,255,255,0.85)',
          cursor: 'pointer',
          padding: '4px',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.9,
          transition: 'opacity 0.2s'
        }}
        onMouseOver={(e) => e.target.style.opacity = '1'}
        onMouseOut={(e) => e.target.style.opacity = '0.8'}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {showProgress && (
        <div style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 6,
          background: 'rgba(255,255,255,0.15)'
        }}>
          <div style={{
            height: '100%',
            borderRadius: 0,
            background: 'linear-gradient(90deg, #f472b6 0%, #fb7185 100%)',
            width: '100%',
            animation: `toastProgress ${progressDuration || duration}ms linear forwards`
          }} />
        </div>
      )}
    </div>
    <style jsx>{`
      @keyframes toastSlideDown {
        0% { transform: translate(-50%, -24px) scale(0.98); opacity: 0; }
        55% { transform: translate(-50%, 6px) scale(1); opacity: 1; }
        80% { transform: translate(-50%, 0) scale(1); opacity: 1; }
        100% { transform: translate(-50%, 0) scale(1); opacity: 1; }
      }
      @keyframes toastProgress {
        from { width: 100%; }
        to { width: 0%; }
      }
      @media (prefers-reduced-motion: reduce) {
        @keyframes toastSlideDown {
          0% { transform: translate(-50%, 0); opacity: 0; }
          100% { transform: translate(-50%, 0); opacity: 1; }
        }
      }
    `}</style>
    </>
  );
} 