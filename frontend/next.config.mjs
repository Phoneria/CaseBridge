/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    // The invite / reset token is in this page's URL: never leak it via Referer.
    return [{ source: "/sifre-belirle", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] }];
  },
  async redirects() {
    return [
      { source: "/simulasyonlar", destination: "/ai", permanent: true },
      { source: "/simulasyonlar/oturum/:id", destination: "/ai/durusma/oturum/:id", permanent: true },
    ];
  },
};

export default nextConfig;
