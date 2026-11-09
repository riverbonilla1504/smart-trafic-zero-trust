"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

// Modo presentacion: oculta el menu, agranda el texto y permite pasar de pagina con las flechas.
export function Presenter({ order }: { order: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [on, setOn] = useState(false);

  useEffect(() => {
    try {
      setOn(localStorage.getItem("st-present") === "1");
    } catch {
      /* almacenamiento no disponible */
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("presenting", on);
    try {
      localStorage.setItem("st-present", on ? "1" : "0");
    } catch {
      /* almacenamiento no disponible */
    }
  }, [on]);

  const index = Math.max(0, order.indexOf(pathname));
  const go = useCallback(
    (delta: number) => {
      const next = order[Math.min(order.length - 1, Math.max(0, index + delta))];
      if (next && next !== pathname) router.push(next);
    },
    [index, order, pathname, router],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select") || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") go(1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") go(-1);
      else if (e.key === "p" || e.key === "P") setOn((v) => !v);
      else if (e.key === "f" || e.key === "F") {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen().catch(() => {});
      } else if (e.key === "Escape") setOn(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  return (
    <div className="presenter">
      <button type="button" className="btn" onClick={() => setOn((v) => !v)} aria-pressed={on}>
        {on ? "Salir de presentación" : "Modo presentación"}
      </button>
      <span className="presenter-pos">
        {index + 1}/{order.length}
      </span>
      <span className="presenter-keys">← → navegar · P presentar · F pantalla completa</span>
      {on ? (
        <div className="presenter-nav">
          <button type="button" className="btn" onClick={() => go(-1)} disabled={index === 0} aria-label="Anterior">
            ←
          </button>
          <button type="button" className="btn" onClick={() => go(1)} disabled={index === order.length - 1} aria-label="Siguiente">
            →
          </button>
        </div>
      ) : null}
    </div>
  );
}
