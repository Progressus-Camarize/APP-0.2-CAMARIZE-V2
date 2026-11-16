import styles from "@/components/LoginContent/LoginContent.module.css";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";

// Figma "Telas do sistema / Tipo usuário"
const TIPOS = [
  { tipo: "funcionario", nome: "Employee", descricao: "Sign up as an employee", icone: "/images/tipo-funcionario.svg" },
  { tipo: "proprietario", nome: "Owner", descricao: "Sign up as an owner", icone: "/images/tipo-proprietario.svg" },
];

export default function RegisterTypePage() {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (router.isReady) {
      setIsReady(true);
    }
  }, [router.isReady]);

  const handleSelectType = (tipo) => {
    if (!isReady) return;
    // Usar window.location diretamente para garantir que funciona
    window.location.href = `/auth?tipo=${tipo}`;
  };

  return (
    <div className={styles.loginMobileWrapper}>
      <div className={styles.loginForm}>
        <h1 className={`${styles.loginTitle} ${styles.loginTitleCenter}`}>
          Choose the type of account you want to create
        </h1>
        <div className={styles.divider} />
        {TIPOS.map(({ tipo, nome, descricao, icone }) => (
          <button
            key={tipo}
            type="button"
            className={styles.typeCard}
            onClick={() => handleSelectType(tipo)}
          >
            <img src={icone} alt="" width={80} height={80} />
            <span className={styles.typeCardName}>{nome}</span>
            <span className={styles.typeCardDesc}>{descricao}</span>
          </button>
        ))}
        <div className={styles.divider} />
        <div className={styles.registerRow}>
          <span>Already have an account?</span>
          <Link href="/login" className={styles.registerLink}>Sign in</Link>
        </div>
      </div>
      <div className={styles.logoWrapper}>
        <Image src="/images/logo-login.svg" alt="Camarize" width={231} height={41.8} />
      </div>
    </div>
  );
}
