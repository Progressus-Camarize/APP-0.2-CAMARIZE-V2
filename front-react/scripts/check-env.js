#!/usr/bin/env node
if (process.env.VERCEL_ENV === 'production' || process.env.REQUIRE_PUBLIC_ENV === 'true') {
  const required = ['NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_SSE_URL'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(
      `\n❌ Build de produção abortado: variáveis ausentes: ${missing.join(', ')}\n` +
      'Configure-as em Vercel → Settings → Environment Variables (ambiente Production).\n'
    );
    process.exit(1);
  }
  for (const key of required) {
    let url;
    try { url = new URL(process.env[key]); }
    catch { console.error(`${key} deve conter uma URL absoluta válida.`); process.exit(1); }
    if (!['http:', 'https:'].includes(url.protocol)
        || (process.env.VERCEL_ENV === 'production' && url.protocol !== 'https:')) {
      console.error(`${key} deve usar HTTPS em produção.`);
      process.exit(1);
    }
    if (process.env.API_URL && url.href !== new URL(process.env.API_URL).href) {
      console.error(`${key} difere da API_URL aprovada para publicação.`);
      process.exit(1);
    }
  }
}
