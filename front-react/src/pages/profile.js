import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import styles from "../components/ProfileContent/ProfileContent.module.css";
import MemberLayout from "../components/MemberLayout";
import Notification from "../components/Notification";
import AuthError from "../components/AuthError";
import Loading from "../components/Loading";
import axios from "axios";
import { jwtDecode } from "jwt-decode";

export default function Profile() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [previewFoto, setPreviewFoto] = useState(null);
  const [salvandoFoto, setSalvandoFoto] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });
  const fileInputRef = useRef();

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
  };

  const hideNotification = () => {
    setNotification({ show: false, message: '', type: 'success' });
  };

  const handleEditPhoto = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showNotification("Por favor, selecione apenas arquivos de imagem.", 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showNotification("A imagem deve ter menos de 5MB.", 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewFoto(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSalvarFoto = async () => {
    if (!previewFoto) return;
    setSalvandoFoto(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const token = localStorage.getItem("token");
      const decoded = jwtDecode(token);
      const userId = decoded.id;

      await axios.patch(`${apiUrl}/users/${userId}/photo`, { foto_perfil: previewFoto }, {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });

      setUser(prev => ({ ...prev, foto_perfil: previewFoto }));
      setPreviewFoto(null);
      showNotification("Foto atualizada com sucesso!", 'success');
    } catch {
      showNotification("Erro ao salvar foto.", 'error');
    } finally {
      setSalvandoFoto(false);
    }
  };

  const handleShowTourAgain = () => {
    try {
      const raw = localStorage.getItem('usuarioCamarize');
      const u = raw ? JSON.parse(raw) : null;
      const userId = u?._id || u?.id || u?.userId || null;
      const tourKey = userId ? `camarize_home_tour_done_${userId}` : 'camarize_home_tour_done';
      localStorage.removeItem(tourKey);
      showNotification('Tutorial reativado. Abrindo tela inicial...', 'success');
      setTimeout(() => router.push('/home'), 600);
    } catch {
      router.push('/home');
    }
  };

  useEffect(() => {
    async function fetchUser() {
      try {
        const token = localStorage.getItem("token");
        if (!token) return setLoading(false);
        const decoded = jwtDecode(token);
        const userId = decoded.id;
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
        const res = await axios.get(`${apiUrl}/users/${userId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        let foto_perfil = res.data.foto_perfil;
        if (foto_perfil && typeof foto_perfil === "string" && foto_perfil.startsWith("data:image")) {
          // already prefixed
        } else if (foto_perfil && typeof foto_perfil === "string") {
          foto_perfil = `data:image/jpeg;base64,${foto_perfil}`;
        } else {
          foto_perfil = "data:image/svg+xml;utf8,<svg width='110' height='110' viewBox='0 0 110 110' fill='none' xmlns='http://www.w3.org/2000/svg'><circle cx='55' cy='55' r='55' fill='%23e6d6f7'/><circle cx='55' cy='45' r='22' fill='%23fff'/><ellipse cx='55' cy='85' rx='32' ry='18' fill='%23fff'/><circle cx='55' cy='45' r='14' fill='%23d1b3f7'/></svg>";
        }
        setUser({ _id: res.data._id, nome: res.data.nome, email: res.data.email, foto_perfil });
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    fetchUser();
  }, []);

  if (loading) return (
    <MemberLayout title="Perfil" subtitle="Gerencie seus dados pessoais">
      <Loading message="Carregando perfil..." />
    </MemberLayout>
  );
  if (!user) return (
    <MemberLayout title="Perfil" subtitle="Gerencie seus dados pessoais">
      <AuthError error="Não foi possível carregar o perfil." onRetry={() => window.location.reload()} />
    </MemberLayout>
  );

  return (
    <MemberLayout title="Perfil" subtitle="Gerencie seus dados pessoais">
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className={styles.profileBox} style={{ position: 'relative', boxShadow: 'none', border: '1px solid #e2e8f0', borderRadius: 16 }}>
          <div className={styles.avatarBox}>
            <img src={previewFoto || user.foto_perfil} alt="Foto do usuário" className={styles.avatar} />
            <button className={styles.editPhotoBtn} title="Editar foto" onClick={handleEditPhoto} type="button">
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
                <path d="M15.232 5.232a3 3 0 1 1 4.243 4.243L7.5 21H3v-4.5L15.232 5.232Z" stroke="#222" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          <div className={styles.userName}>{user.nome}</div>
          <div className={styles.userRole}>Membro</div>
          <form className={styles.formBox}>
            <label className={styles.label}>Nome Completo</label>
            <input className={styles.input} value={user.nome} disabled />
            <label className={styles.label}>E-mail</label>
            <input className={styles.input} value={user.email} disabled />
          </form>
          {previewFoto && (
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
              <button
                onClick={handleSalvarFoto}
                disabled={salvandoFoto}
                style={{ background: '#10b981', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: salvandoFoto ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: salvandoFoto ? 0.7 : 1 }}
              >
                {salvandoFoto ? 'Salvando...' : 'Salvar Foto'}
              </button>
              <button
                onClick={() => setPreviewFoto(null)}
                style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}
              >
                Cancelar
              </button>
            </div>
          )}
        </div>

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={handleShowTourAgain}
            style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontSize: '0.855rem', fontWeight: 600 }}
          >
            Mostrar tutorial novamente
          </button>
        </div>
      </div>

      <Notification isVisible={notification.show} message={notification.message} type={notification.type} onClose={hideNotification} />
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" style={{ display: 'none' }} />
    </MemberLayout>
  );
}
