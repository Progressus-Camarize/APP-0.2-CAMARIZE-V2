/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel resolve rotas dinâmicas e rewrites com o servidor Next.js.
  output: 'standalone',
  outputFileTracingRoot: __dirname,
  trailingSlash: false,
  images: {
    unoptimized: true
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    // SSE precisa de conexão direta (sem passar pelo proxy do Next.js que buferiza streaming)
    NEXT_PUBLIC_SSE_URL: process.env.NEXT_PUBLIC_SSE_URL,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "BHRkSsllT2m1OmHkc6xsGdN7CpJFm0zHrfDuA4xh14kMt750uWzOsSNc5tI7wUS3Y_qYF6CjBBfyfIrlZgCY9cs"
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_PROXY_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/:path*`
      }
    ];
  }
};

module.exports = nextConfig;
