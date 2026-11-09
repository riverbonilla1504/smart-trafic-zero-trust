import { connection } from "next/server";
import { LiveEvents } from "@/components/LiveEvents";
import { PageHead, Section, Tag } from "@/components/ui";
import { HOSTS } from "@/lib/hosts";

const STEPS = [
  {
    title: "El sensor se autentica",
    who: "ingest-ec2 → auth-ec2 · HTTPS 443",
    text:
      "traffic_sensor_simulator envía client_id y client_secret por HTTPS (TLS 1.3, certificado de la CA interna). auth compara el secreto contra su hash scrypt en tiempo constante y, si es correcto, firma un JWT RS256 de 5 minutos con iss=smarttraffic-auth, aud=smarttraffic-core y scope=events:publish. Cada emisión o denegación queda en la auditoría.",
    controls: ["TLS 1.2+", "scrypt + sal", "RS256", "20 peticiones/min", "auditoría JSON"],
  },
  {
    title: "El evento entra en Kafka",
    who: "ingest-ec2 → data-ec2 · Kafka 9092",
    text:
      "Cada evento se publica en el topic traffic_raw_events junto con el token. La conexión usa TLS mutuo: Kafka exige el certificado de cliente ingest-ec2 firmado por la CA interna. El grupo de seguridad st-data solo acepta 9092 desde st-ingest y st-core.",
    controls: ["TLS mutuo", "SG por grupo", "nftables forward"],
  },
  {
    title: "core verifica cada mensaje",
    who: "data-ec2 → core-ec2 · Kafka 9092",
    text:
      "traffic_density_processor consume el topic (también con TLS mutuo) y valida el token de cada mensaje con la clave pública: algoritmo RS256 únicamente, firma, emisor, audiencia, caducidad y scope events:publish. Si algo falla, el mensaje se descarta. core no puede emitir tokens: no tiene la clave privada.",
    controls: ["verificación por mensaje", "lista blanca de algoritmos", "clave pública"],
  },
  {
    title: "Se calcula la congestión y se publica",
    who: "core-ec2 → data-ec2 · AMQPS 5671",
    text:
      "Con la velocidad y la ocupación se clasifica la congestión (LOW/MEDIUM/HIGH) y el evento procesado se publica en el exchange traffic.events de RabbitMQ por AMQPS. El usuario core solo tiene permiso de escritura sobre ese exchange.",
    controls: ["AMQPS (TLS)", "usuario por servicio", "mínimo privilegio"],
  },
  {
    title: "La DMZ consume las alertas",
    who: "data-ec2 → app-ec2 · AMQPS 5671",
    text:
      "alert_dispatcher, en la DMZ, consume por AMQPS con su propio usuario (puede leer traffic.events pero no publicar en él) y entrega cada evento al backend interno, que no publica puertos: solo Nginx llega a él dentro de la red Docker.",
    controls: ["AMQPS", "sin puertos publicados", "redes Docker separadas"],
  },
  {
    title: "El navegador recibe el evento",
    who: "app-ec2 → navegador · HTTPS/WSS 443",
    text:
      "Nginx termina TLS, exige usuario y contraseña, aplica límite de 5 peticiones/s y envía las cabeceras de seguridad. El WebSocket /ws entrega los eventos en vivo; React los pinta como texto, así que un dato no puede inyectar HTML.",
    controls: ["HTTPS + HSTS", "basic auth", "limit_req", "CSP con nonce"],
  },
];

