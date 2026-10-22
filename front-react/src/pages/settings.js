import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import MemberLayout from "../components/MemberLayout";
import Notification from "../components/Notification";
import SolicitarVinculo from "../components/SolicitarVinculo";



// Novo CSS para a foto circular perfeita e layout sem box
const customStyles = {
  avatar: {
    width: 110,
    height: 110,
    borderRadius: '50%',
    objectFit: 'cover',
    aspectRatio: '1/1',
    border: '3px solid #e6d6f7',
    background: '#f5f5f5',
    display: 'block',
    margin: '0 auto',
  },
  editPhotoBtn: {
    position: 'absolute',
    bottom: 8,
    right: 'calc(50% - 55px)', // centraliza em relação à imagem
    background: '#fff',
    border: '1.5px solid #e6d6f7',
    borderRadius: '50%',
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 2px 8px #0001',
  },
  avatarBox: {
    position: 'relative',
    marginBottom: 10,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    fontSize: '1.18rem',
    fontWeight: 600,
    marginBottom: 2,
    textAlign: 'center',
    marginTop: 10,
  },
  userRole: {
    fontSize: '1rem',
    color: '#888',
    marginBottom: 18,
    textAlign: 'center',
  },
  formBox: {
    width: '100%',
    maxWidth: 400,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginTop: 0,
    background: 'none',
    boxShadow: 'none',
    borderRadius: 0,
    alignItems: 'center',
  },
  label: {
    fontSize: '0.98rem',
    fontWeight: 500,
    color: '#444',
    marginBottom: 0,
    marginTop: 0,
    alignSelf: 'flex-start',
    width: '100%',
    textAlign: 'left',
  },
  input: {
    width: '100%',
    border: 'none',
    background: '#f5f5f5',
    borderRadius: 8,
    padding: '13px 20px',
    fontSize: '1.08rem',
    color: '#222',
    boxSizing: 'border-box',
    marginBottom: 0,
    outline: 'none',
  },
};

// SVG pré-definido como string (avatar simples para fazenda)
const SVG_AVATAR_FAZENDA =
  "data:image/svg+xml;utf8,<svg width='110' height='110' viewBox='0 0 110 110' fill='none' xmlns='http://www.w3.org/2000/svg'><circle cx='55' cy='55' r='55' fill='%23a3c7f7'/><rect x='30' y='60' width='50' height='25' rx='6' fill='%23fff'/><rect x='45' y='50' width='20' height='20' rx='4' fill='%23e6d6f7'/><rect x='52' y='65' width='6' height='20' rx='2' fill='%23a3c7f7'/></svg>";

