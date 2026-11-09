"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Vuelve a pedir los datos del servidor cada pocos segundos sin recargar la pagina.
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  const [left, setLeft] = useState(seconds);
  const deadline = useRef(0);

  useEffect(() => {
    deadline.current = Date.now() + seconds * 1000;
    const tick = setInterval(() => {
      const remaining = Math.ceil((deadline.current - Date.now()) / 1000);
      if (remaining <= 0) {
        deadline.current = Date.now() + seconds * 1000;
        if (document.visibilityState === "visible") router.refresh();
        setLeft(seconds);
      } else {
        setLeft(remaining);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [router, seconds]);

  return (
    <span className="refresh" title="Los datos se actualizan solos">
      <span className="refresh-dot" aria-hidden="true" /> actualiza en {left} s
    </span>
  );
}
