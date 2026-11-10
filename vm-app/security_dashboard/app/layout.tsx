import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Nav } from "@/components/Nav";
import { Presenter } from "@/components/Presenter";
import { time } from "@/lib/format";
import { MAIN_NAV, PRESENTATION_ORDER } from "@/lib/navigation";
import { summary } from "@/lib/store";
import "./globals.css";

// Las fuentes se descargan al compilar y se sirven desde el propio servidor (CSP font-src 'self').
const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
// Para IPs, puertos, reglas y comandos: misma familia, ancho fijo.
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Smart Traffic · Seguridad",
  description: "Estado en vivo de la infraestructura Zero Trust y evidencia de los controles de seguridad aplicados.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Renderizado por peticion: los datos son en vivo y la CSP necesita un nonce nuevo cada vez.
  await connection();
  const s = summary();
  const allOnline = s.online === s.total;
  const allChecks = s.checksTotal > 0 && s.checksOk === s.checksTotal;

  return (
    <html lang="es" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>
        <div className="app">
          <header className="header">
            <div className="header-row">
              <Link href="/" prefetch={false} className="brand">
                <span className="brand-mark" aria-hidden="true">ST</span>
                <span>
                  <strong>Smart Traffic · Seguridad Zero Trust</strong>
                  <small>Estado en vivo de las 6 máquinas EC2 y evidencia de los controles aplicados.</small>
                </span>
              </Link>
              <div className="header-status">
                <span className={`pill ${allOnline ? "pill-ok" : s.online ? "pill-warn" : "pill-fail"}`}>
                  <span className="status-dot" aria-hidden="true" /> {s.online}/{s.total} máquinas
                </span>
                <span className={`pill ${allChecks ? "pill-ok" : "pill-warn"}`}>
                  <span className="status-dot" aria-hidden="true" /> {s.checksOk}/{s.checksTotal} controles
                </span>
                <span className="muted small">último reporte {time(s.lastReport)}</span>
                <AutoRefresh seconds={15} />
                <Presenter order={PRESENTATION_ORDER} />
              </div>
            </div>
            <Nav items={MAIN_NAV} />
          </header>
          <main className="content">{children}</main>
          <footer className="footer">
            <div>Smart Traffic · 2026 · Los datos vienen de los agentes de cada máquina (TLS mutuo, cada 30 s).</div>
          </footer>
        </div>
      </body>
    </html>
  );
}
