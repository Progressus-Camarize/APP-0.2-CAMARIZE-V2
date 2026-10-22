import panelStyles from "@/styles/panel.module.css";
import { useEffect, useState } from "react";
import axios from "axios";

const ACTION = 'associar_funcionario';

// Funcionário sem fazenda pede ao master para ser vinculado a uma.
// Quando o usuário já tem fazenda, renderiza `fallback` (ou nada).
export default function SolicitarVinculo({ fallback = null }) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const [estado, setEstado] = useState('carregando'); // carregando | vinculado | livre | pendente | recusado
  const [fazendaInformada, setFazendaInformada] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const getAuth = () => {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    const raw = sessionStorage.getItem('usuarioCamarize') || localStorage.getItem('usuarioCamarize');
    return { token, usuario: raw ? JSON.parse(raw) : null };
  };

  useEffect(() => {
    async function carregar() {
      try {
        const { token, usuario } = getAuth();
        if (!token || !usuario?._id) return setEstado('livre');
        const headers = { Authorization: `Bearer ${token}` };
        const [rels, meus] = await Promise.all([
          axios.get(`${apiUrl}/usuariosxfazendas?usuario=${usuario._id}`, { headers }),
          axios.get(`${apiUrl}/requests/mine`, { headers }),
        ]);
        const ativos = Array.isArray(rels.data) ? rels.data.filter(r => r.ativo !== false) : [];
        if (ativos.length > 0) return setEstado('vinculado');
        // /requests/mine já vem do mais recente para o mais antigo
        const ultimo = (meus.data || []).find(r => r.action === ACTION);
        if (ultimo?.status === 'pendente') return setEstado('pendente');
        if (ultimo?.status === 'recusado') return setEstado('recusado');
        setEstado('livre');
      } catch {
        setEstado('livre');
      }
    }
    carregar();
  }, [apiUrl]);

  const solicitar = async () => {
    setErro("");
    setEnviando(true);
    try {
      const { token, usuario } = getAuth();
      await axios.post(`${apiUrl}/requests`, {
        action: ACTION,
        payload: {
          nome: usuario?.nome,
          email: usuario?.email,
          fazendaInformada: fazendaInformada.trim() || undefined,
        },
      }, { headers: { Authorization: `Bearer ${token}` } });
      setEstado('pendente');
    } catch (e) {
      if (e?.response?.status === 409) setEstado('pendente');
      else setErro(e?.response?.data?.error || 'Não foi possível enviar o pedido. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  };

  if (estado === 'carregando') return null;
  if (estado === 'vinculado') return fallback;

  return (
    <div className={panelStyles.infoPanel} style={{ maxWidth: 480, width: '100%' }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Você ainda não está vinculado a uma fazenda</div>
      {estado === 'pendente' ? (
        <div style={{ fontSize: 13 }}>
          Pedido de vínculo enviado. Assim que o administrador do sistema aprovar, os cativeiros da fazenda aparecerão aqui.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, marginBottom: 12 }}>
            {estado === 'recusado'
              ? 'Seu último pedido de vínculo foi recusado. Confira com o proprietário da fazenda e envie um novo pedido.'
              : 'Peça para ser vinculado à fazenda onde você trabalha. O administrador do sistema vai analisar o pedido.'}
          </div>
          <input
            type="text"
            value={fazendaInformada}
            onChange={e => setFazendaInformada(e.target.value)}
            placeholder="Nome da fazenda ou do proprietário (opcional)"
            maxLength={120}
            aria-label="Nome da fazenda ou do proprietário"
            style={{ width: '100%', margin: '0 0 10px', padding: '8px 10px', border: '1px solid #bae6fd', borderRadius: 6, fontSize: 13, background: '#fff' }}
          />
          {erro && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{erro}</div>}
          <button
            type="button"
            className={`${panelStyles.btn} ${panelStyles.btnPrimary} ${panelStyles.btnSm}`}
            onClick={solicitar}
            disabled={enviando}
          >
            {enviando ? 'Enviando...' : 'Solicitar vínculo a uma fazenda'}
          </button>
        </>
      )}
    </div>
  );
}
