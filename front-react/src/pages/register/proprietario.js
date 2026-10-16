import styles from "@/components/LoginContent/LoginContent.module.css";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import axios from "axios";

export default function RegisterProprietarioPage() {
  const router = useRouter();
  const [userData, setUserData] = useState(null);
  const [fazenda, setFazenda] = useState({
    nome: "",
    rua: "",
    bairro: "",
    cidade: "",
    numero: ""
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const storedData = typeof window !== 'undefined' 
      ? sessionStorage.getItem('pendingRegistration') || localStorage.getItem('pendingRegistration')
      : null;
    
    if (storedData) {
      try {
        const parsed = JSON.parse(storedData);
        if (parsed.tipoUsuario !== 'proprietario') {
          router.push("/register-type");
          return;
        }
        setUserData(parsed);
      } catch (e) {
        router.push("/register");
      }
    } else {
      router.push("/register");
    }
  }, [router]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 480);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!userData) return;
    
    setError("");
    
    // Validar dados da fazenda
    if (!fazenda.nome || !fazenda.rua || !fazenda.bairro || !fazenda.cidade || !fazenda.numero) {
      setError("Todos os campos da fazenda são obrigatórios.");
      return;
    }

    setLoading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      
      // Criar cadastro de proprietário (cria usuário e fazenda diretamente)
      await axios.post(`${apiUrl}/users/register/proprietario`, {
        nome: userData.nome,
        email: userData.email,
        senha: userData.senha,
        foto_perfil: null,
        fazenda: fazenda
      });

      // Limpar dados temporários
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('pendingRegistration');
        localStorage.removeItem('pendingRegistration');
      }

      // Fazer login automático após cadastro
      try {
        const loginResponse = await axios.post(`${apiUrl}/users/auth`, { 
          email: userData.email, 
          senha: userData.senha 
        });
        
        // Salvar token
        if (typeof window !== 'undefined') {
          sessionStorage.setItem("token", loginResponse.data.token);
          localStorage.setItem("token", loginResponse.data.token);
        }

        // Buscar o usuário autenticado
        const meRes = await axios.get(`${apiUrl}/users/me`, {
          headers: { Authorization: `Bearer ${loginResponse.data.token}` }
        });
        const usuario = meRes.data;
        
        if (typeof window !== 'undefined') {
          sessionStorage.setItem("usuarioCamarize", JSON.stringify(usuario));
          localStorage.setItem("usuarioCamarize", JSON.stringify(usuario));
        }

        // Redireciona conforme a role
        const role = usuario?.role || 'membro';
        if (role === 'master') router.push('/master');
        else if (role === 'admin') router.push('/admin');
        else router.push('/home');
      } catch (loginError) {
        // Se o login falhar, ainda assim redireciona para login
        setError("Cadastro realizado com sucesso! Faça login para continuar.");
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      }
    } catch (error) {
      const errorMessage = error?.response?.data?.error || error?.message || "Erro ao criar cadastro.";
      setError(errorMessage);
      setLoading(false);
    }
  };

  if (!userData) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Carregando...</div>;
  }

  return (
    <div className={styles.loginMobileWrapper} style={{ padding: '20px' }}>
      <form 
        className={styles.loginForm} 
        onSubmit={handleRegister} 
        style={{ 
          maxWidth: '500px', 
          width: '100%',
          padding: '0 20px'
        }}
      >
        <h2 className={styles.loginTitle} style={{ textAlign: 'center', fontSize: 'clamp(1.15rem, 4vw, 1.5rem)' }}>
          Cadastro de Proprietário
        </h2>
        <p style={{ 
          textAlign: 'center', 
          marginBottom: '24px', 
          color: '#666', 
          fontSize: 'clamp(12px, 3vw, 14px)',
          lineHeight: '1.5'
        }}>
          Preencha seus dados e os dados da sua fazenda
        </p>

        {/* Dados do usuário (readonly) */}
        <div style={{ 
          padding: 'clamp(12px, 3vw, 16px)', 
          background: '#f8f9fa', 
          borderRadius: '8px', 
          marginBottom: '20px',
          border: '1px solid #e9ecef',
          width: '100%'
        }}>
          <h3 style={{ 
            fontSize: 'clamp(13px, 3vw, 14px)', 
            fontWeight: '600', 
            marginBottom: '12px', 
            color: '#333' 
          }}>
            Seus Dados
          </h3>
          <div style={{ 
            marginBottom: '8px',
            fontSize: 'clamp(13px, 3vw, 14px)',
            wordBreak: 'break-word'
          }}>
            <strong>Nome:</strong> {userData.nome}
          </div>
          <div style={{ 
            fontSize: 'clamp(13px, 3vw, 14px)',
            wordBreak: 'break-word'
          }}>
            <strong>Email:</strong> {userData.email}
          </div>
        </div>

        {/* Dados da fazenda */}
        <h3 style={{ 
          fontSize: 'clamp(14px, 3.5vw, 16px)', 
          fontWeight: '600', 
          marginBottom: '16px', 
          color: '#333',
          width: '100%'
        }}>
          Dados da Fazenda
        </h3>
        
        <div style={{ marginBottom: '12px', width: '100%' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '4px', 
            fontWeight: '500', 
            fontSize: 'clamp(13px, 3vw, 14px)' 
          }}>
            Nome da Fazenda *
          </label>
          <input
            type="text"
            className={styles.input}
            value={fazenda.nome}
            onChange={e => setFazenda({ ...fazenda, nome: e.target.value })}
            placeholder="Nome da fazenda"
            required
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '12px', width: '100%' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '4px', 
            fontWeight: '500', 
            fontSize: 'clamp(13px, 3vw, 14px)' 
          }}>
            Rua *
          </label>
          <input
            type="text"
            className={styles.input}
            value={fazenda.rua}
            onChange={e => setFazenda({ ...fazenda, rua: e.target.value })}
            placeholder="Rua"
            required
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '12px', width: '100%' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '4px', 
            fontWeight: '500', 
            fontSize: 'clamp(13px, 3vw, 14px)' 
          }}>
            Bairro *
          </label>
          <input
            type="text"
            className={styles.input}
            value={fazenda.bairro}
            onChange={e => setFazenda({ ...fazenda, bairro: e.target.value })}
            placeholder="Bairro"
            required
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          marginBottom: '12px',
          flexDirection: isMobile ? 'column' : 'row',
          width: '100%'
        }}>
          <div style={{ flex: isMobile ? '1' : '2', width: isMobile ? '100%' : 'auto' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '4px', 
              fontWeight: '500', 
              fontSize: 'clamp(13px, 3vw, 14px)' 
            }}>
              Cidade *
            </label>
            <input
              type="text"
              className={styles.input}
              value={fazenda.cidade}
              onChange={e => setFazenda({ ...fazenda, cidade: e.target.value })}
              placeholder="Cidade"
              required
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ flex: isMobile ? '1' : '1', width: isMobile ? '100%' : 'auto' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '4px', 
              fontWeight: '500', 
              fontSize: 'clamp(13px, 3vw, 14px)' 
            }}>
              Número *
            </label>
            <input
              type="text"
              className={styles.input}
              value={fazenda.numero}
              onChange={e => setFazenda({ ...fazenda, numero: e.target.value })}
              placeholder="Nº"
              required
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {error && <div className={styles.errorMsg} style={{ width: '100%' }}>{error}</div>}

        <button
          type="submit"
          className={styles.loginButton}
          disabled={loading}
          style={{ 
            background: "linear-gradient(90deg, #f093fb 0%, #f5576c 100%)", 
            color: "#fff",
            width: '100%',
            fontSize: 'clamp(14px, 3.5vw, 16px)',
            padding: 'clamp(12px, 3vw, 14px)'
          }}
        >
          {loading ? "Criando conta..." : "Criar Conta"}
        </button>

        <div style={{ 
          marginTop: '16px', 
          padding: 'clamp(10px, 2.5vw, 12px)', 
          background: '#d1f2eb', 
          borderRadius: '8px', 
          border: '1px solid #28a745',
          fontSize: 'clamp(12px, 3vw, 13px)',
          color: '#155724',
          width: '100%',
          lineHeight: '1.5'
        }}>
          ✅ <strong>Informação:</strong> Seu cadastro será criado imediatamente. Você será redirecionado automaticamente após o cadastro.
        </div>

        <div className={styles.registerRow} style={{ width: '100%', marginTop: '16px' }}>
          <span style={{ fontSize: 'clamp(12px, 3vw, 14px)' }}>Voltar para seleção?</span>
          <Link href="/register-type" className={styles.registerLink}>Voltar</Link>
        </div>
      </form>
      <div className={styles.logoWrapper}>
        <Image src="/images/logo.svg" alt="Camarize Logo" width={180} height={40} />
      </div>
    </div>
  );
}

