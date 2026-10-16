import styles from "@/components/LoginContent/LoginContent.module.css";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import axios from "axios";

export default function AuthPage() {
  const router = useRouter();
  const { tipo } = router.query;
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Se não tiver tipo, redireciona para register-type
  useEffect(() => {
    if (router.isReady && !tipo) {
      router.push("/register-type");
    }
  }, [router.isReady, tipo, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Validar campos obrigatórios
    if (!nome || !nome.trim()) {
      setError("Por favor, preencha seu nome completo.");
      setLoading(false);
      return;
    }

    if (!email || !email.trim()) {
      setError("Por favor, preencha seu email.");
      setLoading(false);
      return;
    }

    if (!senha || senha.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      setLoading(false);
      return;
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

      // Criar conta
      if (tipo === 'funcionario') {
        try {
          await axios.post(`${apiUrl}/users/register/funcionario`, {
            nome: nome.trim(),
            email: email.trim(),
            senha: senha,
            foto_perfil: null
          });

          // Após criar, fazer login automático
          const loginRes = await axios.post(`${apiUrl}/users/auth`, { email, senha });
          
          if (typeof window !== 'undefined') {
            sessionStorage.setItem("token", loginRes.data.token);
            localStorage.setItem("token", loginRes.data.token);
          }

          const meRes = await axios.get(`${apiUrl}/users/me`, {
            headers: { Authorization: `Bearer ${loginRes.data.token}` }
          });
          const usuario = meRes.data;
          
          if (typeof window !== 'undefined') {
            sessionStorage.setItem("usuarioCamarize", JSON.stringify(usuario));
            localStorage.setItem("usuarioCamarize", JSON.stringify(usuario));
          }

          router.push('/home');
        } catch (registerError) {
          const errorMessage = registerError?.response?.data?.error || registerError?.response?.data?.message;
          if (errorMessage?.toLowerCase().includes('já existe') || errorMessage?.toLowerCase().includes('already exists')) {
            setError("Este email já está cadastrado. Faça login na página de login.");
          } else {
            setError(errorMessage || "Erro ao criar conta. Verifique os dados e tente novamente.");
          }
          setLoading(false);
        }
      } else if (tipo === 'proprietario') {
        // Para proprietário, precisa preencher dados da fazenda
        // Salvar dados temporários e redirecionar para página de cadastro de fazenda
        try {
          // Verificar se o email já existe antes de salvar os dados temporários
          try {
            await axios.post(`${apiUrl}/users/auth`, { email, senha });
            // Se chegou aqui, o login funcionou, então o email já existe
            setError("Este email já está cadastrado. Faça login na página de login.");
            setLoading(false);
            return;
          } catch (loginError) {
            // Se o login falhou com 404, o usuário não existe, então podemos criar
            if (loginError?.response?.status !== 404) {
              // Outro erro (senha incorreta, etc) - email existe
              setError("Este email já está cadastrado. Faça login na página de login.");
              setLoading(false);
              return;
            }
          }

          // Email não existe, salvar dados temporários
          if (typeof window !== 'undefined') {
            const pendingData = {
              tipoUsuario: 'proprietario',
              nome: nome.trim(),
              email: email.trim(),
              senha: senha
            };
            sessionStorage.setItem('pendingRegistration', JSON.stringify(pendingData));
            localStorage.setItem('pendingRegistration', JSON.stringify(pendingData));
          }
          
          // Redireciona para página de cadastro de fazenda
          router.push('/register/proprietario');
        } catch (error) {
          setError(error?.response?.data?.error || "Erro ao processar cadastro. Tente novamente.");
          setLoading(false);
        }
      }
    } catch (error) {
      console.error('Erro:', error);
      setError(error?.response?.data?.error || "Erro ao processar sua solicitação. Tente novamente.");
      setLoading(false);
    }
  };

  if (!tipo) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Carregando...</div>;
  }

  const tipoLabel = tipo === 'funcionario' ? 'Funcionário' : 'Proprietário';
  const tipoIcon = tipo === 'funcionario' ? '👷' : '🏢';
  const tipoGradient = tipo === 'funcionario' 
    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' 
    : 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';

  return (
    <div className={styles.loginMobileWrapper}>
      <form className={styles.loginForm} onSubmit={handleSubmit}>
        <div style={{ 
          textAlign: 'center', 
          marginBottom: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span style={{ fontSize: '48px' }}>{tipoIcon}</span>
          <h2 className={styles.loginTitle} style={{ marginBottom: '8px' }}>
            Cadastre-se como {tipoLabel}
          </h2>
          <p style={{ 
            color: '#6b7280', 
            fontSize: '14px',
            margin: 0
          }}>
            Preencha seus dados para criar sua conta
          </p>
        </div>

        <div className={styles.inputGroup}>
          <input
            type="text"
            name="nome"
            placeholder="Nome completo"
            className={styles.input}
            value={nome}
            onChange={e => {
              setNome(e.target.value);
              setError("");
            }}
            autoComplete="name"
            required
          />
        </div>

        <div className={styles.inputGroup}>
          <input
            type="email"
            name="email"
            placeholder="Email"
            className={styles.input}
            value={email}
            onChange={e => {
              setEmail(e.target.value);
              setError("");
            }}
            autoComplete="email"
            required
          />
        </div>

        <div className={styles.inputGroup}>
          <input
            type={showPassword ? "text" : "password"}
            name="password"
            placeholder="Senha"
            className={styles.input}
            value={senha}
            onChange={e => {
              setSenha(e.target.value);
              setError("");
            }}
            autoComplete="new-password"
            required
          />
          <span
            className={styles.eyeIcon}
            onClick={() => setShowPassword((v) => !v)}
            tabIndex={0}
            role="button"
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
          >
            {showPassword ? (
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M12 5C7 5 2.73 8.11 1 12c1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" fill="#888"/><circle cx="12" cy="12" r="2.5" fill="#888"/></svg>
            ) : (
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M2 2l20 20M12 5c-5 0-9.27 3.11-11 7a12.35 12.35 0 0 0 5.29 5.29M17.94 17.94A11.94 11.94 0 0 0 23 12c-1.73-3.89-6-7-11-7a11.94 11.94 0 0 0-5.29 1.29" stroke="#888" strokeWidth="2"/><path d="M9.5 9.5a3 3 0 0 1 4.24 4.24" stroke="#888" strokeWidth="2"/></svg>
            )}
          </span>
        </div>

        {error && <div className={styles.errorMsg}>{error}</div>}

        <button
          type="submit"
          className={styles.loginButton}
          disabled={loading || !email || !senha || !nome}
          style={{ 
            background: loading 
              ? "linear-gradient(90deg, #ccc 0%, #999 100%)" 
              : tipoGradient, 
            color: "#fff",
            cursor: (loading || !email || !senha || !nome) ? "not-allowed" : "pointer"
          }}
        >
          {loading ? "Criando conta..." : "Criar Conta"}
        </button>

        <div className={styles.registerRow}>
          <span>Já tem uma conta?</span>
          <Link href="/login" className={styles.registerLink}>Fazer login</Link>
        </div>

        <div className={styles.registerRow} style={{ marginTop: '8px' }}>
          <span>Deseja escolher outro tipo?</span>
          <Link href="/register-type" className={styles.registerLink}>Voltar</Link>
        </div>
      </form>
      <div className={styles.logoWrapper}>
        <Image src="/images/logo.svg" alt="Camarize Logo" width={180} height={40} />
      </div>
    </div>
  );
}

