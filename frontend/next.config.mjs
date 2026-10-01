/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/simulasyonlar", destination: "/ai", permanent: true },
      { source: "/simulasyonlar/oturum/:id", destination: "/ai/durusma/oturum/:id", permanent: true },
    ];
  },
};

export default nextConfig;
