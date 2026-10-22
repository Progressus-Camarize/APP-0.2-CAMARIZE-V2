import Head from "next/head";
import styles from "@/styles/StartScreen.module.css";
import Image from "next/image";
import { useRouter } from "next/router";
import { useEffect } from "react";

export default function StartScreen() {
  const router = useRouter();
  useEffect(() => {
    try {
      const raw = localStorage.getItem('usuarioCamarize');
      const user = raw ? JSON.parse(raw) : null;
      const role = user?.role || 'membro';
      if (role === 'master') router.replace('/master');
      else if (role === 'admin') router.replace('/admin');
      else {
        // mantém a tela inicial com botão conectar
      }
    } catch {}
  }, []);
  return (
    <>
      <Head>
        <title>Camarize - Início</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main className={styles.startMain}>
        <img src="/images/onda-tela-inicial.svg" alt="" className={styles.waveBg} />
        <div className={styles.logoBox}>
          <Image
            src="/images/logo-tela-inicial.png"
            alt="Camarize"
            width={470}
            height={98}
            priority
          />
        </div>
        <button className={styles.startButton} onClick={() => router.push("/login")}>Conecte-se</button>
      </main>
    </>
  );
} 