import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagen minima: solo el servidor y los modulos que usa.
  output: "standalone",
  // No anunciar la tecnologia del servidor.
  poweredByHeader: false,
  reactStrictMode: true,
  // El panel cambia cada pocos segundos; nada se cachea en el navegador.
  async headers() {
    return [
      {
        source: "/:path((?!_next/static).*)",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
