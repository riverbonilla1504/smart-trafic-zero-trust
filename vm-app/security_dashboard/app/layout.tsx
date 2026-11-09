import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Nav } from "@/components/Nav";
import { Presenter } from "@/components/Presenter";
import { time } from "@/lib/format";
import { CLASS_NAV, MAIN_NAV, PRESENTATION_ORDER } from "@/lib/navigation";
import { summary } from "@/lib/store";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Traffic · Seguridad",
  description: "Estado en vivo de la infraestructura Zero Trust y evidencia de los controles aplicados en cada clase.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Renderizado por peticion: los datos son en vivo y la CSP necesita un nonce nuevo cada vez.
  await connection();
  const s = summary();
  const allOnline = s.online === s.total;

  return (
    <html lang="es">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <Link href="/" prefetch={false} className="brand">
              <span className="brand-mark" aria-hidden="true">ST</span>
              <span>
                <strong>Smart Traffic</strong>
                <small>Zero Trust · AWS</small>
              </span>
            </Link>
            <Nav items={MAIN_NAV} classes={CLASS_NAV} />
            <p className="sidebar-foot">
              Sistemas de Comunicación y Seguridad Informática · 2026
            </p>
          </aside>
          <div className="main">
            <header className="topbar">
              <div className="topbar-status">
                <span className={`pill ${allOnline ? "pill-ok" : s.online ? "pill-warn" : "pill-fail"}`}>
                  <span className="status-dot" aria-hidden="true" /> {s.online}/{s.total} máquinas reportando
                </span>
                <span className={`pill ${s.checksOk === s.checksTotal && s.checksTotal ? "pill-ok" : "pill-warn"}`}>
                  {s.checksOk}/{s.checksTotal} controles
                </span>
                <span className="pill">último reporte {time(s.lastReport)}</span>
              </div>
              <div className="topbar-actions">
                <AutoRefresh seconds={15} />
                <Presenter order={PRESENTATION_ORDER} />
              </div>
            </header>
            <main className="content">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
