import Link from "next/link";
import type { HostState } from "@/lib/types";

type NodeInfo = { state: HostState; checksOk: number; checksTotal: number };

const NODES: { id: string; x: number; y: number; title: string; sub: string; zone: string }[] = [
  { id: "bastion", x: 455, y: 32, title: "bastion-ec2", sub: "10.0.0.10 · SSH", zone: "Administración" },
  { id: "app", x: 175, y: 250, title: "app-ec2", sub: "10.0.1.10 · Nginx + Next", zone: "DMZ" },
  { id: "data", x: 455, y: 250, title: "data-ec2", sub: "10.0.5.10 · Kafka/RabbitMQ", zone: "Datos" },
  { id: "core", x: 740, y: 140, title: "core-ec2", sub: "10.0.4.10 · procesador", zone: "Procesamiento" },
  { id: "ingest", x: 740, y: 370, title: "ingest-ec2", sub: "10.0.3.10 · sensores", zone: "Ingesta" },
  { id: "auth", x: 455, y: 460, title: "auth-ec2", sub: "10.0.2.10 · emisor JWT", zone: "Identidad" },
];

const W = 190;
const H = 76;
const center = (id: string) => {
  const n = NODES.find((x) => x.id === id)!;
  return { x: n.x + W / 2, y: n.y + H / 2 };
};

type Edge = { from: string | [number, number]; to: string; label: string; kind: "tls" | "mtls" | "ssh"; step?: number; dx?: number; dy?: number };

const EDGES: Edge[] = [
  { from: "ingest", to: "auth", label: "HTTPS 443 · token", kind: "tls", step: 1, dx: 34, dy: 26 },
  { from: "ingest", to: "data", label: "Kafka 9092 · TLS mutuo", kind: "mtls", step: 2, dx: -62, dy: 22 },
  { from: "core", to: "data", label: "9092 mTLS · 5671 AMQPS", kind: "mtls", step: 3, dx: -48, dy: -14 },
  { from: "app", to: "data", label: "AMQPS 5671", kind: "tls", step: 4, dx: 0, dy: -8 },
  { from: "app", to: "auth", label: "HTTPS 443 · token", kind: "tls", dx: -58, dy: 10 },
  { from: [44, 288], to: "app", label: "HTTPS 443", kind: "tls", step: 5, dx: 0, dy: -8 },
  { from: "bastion", to: "app", label: "SSH 22", kind: "ssh", dx: -24, dy: 0 },
  { from: "bastion", to: "data", label: "", kind: "ssh" },
  { from: "bastion", to: "core", label: "", kind: "ssh" },
];

function edgePoints(e: Edge) {
  const a = typeof e.from === "string" ? center(e.from) : { x: e.from[0], y: e.from[1] };
  const b = center(e.to);
  // Recorta la linea al borde de la caja destino para que la flecha quede visible.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const scale = Math.min(Math.abs((W / 2 + 6) / (dx || 1e-6)), Math.abs((H / 2 + 6) / (dy || 1e-6)));
  const end = { x: b.x - dx * Math.min(1, scale), y: b.y - dy * Math.min(1, scale) };
  let start = a;
  if (typeof e.from === "string") {
    const s2 = Math.min(Math.abs((W / 2 + 2) / (dx || 1e-6)), Math.abs((H / 2 + 2) / (dy || 1e-6)));
    start = { x: a.x + dx * Math.min(1, s2), y: a.y + dy * Math.min(1, s2) };
  }
  return { start, end, mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } };
}

export function Architecture({ nodes }: { nodes: Record<string, NodeInfo> }) {
  return (
    <figure className="arch">
      <svg viewBox="0 0 960 560" role="img" aria-labelledby="arch-title arch-desc">
        <title id="arch-title">Arquitectura Zero Trust de Smart Traffic</title>
        <desc id="arch-desc">
          Seis máquinas en subredes separadas. Los sensores piden un token a auth, publican en Kafka con TLS mutuo, core verifica y
          publica en RabbitMQ, y la DMZ entrega los eventos al navegador por HTTPS. El bastión es el único acceso SSH.
        </desc>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="arrow-head" />
          </marker>
          <marker id="arrow-ssh" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="arrow-head-ssh" />
          </marker>
        </defs>

        <rect x="8" y="8" width="944" height="544" rx="12" className="vpc" />
        <text x="24" y="32" className="vpc-label">VPC 10.0.0.0/16 · us-east-1a</text>

        <g className="internet">
          <circle cx="44" cy="288" r="28" />
          <text x="44" y="285" textAnchor="middle">Internet</text>
          <text x="44" y="298" textAnchor="middle" className="small">usuario</text>
        </g>

        {EDGES.map((e, i) => {
          const { start, end, mid } = edgePoints(e);
          return (
            <g key={i} className={`edge edge-${e.kind}`}>
              <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} markerEnd={e.kind === "ssh" ? "url(#arrow-ssh)" : "url(#arrow)"} />
              {e.label ? (
                <text x={mid.x + (e.dx ?? 0)} y={mid.y + (e.dy ?? -7)} textAnchor="middle" className="edge-label">
                  {e.label}
                </text>
              ) : null}
              {e.step ? (
                <g className="step">
                  <circle cx={mid.x} cy={mid.y + 8} r="9" />
                  <text x={mid.x} y={mid.y + 12} textAnchor="middle">
                    {e.step}
                  </text>
                </g>
              ) : null}
            </g>
          );
        })}

        {NODES.map((n) => {
          const info = nodes[n.id];
          const state = info?.state ?? "never";
          return (
            <Link key={n.id} href={`/maquinas/${n.id}`} prefetch={false}>
              <g className={`node node-${state}`}>
                <rect x={n.x} y={n.y} width={W} height={H} rx="10" />
                <text x={n.x + 12} y={n.y + 18} className="node-zone">
                  {n.zone}
                </text>
                <text x={n.x + 12} y={n.y + 38} className="node-title">
                  {n.title}
                </text>
                <text x={n.x + 12} y={n.y + 56} className="node-sub">
                  {n.sub}
                </text>
                <circle cx={n.x + W - 14} cy={n.y + 15} r="5" className="node-dot" />
                {info && info.checksTotal ? (
                  <text x={n.x + W - 26} y={n.y + 19} textAnchor="end" className="node-score">
                    {info.checksOk}/{info.checksTotal}
                  </text>
                ) : null}
              </g>
            </Link>
          );
        })}
      </svg>
      <figcaption className="arch-legend">
        <span><i className="lg lg-tls" /> TLS</span>
        <span><i className="lg lg-mtls" /> TLS mutuo (certificado de cliente)</span>
        <span><i className="lg lg-ssh" /> SSH solo desde el bastión</span>
        <span>Cada máquina envía su reporte a app-ec2:9443 con TLS mutuo cada 30 s · número = controles que cumple</span>
      </figcaption>
    </figure>
  );
}
