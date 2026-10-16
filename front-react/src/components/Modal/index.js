import { useState, useEffect } from 'react';
import styles from './Modal.module.css';

export default function Modal({ 
  isOpen, 
  onClose, 
  children, 
  title,
  showCloseButton = true,
  closeOnBackdropClick = true 
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  // Garante que o estado inicial seja sempre consistente
  useEffect(() => {
    if (!isOpen) {
      setIsVisible(false);
      setIsAnimating(false);
    }
    
    // Cleanup: restaura o scroll quando o componente é desmontado
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      // Garante que o estado inicial seja limpo
      setIsAnimating(false);
      setIsVisible(true);
      
      // Força um reflow para garantir que o DOM foi atualizado
      void document.body.offsetHeight;
      
      // SOLUÇÃO GENIAL: Usa requestIdleCallback para sincronizar com o ciclo do navegador
      const startAnimation = () => {
        // Pequeno delay para garantir que o CSS foi aplicado
        setTimeout(() => {
          setIsAnimating(true);
        }, 16); // 1 frame a 60fps
      };
      
      // Se o navegador suporta requestIdleCallback, usa ele
      if (window.requestIdleCallback) {
        window.requestIdleCallback(startAnimation, { timeout: 100 });
      } else {
        // Fallback para navegadores que não suportam
        setTimeout(startAnimation, 16);
      }
      
      // Previne scroll do body quando modal está aberto
      document.body.style.overflow = 'hidden';
    } else {
      setIsAnimating(false);
      // Aguarda a animação terminar antes de esconder
      const timer = setTimeout(() => {
        setIsVisible(false);
        // Restaura o scroll do body
        document.body.style.overflow = '';
      }, 300); // Sincronizado com o tempo da animação
      
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Cleanup adicional para garantir que o scroll seja restaurado
  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleBackdropClick = (e) => {
    if (closeOnBackdropClick && e.target === e.currentTarget) {
      // Restaura o scroll ao clicar no backdrop
      document.body.style.overflow = '';
      onClose();
    }
  };

  const handleClose = () => {
    // Restaura o scroll imediatamente ao fechar
    document.body.style.overflow = '';
    onClose();
  };

  // Não renderiza nada se não estiver visível
  if (!isVisible) {
    return null;
  }

  return (
    <div 
      className={`${styles.modalOverlay} ${isAnimating ? styles.visible : ''}`}
      onClick={handleBackdropClick}
    >
      <div className={`${styles.modalContent} ${isAnimating ? styles.visible : ''}`}>
        {/* Header */}
        {(title || showCloseButton) && (
          <div className={styles.modalHeader}>
            {title && (
              <h2 className={styles.modalTitle}>{title}</h2>
            )}
            {showCloseButton && (
              <button 
                className={styles.closeButton}
                onClick={handleClose}
                aria-label="Fechar modal"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path 
                    d="M18 6L6 18M6 6l12 12" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </div>
        )}
        
        {/* Conteúdo */}
        <div className={styles.modalBody}>
          {children}
        </div>
      </div>
    </div>
  );
} 