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
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Se não tiver tipo, redireciona para register-type
  useEffect(() => {
    if (router.isReady && !tipo) {
      router.push("/register-type");
    }
  }, [router.isReady, tipo, router]);

  // Proprietário voltando da tela da fazenda: reaproveita nome e email já digitados
  useEffect(() => {
    if (tipo !== 'proprietario') return;
    try {
      const raw = sessionStorage.getItem('pendingRegistration') || localStorage.getItem('pendingRegistration');
      const pending = raw ? JSON.parse(raw) : null;
      if (pending?.tipoUsuario === 'proprietario') {
        setNome(pending.nome || "");
        setEmail(pending.email || "");
      }
    } catch {}
  }, [tipo]);

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

    if (senha !== confirmarSenha) {
      setError("As senhas não coincidem.");
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
          // E-mail já cadastrado é verificado no envio final, na tela da fazenda
          // (o login não revela mais quais e-mails existem)
          // Salvar dados temporários
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

  const isFormValid = nome && email && senha && confirmarSenha;

  // Figma "Telas do sistema / Cadastro"
  return (
    <div className={styles.loginMobileWrapper}>
      <form className={styles.loginForm} onSubmit={handleSubmit}>
        <h2 className={styles.loginTitle}>Cadastre-se para continuar</h2>
        <div className={styles.divider} />
        <div className={styles.fields}>
          <div className={styles.inputGroup}>
            <input
              type="text"
              name="nome"
              placeholder="Nome"
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
            <button
              type="button"
              className={`${styles.eyeIcon} ${showPassword ? styles.eyeIconOff : ""}`}
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              aria-pressed={showPassword}
            >
              <img src="/images/login-olho.svg" alt="" width={16} height={16} />
            </button>
          </div>
          <div className={styles.inputGroup}>
            <input
              type={showConfirm ? "text" : "password"}
              name="confirmPassword"
              placeholder="Confirmar senha"
              className={styles.input}
              value={confirmarSenha}
              onChange={e => {
                setConfirmarSenha(e.target.value);
                setError("");
              }}
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              className={`${styles.eyeIcon} ${showConfirm ? styles.eyeIconOff : ""}`}
              onClick={() => setShowConfirm((v) => !v)}
              aria-label={showConfirm ? "Ocultar confirmação de senha" : "Mostrar confirmação de senha"}
              aria-pressed={showConfirm}
            >
              <img src="/images/login-olho.svg" alt="" width={16} height={16} />
            </button>
          </div>
        </div>

        <button
          type="submit"
          className={styles.loginButton}
          disabled={loading || !isFormValid}
        >
          {loading ? (
            <span className={styles.loginButtonContent}>
              <span className={styles.spinner} aria-hidden="true" />
              {tipo === 'funcionario' ? "Criando conta..." : "Verificando..."}
            </span>
          ) : "Prosseguir"}
        </button>

        {error && <div className={styles.errorMsg}>{error}</div>}

        <div className={styles.divider} />
        <div className={styles.registerRow}>
          <span>Deseja escolher outro tipo?</span>
          <Link href="/register-type" className={styles.registerLink}>Voltar</Link>
        </div>
        <div className={styles.registerRow}>
          <span>Já tem uma conta?</span>
          <Link href="/login" className={styles.registerLink}>Fazer login</Link>
        </div>
      </form>
      <div className={styles.logoWrapper}>
        <Image src="/images/logo-login.svg" alt="Camarize" width={231} height={41.8} />
      </div>
    </div>
  );
}
