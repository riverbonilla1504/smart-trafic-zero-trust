"use client";

import { useEffect, useRef, useState } from "react";

type TrafficEvent = {
  sensor_id?: string;
  location?: string;
  speed_kmh?: number;
  occupancy?: number;
  congestion_level?: string;
  processed_at_utc?: string;
  auth_client?: string;
};

// Eventos en vivo: RabbitMQ -> alert_dispatcher -> backend -> WebSocket (wss://<host>/ws).
// Los valores se pintan como texto: React escapa todo, un evento no puede inyectar HTML.
export function LiveEvents({ max = 25 }: { max?: number }) {
  const [events, setEvents] = useState<(TrafficEvent & { _k: number })[]>([]);
  const [status, setStatus] = useState<"conectando" | "conectado" | "sin conexión">("conectando");
  const [count, setCount] = useState(0);
  const key = useRef(0);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    function connect() {
      socket = new WebSocket(`wss://${window.location.host}/ws`);
      socket.onopen = () => setStatus("conectado");
      socket.onmessage = (message) => {
        try {
          const event = JSON.parse(String(message.data)) as TrafficEvent;
          key.current += 1;
          setCount((c) => c + 1);
          setEvents((list) => [{ ...event, _k: key.current }, ...list].slice(0, max));
        } catch {
          /* mensaje no valido: se ignora */
        }
      };
      socket.onclose = () => {
        setStatus("sin conexión");
        if (!closed) retry = setTimeout(connect, 3000);
      };
    }
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, [max]);

  return (
    <div className="live-events">
      <div className="live-head">
        <span className={`status ${status === "conectado" ? "ok" : status === "conectando" ? "pending" : "fail"}`}>
          <span className="status-dot" aria-hidden="true" /> WebSocket {status}
        </span>
        <span className="muted">{count} eventos recibidos en esta sesión</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Hora</th>
              <th>Sensor</th>
              <th>Velocidad</th>
              <th>Ocupación</th>
              <th>Congestión</th>
              <th>Token de</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  Esperando eventos…
                </td>
              </tr>
            ) : (
              events.map((e) => (
                <tr key={e._k}>
                  <td className="mono">{e.processed_at_utc ? new Date(e.processed_at_utc).toLocaleTimeString("es-CO") : "—"}</td>
                  <td className="mono">{String(e.sensor_id ?? "—")}</td>
                  <td>{e.speed_kmh != null ? `${Number(e.speed_kmh).toFixed(1)} km/h` : "—"}</td>
                  <td>{e.occupancy != null ? `${Math.round(Number(e.occupancy) * 100)} %` : "—"}</td>
                  <td>
                    <span className={`level level-${String(e.congestion_level ?? "").toLowerCase()}`}>{String(e.congestion_level ?? "—")}</span>
                  </td>
                  <td className="mono">{String(e.auth_client ?? "—")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