const LAYERS = [
  { name: "Perímetro (AWS)", text: "Grupos de seguridad por zona que se referencian entre sí, deny por defecto en entrada y salida. Solo la DMZ acepta 80/443 de internet y solo el bastión acepta SSH, desde una IP /32." },
  { name: "Red", text: "Una subred por zona. Las zonas internas no tienen IP pública ni ruta a internet (NAT eliminado tras la instalación)." },
  { name: "Host", text: "nftables con política drop en input/forward/output en cada máquina, SSH solo con clave y solo desde el bastión, kernel endurecido, auditd, parches al día." },
  { name: "Contenedor", text: "Sistema de archivos de solo lectura, sin capacidades de Linux, no-new-privileges, usuario sin privilegios, límites de memoria y procesos, secretos montados en solo lectura." },
  { name: "Transporte", text: "TLS 1.2+ en todos los saltos; TLS mutuo en Kafka y en los reportes de monitoreo. CA interna ECDSA P-256." },
  { name: "Aplicación", text: "JWT RS256 verificado en cada mensaje, permisos por scope, usuarios de RabbitMQ con mínimo privilegio, límites de peticiones y CSP estricta." },
  { name: "Detección", text: "Agentes en cada máquina que evalúan los controles cada 30 s, contadores de paquetes descartados, auditoría de tokens, fail2ban y pipeline Trivy en cada push." },
];

export default async function ArchitecturePage() {
  await connection();
  return (
    <>
      <PageHead
        kicker="Cómo funciona"
        title="Del sensor al navegador, verificando en cada salto"
        lead="Zero Trust aplicado de forma literal: estar dentro de la red no da acceso a nada. Cada conexión se cifra y se autentica, y cada mensaje se verifica por sí mismo."
      />

      <Section title="Recorrido de un evento" kicker="Flujo de datos">
        <ol className="flow">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flow-step">
              <span className="flow-num">{i + 1}</span>
              <div className="flow-body">
                <h3>{s.title}</h3>
                <div className="mono muted small">{s.who}</div>
                <p>{s.text}</p>
                <div className="tags">
                  {s.controls.map((c) => (
                    <Tag key={c} tone="info">{c}</Tag>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Eventos en vivo" kicker="Paso 6 en tiempo real">
        <LiveEvents />
      </Section>

      <Section title="Defensa en profundidad" kicker="Capas independientes">
        <div className="layers">
          {LAYERS.map((l) => (
            <div key={l.name} className="layer">
              <h3>{l.name}</h3>
              <p>{l.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Cómo se monitorea" kicker="Agentes con identidad propia">
        <div className="grid grid-2">
          <div className="card">
            <h3>Agente en cada máquina</h3>
            <p className="muted">
              Un timer de systemd ejecuta <code>/usr/local/sbin/st-agent</code> cada 30 s. Revisa firewall, SSH, kernel, parches, hora, puertos,
              contenedores, certificados y actividad, y prueba las conexiones permitidas y prohibidas desde la propia máquina y desde su contenedor.
            </p>
            <p className="muted">
              El reporte describe la configuración pero nunca la copia: no incluye variables de entorno, contraseñas, claves ni tokens.
            </p>
          </div>
          <div className="card">
            <h3>Entrega con TLS mutuo</h3>
            <p className="muted">
              El agente envía el reporte a <code>https://10.0.1.10:9443/report</code> con su certificado <code>agent-&lt;máquina&gt;</code>. Nginx
              exige y verifica ese certificado con la CA interna; el puerto solo está abierto para los grupos de seguridad del proyecto.
            </p>
            <p className="muted">
              El dashboard acepta el reporte solo si trae el token de la pasarela, si el CN del certificado coincide con la máquina que dice
              reportar y si la IP de origen es la de esa máquina. Si una máquina deja de reportar, se marca como retrasada a los 90 s y caída a los 180 s.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Zonas y máquinas" kicker="Inventario">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Zona</th>
                <th>Máquina</th>
                <th>Subred</th>
                <th>Tipo</th>
                <th>IP pública</th>
                <th>Función</th>
              </tr>
            </thead>
            <tbody>
              {HOSTS.map((h) => (
                <tr key={h.id}>
                  <td>{h.zone}</td>
                  <td className="mono">{h.name}<div className="muted">{h.ip}</div></td>
                  <td className="mono">{h.subnet}</td>
                  <td className="mono">{h.type} · {h.vcpu} vCPU · {h.ramGb} GB</td>
                  <td>{h.publicIp ? <Tag tone="warn">sí</Tag> : <Tag tone="ok">no</Tag>}</td>
                  <td>{h.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
