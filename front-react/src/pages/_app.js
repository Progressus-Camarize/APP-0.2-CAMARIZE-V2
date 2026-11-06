import "@/styles/globals.css";
import { RegisterProvider } from "@/context/RegisterContext";
import Head from "next/head";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { revalidarInscricaoPush } from "@/lib/push";

export default function MyApp({ Component, pageProps }) {
  const router = useRouter();

  // Inscrição de push feita com chave antiga é renovada sozinha (só para quem já permitiu notificações)
  useEffect(() => {
    const revalidar = () => revalidarInscricaoPush().catch(e => console.warn('[Camarize Push] Não foi possível renovar a inscrição:', e));
    revalidar();
    router.events.on('routeChangeComplete', revalidar);
    return () => router.events.off('routeChangeComplete', revalidar);
  }, [router.events]);

  return (
    <>
      <Head>
        <title>Camarize</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </Head>
      <RegisterProvider>
        <Component {...pageProps} />
      </RegisterProvider>
    </>
  );
}
