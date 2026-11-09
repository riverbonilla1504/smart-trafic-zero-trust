"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Vuelve a pedir los datos del servidor cada pocos segundos sin recargar la pagina.
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    const tick = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          if (document.visibilityState === "visible") router.refresh();
          return seconds;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [router, seconds]);

  return (
    <span className="refresh" title="Los datos se actualizan solos">
      <span className="refresh-dot" aria-hidden="true" /> actualiza en {left} s
    </span>
  );
}