export default function Settings() {
  const router = useRouter();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const [fazenda, setFazenda] = useState(null);
  const [loading, setLoading] = useState(true);
  const [previewFoto, setPreviewFoto] = useState(null);
  const [salvandoFoto, setSalvandoFoto] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });
  const [fotoFazenda, setFotoFazenda] = useState(SVG_AVATAR_FAZENDA);
  const fileInputRef = useRef();

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
  };

  const hideNotification = () => {
    setNotification({ show: false, message: '', type: 'success' });
  };

  // Buscar o usuário logado do localStorage
  const usuario = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("usuarioCamarize")) : null;
  const USER_ID = usuario?._id;

  useEffect(() => {
    async function fetchFazendaDoUsuario() {
      if (!USER_ID) {
        setFazenda(null);
        setLoading(false);
        return;
      }
      try {
        // Buscar a relação usuario-fazenda
        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        const relRes = await axios.get(`${apiUrl}/usuariosxfazendas?usuario=${USER_ID}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const rel = relRes.data && relRes.data.length > 0 ? relRes.data[0] : null;
        if (rel && rel.fazenda) {
          // Buscar os dados completos da fazenda
          const fazendaRes = await axios.get(`${apiUrl}/fazendas/${rel.fazenda}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setFazenda(fazendaRes.data);
        } else {
          setFazenda(null);
        }
      } catch {
        setFazenda(null);
      }
      setLoading(false);
    }
    fetchFazendaDoUsuario();
  }, [USER_ID, apiUrl]);

  // Buscar foto da fazenda ao carregar ou ao salvar
  useEffect(() => {
    if (!fazenda || previewFoto) return;
    const fetchFoto = async () => {
      try {
        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        const res = await axios.get(`${apiUrl}/fazendas/${fazenda._id}/foto`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setFotoFazenda(res.data.foto || SVG_AVATAR_FAZENDA);
      } catch {
        setFotoFazenda(SVG_AVATAR_FAZENDA);
      }
    };
    fetchFoto();
  }, [fazenda, previewFoto, apiUrl]);

  // Handler para editar foto
  const handleEditPhoto = () => {
    fileInputRef.current.click();
  };

  // Handler para upload de nova foto
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewFoto(reader.result); // Mostra preview imediatamente
      setFotoFazenda(reader.result);
    };
    reader.readAsDataURL(file);
  };

  // Handler para salvar foto no backend
  const handleSalvarFoto = async () => {
    if (!previewFoto || !fazenda._id) return;
    setSalvandoFoto(true);
    try {
      const token = sessionStorage.getItem('token') || localStorage.getItem('token');
      await axios.patch(`${apiUrl}/fazendas/${fazenda._id}/foto`, { foto_sitio: previewFoto }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      showNotification("Foto atualizada com sucesso!", 'success');
      setPreviewFoto(null);
      setFazenda({ ...fazenda, foto_sitio: true });
      setFotoFazenda(previewFoto);
    } catch {
      showNotification("Erro ao salvar foto.", 'error');
    }
    setSalvandoFoto(false);
  };

  if (loading) {
    return (
      <MemberLayout title="Configurações" subtitle="Gerencie a fazenda e preferências do sistema">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '56px 24px', color: '#94a3b8', fontSize: '0.9rem' }}>
          Carregando configurações...
        </div>
      </MemberLayout>
    );
  }

  if (!usuario || !fazenda) {
    return (
      <MemberLayout title="Configurações" subtitle="Gerencie a fazenda e preferências do sistema">
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '48px 32px', textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
          <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.35 }}>🏡</div>
          <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 600, color: '#1e293b' }}>Nenhuma fazenda encontrada</h3>
          <p style={{ margin: '0 0 16px', fontSize: '0.875rem', color: '#64748b', lineHeight: 1.6 }}>
            Este usuário ainda não está associado a nenhuma fazenda.
          </p>
          {usuario?.role === 'membro' && (
            <div style={{ display: 'flex', justifyContent: 'center', textAlign: 'left' }}>
              <SolicitarVinculo />
            </div>
          )}
        </div>
      </MemberLayout>
    );
  }

  return (
    <MemberLayout title="Configurações" subtitle="Gerencie a fazenda e preferências do sistema">
      <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ position: 'relative', marginBottom: 10, marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <img
          src={fotoFazenda}
          alt="Foto da fazenda"
          style={{ width: 110, height: 110, borderRadius: '50%', objectFit: 'cover', aspectRatio: '1/1', border: '3px solid #e6d6f7', background: '#f5f5f5', display: 'block', margin: '0 auto' }}
        />
        <button type="button" title="Editar foto" onClick={handleEditPhoto} style={{ position: 'absolute', bottom: 8, right: 'calc(50% - 55px)', background: '#fff', border: '1.5px solid #e6d6f7', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 8px #0001' }}>
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24"><path d="M15.232 5.232a3 3 0 1 1 4.243 4.243L7.5 21H3v-4.5L15.232 5.232Z" stroke="#222" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
      </div>
      <div style={customStyles.userName}>{fazenda.nome || ""}</div>
      <div style={customStyles.userRole}>Sítio/Fazenda</div>
      <form style={customStyles.formBox}>
        <label style={customStyles.label}>Cidade</label>
        <input style={customStyles.input} value={fazenda.cidade || ""} disabled />
        <label style={customStyles.label}>Bairro</label>
        <input style={customStyles.input} value={fazenda.bairro || ""} disabled />
        <label style={customStyles.label}>Rua</label>
        <input style={customStyles.input} value={fazenda.rua || ""} disabled />
        <label style={customStyles.label}>Número</label>
        <input style={customStyles.input} value={fazenda.numero || ""} disabled />
        {previewFoto && (
          <button
            type="button"
            onClick={handleSalvarFoto}
            disabled={salvandoFoto}
            style={{ 
              marginTop: 16, 
              padding: '12px 24px', 
              borderRadius: 8, 
              background: '#a3c7f7', 
              color: '#fff', 
              border: 'none', 
              fontWeight: 600, 
              cursor: 'pointer', 
              fontSize: '1rem',
              width: '100%'
            }}
          >
            {salvandoFoto ? 'Salvando...' : 'Salvar foto'}
          </button>
        )}
      </form>

      {/* Seção de Configurações Avançadas */}
      <div style={{
        width: '100%',
        maxWidth: 400,
        margin: '32px auto 0',
        padding: '24px',
        background: '#f8fafc',
        borderRadius: '16px',
        border: '1px solid #e2e8f0'
      }}>
        <h3 style={{
          margin: '0 0 20px 0',
          fontSize: '18px',
          fontWeight: '600',
          color: '#1f2937',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          ⚙️ Configurações Avançadas
        </h3>
        
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <button
            onClick={() => router.push('/notifications-settings')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              width: '100%',
              textAlign: 'left'
            }}
            onMouseOver={(e) => {
              e.target.style.borderColor = '#3B82F6';
              e.target.style.boxShadow = '0 4px 6px -1px rgba(59, 130, 246, 0.1)';
            }}
            onMouseOut={(e) => {
              e.target.style.borderColor = '#e5e7eb';
              e.target.style.boxShadow = 'none';
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                background: '#dbeafe',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px'
              }}>
                🔔
              </div>
              <div>
                <div style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#1f2937',
                  marginBottom: '4px'
                }}>
                  Notificações Push
                </div>
                <div style={{
                  fontSize: '14px',
                  color: '#6b7280'
                }}>
                  Configure alertas no celular
                </div>
              </div>
            </div>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
              <path d="M9 18l6-6-6-6" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <button
            onClick={() => router.push('/email-settings')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              width: '100%',
              textAlign: 'left'
            }}
            onMouseOver={(e) => {
              e.target.style.borderColor = '#3B82F6';
              e.target.style.boxShadow = '0 4px 6px -1px rgba(59, 130, 246, 0.1)';
            }}
            onMouseOut={(e) => {
              e.target.style.borderColor = '#e5e7eb';
              e.target.style.boxShadow = 'none';
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                background: '#fef3c7',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px'
              }}>
                📧
              </div>
              <div>
                <div style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#1f2937',
                  marginBottom: '4px'
                }}>
                  Configurações de Email
                </div>
                <div style={{
                  fontSize: '14px',
                  color: '#6b7280'
                }}>
                  Quantidade de emails e modo silêncio
                </div>
              </div>
            </div>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
              <path d="M9 18l6-6-6-6" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
      <Notification
        isVisible={notification.show}
        message={notification.message}
        type={notification.type}
        onClose={hideNotification}
      />
      </div>
    </MemberLayout>
  );
} 