import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* PWA Manifest */}
        <link rel="manifest" href="/manifest.json" />
        
        {/* PWA Icons */}
        <link rel="icon" type="image/svg+xml" href="/images/camarao.svg" />
        <link rel="icon" type="image/svg+xml" sizes="192x192" href="/images/camarao.svg" />
        <link rel="icon" type="image/svg+xml" sizes="512x512" href="/images/camarao.svg" />
        
        {/* Apple Touch Icons */}
        <link rel="apple-touch-icon" href="/images/camarao.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Camarize" />
        
        {/* PWA Meta Tags */}
        <meta name="theme-color" content="#3B82F6" />
        <meta name="application-name" content="Camarize" />
        <meta name="mobile-web-app-capable" content="yes" />
        
        {/* PWA Description */}
        <meta name="description" content="Smart monitoring system for shrimp ponds" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
