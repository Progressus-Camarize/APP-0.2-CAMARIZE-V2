import { forwardRef, useState } from 'react';
import axios from 'axios';

const RequestButton = forwardRef(function RequestButton(
  { labelWhenAllowed = 'Run', labelWhenRequest = 'Request', action, payload = {}, buildPayload, forceRequest = false, fazenda = null, className = '', onSuccess, children, ...restProps },
  ref
) {
  const [submitting, setSubmitting] = useState(false);
  const usuarioRaw = typeof window !== 'undefined' ? (sessionStorage.getItem('usuarioCamarize') || localStorage.getItem('usuarioCamarize')) : null;
  const usuario = usuarioRaw ? JSON.parse(usuarioRaw) : null;
  const role = usuario?.role || 'membro';

  const isMember = role === 'membro';

  const handleClick = async (e) => {
    if (!isMember && !forceRequest) {
      if (onSuccess) onSuccess(e);
      return;
    }

    // Evita submit do formulário ou navegação para membros
    if (e && typeof e.preventDefault === 'function') e.preventDefault();

    try {
      setSubmitting(true);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const token = typeof window !== 'undefined' ? (sessionStorage.getItem('token') || localStorage.getItem('token')) : null;
      const finalPayload = typeof buildPayload === 'function' ? buildPayload() : payload;
      await axios.post(`${apiUrl}/requests`, {
        action,
        payload: finalPayload,
        fazenda,
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      alert('Request sent to the Admin.');
    } catch (err) {
      console.error('Erro ao enviar solicitação:', err);
      alert('Failed to send request.');
    } finally {
      setSubmitting(false);
    }
  };

  const content = children && !submitting ? children : (submitting ? 'Sending...' : (isMember ? labelWhenRequest : labelWhenAllowed));

  return (
    <button ref={ref} className={className} onClick={handleClick} disabled={submitting} {...restProps}>
      {content}
    </button>
  );
});

export default RequestButton;

