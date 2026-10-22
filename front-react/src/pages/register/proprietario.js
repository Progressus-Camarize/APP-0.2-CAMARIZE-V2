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
        router.push("/register-type");
      }
    } else {
      router.push("/register-type");
    }
  }, [router]);

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

  // Figma "Telas do sistema / Cadastro fazenda"
  return (
    <div className={styles.loginMobileWrapper}>
      <form className={styles.loginForm} onSubmit={handleRegister}>
        <h2 className={styles.loginTitle}>Cadastre sua fazenda para continuar</h2>
        <div className={styles.divider} />
        <div className={styles.fields}>
          <div className={styles.userDataBox}>
            <span className={styles.userDataTitle}>Seus dados</span>
            <div className={styles.userDataRow}>
              <span>Nome:</span>
              <span>{userData.nome}</span>
            </div>
            <div className={styles.userDataRow}>
              <span>Email:</span>
              <span>{userData.email}</span>
            </div>
          </div>

          <label htmlFor="fazenda-nome" className={styles.fieldLabel}>Nome da fazenda:</label>
          <input
            id="fazenda-nome"
            type="text"
            className={styles.input}
            value={fazenda.nome}
            onChange={e => setFazenda({ ...fazenda, nome: e.target.value })}
            placeholder="Nome"
            required
          />

          <span className={styles.fieldLabel}>Endereço:</span>
          <input
            type="text"
            className={styles.input}
            value={fazenda.rua}
            onChange={e => setFazenda({ ...fazenda, rua: e.target.value })}
            placeholder="Rua"
            aria-label="Rua"
            required
          />
          <input
            type="text"
            className={styles.input}
            value={fazenda.bairro}
            onChange={e => setFazenda({ ...fazenda, bairro: e.target.value })}
            placeholder="Bairro"
            aria-label="Bairro"
            required
          />
          <div className={styles.fieldRow}>
            <input
              type="text"
              className={styles.input}
              value={fazenda.cidade}
              onChange={e => setFazenda({ ...fazenda, cidade: e.target.value })}
              placeholder="Cidade"
              aria-label="Cidade"
              required
            />
            <input
              type="text"
              className={styles.input}
              value={fazenda.numero}
              onChange={e => setFazenda({ ...fazenda, numero: e.target.value })}
              placeholder="Número"
              aria-label="Número"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          className={styles.loginButton}
          disabled={loading}
        >
          {loading ? (
            <span className={styles.loginButtonContent}>
              <span className={styles.spinner} aria-hidden="true" />
              Cadastrando...
            </span>
          ) : "Cadastrar"}
        </button>

        {error && <div className={styles.errorMsg}>{error}</div>}

        <div className={styles.divider} />
        <div className={styles.registerRow}>
          <span>Deseja alterar as informações de login?</span>
          <Link href="/auth?tipo=proprietario" className={styles.registerLink}>Voltar</Link>
        </div>
      </form>
      <div className={styles.logoWrapper}>
        <Image src="/images/logo-login.svg" alt="Camarize" width={231} height={41.8} />
      </div>
    </div>
  );
}
