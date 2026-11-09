// Que se vio en cada documento de clase, como se aplico en el proyecto y con que se demuestra.
// Cada evidencia apunta a un dato real: una comprobacion de los agentes (check), una prueba
// registrada (test), una comprobacion en vivo del dashboard (live) o el inventario de AWS (aws).

export type EvidenceRef =
  | { kind: "check"; id: string }
  | { kind: "test"; id: string }
  | { kind: "live"; id: string }
  | { kind: "aws"; id: string }
  | { kind: "probes" };

export type Applied = { title: string; detail: string; files: string[] };

export type ClassInfo = {
  slug: string;
  label: string;
  date: string;
  title: string;
  pdf: string;
  concepts: string[];
  applied: Applied[];
  evidence: EvidenceRef[];
  limits?: string;
};

export const CLASSES: ClassInfo[] = [
  {
    slug: "criptografia",
    label: "Semana 1",
    date: "1 sep 2026",
    title: "Criptografía y funciones hash",
    pdf: "Semana 1 comunicación y seguridad informatica",
    concepts: [
      "Triada CIA: confidencialidad, integridad y disponibilidad.",
      "Cifrado simétrico frente a asimétrico; firma digital con clave privada y verificación con la pública.",
      "Funciones hash: resumen de tamaño fijo, irreversibles; la sal impide los ataques con tablas precalculadas.",
      "Certificados X.509 y autoridades de certificación (PKI).",
    ],
    applied: [
      {
        title: "CA interna ECDSA P-256",
        detail:
          "Una autoridad de certificación propia firma los certificados de servidor (auth, Kafka, RabbitMQ, Nginx, pasarela de reportes) y de cliente (ingest, core y los 6 agentes). Curva P-256 y firma ECDSA con SHA-256; vigencia de 365 días.",
        files: ["infra/gen-secrets.sh"],
      },
      {
        title: "Secretos de cliente con scrypt y sal",
        detail:
          "auth-server no guarda ningún secreto en claro: solo scrypt(N=16384, r=8, p=1) con 16 bytes de sal aleatoria por cliente. La comparación usa timingSafeEqual y un hash señuelo para clientes inexistentes, de modo que el tiempo de respuesta no revela qué clientes existen.",
        files: ["vm-auth/auth-server/server.js", "infra/gen-secrets.sh"],
      },
      {
        title: "Tokens JWT firmados con RS256",
        detail:
          "auth firma con una clave RSA de 2048 bits que solo existe en auth-ec2. core recibe únicamente la clave pública: puede verificar tokens, pero nunca emitirlos aunque lo comprometan.",
        files: ["vm-auth/auth-server/server.js", "vm-core/traffic_density_processor/src/jwtValidator.js"],
      },
      {
        title: "TLS 1.2 o superior en cada salto",
        detail:
          "Sensor→auth (HTTPS), sensor/core→Kafka (TLS mutuo), core/app→RabbitMQ (AMQPS), navegador→Nginx (HTTPS) y agentes→pasarela (TLS mutuo). TLS 1.0/1.1 quedan rechazados.",
        files: ["vm-data/rabbitmq.conf", "vm-app/nginx/default.conf", "vm-data/docker-compose.yml"],
      },
      {
        title: "Cifrado en reposo y contraseñas",
        detail:
          "Los 6 discos EBS van cifrados con KMS. La contraseña del dashboard se guarda como SHA-512 crypt con sal en htpasswd.",
        files: ["infra/provision.sh"],
      },
    ],
    evidence: [
      { kind: "live", id: "tls-auth" },
      { kind: "live", id: "tls-legacy" },
      { kind: "live", id: "tls-rabbitmq" },
      { kind: "live", id: "tls-nginx" },
      { kind: "check", id: "certs_valid" },
      { kind: "check", id: "jwt_verification" },
      { kind: "check", id: "rabbitmq_tls_only" },
      { kind: "aws", id: "aws_ebs_encrypted" },
    ],
  },
  {
    slug: "trafico-y-cortafuegos",
    label: "Semana 2",
    date: "8 sep 2026",
    title: "Análisis de tráfico, cortafuegos y VPN",
    pdf: "Semana 2 Sistemas de Comunicación y Seguridad Informática",
    concepts: [
      "Captura y análisis de paquetes con Wireshark/tcpdump: qué ve un atacante en la red.",
      "Cortafuegos de filtrado con estado: iptables/UFW, cadenas INPUT, FORWARD y OUTPUT.",
      "Política por defecto «denegar» y reglas explícitas para lo permitido.",
      "VPN y túneles cifrados para el acceso remoto.",
    ],
    applied: [
      {
        title: "nftables en las 6 máquinas, denegación por defecto",
        detail:
          "Cada máquina carga su propia tabla inet hostfw con política drop en input, forward y output. Solo se aceptan las conexiones establecidas y los flujos que esa máquina necesita. La cadena forward (prioridad -10) filtra también el tráfico de los contenedores Docker sin borrar sus reglas.",
        files: ["common/vm-app.conf", "common/vm-data.conf", "common/vm-bastion.conf"],
      },
      {
        title: "Registro y contadores de lo descartado",
        detail:
          "Lo que llega al final de una cadena se cuenta y se registra con un límite de 5 por minuto, para no llenar el disco. Los agentes leen esos contadores y el dashboard los muestra por máquina.",
        files: ["common/vm-core.conf"],
      },
      {
        title: "Aplicación segura del firewall",
        detail:
          "deploy.sh valida las reglas con nft -c, programa una reversión automática a los 120 s y solo la cancela si una conexión SSH nueva sigue funcionando.",
        files: ["infra/deploy.sh"],
      },
      {
        title: "Nada viaja en claro",
        detail:
          "Todos los flujos entre máquinas usan TLS, así que una captura con Wireshark o tcpdump en cualquier punto de la red solo vería registros cifrados. El agente de data-ec2 confirma que cada conexión a RabbitMQ usa TLS y que a Kafka solo están conectados ingest y core.",
        files: ["infra/agent/st-agent.py"],
      },
      {
        title: "Túnel SSH en lugar de VPN",
        detail:
          "El acceso administrativo va cifrado por SSH a través del bastión (ProxyCommand), con clave ed25519 por máquina. Cumple la función de la VPN de la clase: un único punto de entrada autenticado y cifrado.",
        files: ["infra/gen-ssh-config.sh"],
      },
    ],
    evidence: [
      { kind: "check", id: "fw_loaded" },
      { kind: "check", id: "fw_default_drop" },
      { kind: "check", id: "fw_persisted" },
      { kind: "check", id: "rabbitmq_tls_only" },
      { kind: "live", id: "deny-internet" },
      { kind: "probes" },
    ],
    limits: "No se montó una VPN como tal: el bastión SSH cubre el acceso remoto cifrado sin añadir otro servicio.",
  },
  {
    slug: "segmentacion-zero-trust",
    label: "Semana 3",
    date: "15 sep 2026",
    title: "Segmentación de red y Zero Trust",
    pdf: "Semana 3 seguridad y comunicación",
    concepts: [
      "Segmentación con VLAN y subredes para contener un incidente.",
      "Zero Trust: nunca confiar por estar dentro de la red; verificar cada acceso.",
      "Microsegmentación: cada flujo permitido de forma explícita y nada más.",
    ],
    applied: [
      {
        title: "Una subred por zona de confianza",
        detail:
          "VPC 10.0.0.0/16 con 6 subredes: administración (bastión), DMZ (app), identidad (auth), ingesta, procesamiento (core) y datos. Solo la administración y la DMZ tienen ruta a internet.",
        files: ["infra/provision.sh"],
      },
      {
        title: "Grupos de seguridad que se referencian entre sí",
        detail:
          "Las reglas no permiten rangos de IP, sino grupos concretos: Kafka acepta 9092 solo de st-ingest y st-core; RabbitMQ acepta 5671 solo de st-core y st-app. La salida también está restringida por destino.",
        files: ["infra/provision.sh"],
      },
      {
        title: "Verificación por mensaje",
        detail:
          "Estar en la red no da acceso: cada evento de Kafka lleva su JWT y core lo verifica (firma, emisor, audiencia, caducidad y scope) antes de procesarlo. Kafka además exige certificado de cliente.",
        files: ["vm-core/traffic_density_processor/src/index.js"],
      },
      {
        title: "Redes Docker separadas en la DMZ",
        detail:
          "El dashboard de seguridad vive en una red propia (webnet) con Nginx; los servicios de mensajería en otra (appnet). Un contenedor comprometido de appnet no llega al dashboard sin pasar por Nginx.",
        files: ["vm-app/docker-compose.yml"],
      },
      {
        title: "Sin salida a internet en las zonas internas",
        detail:
          "El NAT temporal de la instalación se eliminó: auth, ingest, core y data no tienen ruta de salida. Incluso con una cuenta comprometida no hay canal para exfiltrar datos.",
        files: ["infra/finish-setup.sh", "infra/nat.sh"],
      },
    ],
    evidence: [
      { kind: "check", id: "segmentation" },
      { kind: "probes" },
      { kind: "live", id: "deny-kafka" },
      { kind: "live", id: "deny-ssh" },
      { kind: "live", id: "deny-internet" },
      { kind: "check", id: "kafka_peers" },
      { kind: "aws", id: "aws_private" },
      { kind: "aws", id: "aws_no_nat" },
    ],
  },
  {
    slug: "iam-aaa",
    label: "Semana 4",
    date: "22 sep 2026",
    title: "IAM, AAA y mínimo privilegio",
    pdf: "Semana 4 Comunicación y seguridad Informatica",
    concepts: [
      "AAA: autenticación (quién eres), autorización (qué puedes hacer) y auditoría (qué hiciste).",
      "Servidores centralizados de autenticación (RADIUS/TACACS+).",
      "Control de acceso RBAC/ABAC y principio de mínimo privilegio.",
    ],
    applied: [
      {
        title: "Autenticación centralizada",
        detail:
          "auth-server es el único emisor de identidad: los clientes (sensor y dispatcher) se autentican con client_credentials sobre HTTPS y reciben un JWT de 5 minutos.",
        files: ["vm-auth/auth-server/server.js"],
      },
      {
        title: "Autorización por scope",
        detail:
          "Cada cliente tiene un permiso: sensor → events:publish, dispatcher → events:consume. core rechaza cualquier token que no tenga exactamente events:publish, aunque esté bien firmado.",
        files: ["vm-core/traffic_density_processor/src/jwtValidator.js"],
      },
      {
        title: "Auditoría",
        detail:
          "Cada emisión, denegación o bloqueo por límite queda en un registro JSON con cliente, IP y hora. El agente de auth-ec2 los cuenta y el dashboard los muestra.",
        files: ["vm-auth/auth-server/server.js", "infra/agent/st-agent.py"],
      },
      {
        title: "Mínimo privilegio en RabbitMQ",
        detail:
          "Un usuario por servicio con permisos de expresión regular: core solo escribe en traffic.events, dispatcher solo lee alerts y traffic.events, query solo usa sus colas. El administrador no se usa desde las aplicaciones.",
        files: ["infra/deploy.sh"],
      },
      {
        title: "Sin root en ningún contenedor",
        detail:
          "Todos los servicios corren como usuario sin privilegios, sin capacidades de Linux y con no-new-privileges. El usuario IAM de la infraestructura es distinto de la cuenta raíz.",
        files: ["vm-app/docker-compose.yml"],
      },
    ],
    evidence: [
      { kind: "check", id: "jwt_verification" },
      { kind: "check", id: "auth_audit" },
      { kind: "check", id: "rabbitmq_least_privilege" },
      { kind: "live", id: "auth-deny" },
      { kind: "check", id: "containers_nonroot" },
    ],
    limits:
      "No se usa RADIUS: el servidor de identidad propio cumple el mismo papel centralizado con tokens firmados, que encajan mejor con servicios que con usuarios de red.",
  },
  {
    slug: "bastionado-web",
    label: "Semana 5",
    date: "29 sep 2026",
    title: "Bastionado del servidor web",
    pdf: "Semana 5 Sistemas de Comunicación y Seguridad Informática",
    concepts: [
      "Ocultar la versión del servidor (server_tokens off).",
      "Cabeceras defensivas: X-Frame-Options, X-Content-Type-Options, HSTS, Content-Security-Policy.",
      "Verificación con curl -I y forzar HTTPS.",
    ],
    applied: [
      {
        title: "Nginx sin privilegios como único punto de entrada",
        detail:
          "Imagen nginx-unprivileged (escucha en 8080/8443 como usuario 101), contenedor de solo lectura y sin capacidades. HTTP solo responde 301 hacia HTTPS.",
        files: ["vm-app/nginx/default.conf", "vm-app/docker-compose.yml"],
      },
      {
        title: "Cabeceras de seguridad en todas las respuestas",
        detail:
          "server_tokens off, X-Frame-Options SAMEORIGIN, nosniff, HSTS de un año y Referrer-Policy no-referrer, con «always» para incluir también las respuestas de error.",
        files: ["vm-app/nginx/default.conf"],
      },
      {
        title: "CSP estricta con nonce",
        detail:
          "Este dashboard genera una Content-Security-Policy por petición con un nonce aleatorio y strict-dynamic: solo se ejecutan los scripts firmados por el servidor. No hay estilos ni scripts inline sin nonce.",
        files: ["vm-app/security_dashboard/proxy.ts"],
      },
      {
        title: "Superficie mínima",
        detail:
          "Solo GET y HEAD en el dashboard, cuerpos de 1 KB como máximo, tiempos de espera cortos, autenticación básica con hash SHA-512 y el backend interno sin puertos publicados.",
        files: ["vm-app/nginx/default.conf"],
      },
    ],
    evidence: [
      { kind: "live", id: "headers" },
      { kind: "live", id: "tls-nginx" },
      { kind: "live", id: "http-redirect" },
      { kind: "check", id: "nginx_hardening" },
    ],
  },
  {
    slug: "nac-dmz",
    label: "Semana 6",
    date: "6 oct 2026",
    title: "NAC y cortafuegos por zonas (DMZ)",
    pdf: "Semana 6 Fundamentos de NAC y Cortafuegos",
    concepts: [
      "Zonas de confianza y DMZ para los servicios expuestos a internet.",
      "Control de admisión a la red (NAC): solo entran dispositivos identificados.",
      "Cortafuegos perimetral y de host combinados.",
    ],
    applied: [
      {
        title: "DMZ como única zona con servicio público",
        detail:
          "app-ec2 es la única máquina con puertos abiertos a internet (80 y 443). Desde la DMZ solo se sale a auth (443) y RabbitMQ (5671); no hay camino de la DMZ a Kafka ni a SSH de otras máquinas.",
        files: ["infra/provision.sh", "common/vm-app.conf"],
      },
      {
        title: "Admisión por certificado (NAC)",
        detail:
          "Kafka exige certificado de cliente firmado por la CA interna, y la pasarela de monitoreo (10.0.1.10:9443) solo admite agentes con su propio certificado. Además, el CN del certificado tiene que coincidir con la máquina que reporta.",
        files: ["vm-data/docker-compose.yml", "vm-app/nginx/default.conf"],
      },
      {
        title: "Dos capas de cortafuegos",
        detail:
          "Grupos de seguridad de AWS (perímetro de cada zona) más nftables dentro de cada host. Si una capa se configura mal, la otra sigue bloqueando.",
        files: ["infra/provision.sh", "common/"],
      },
    ],
    evidence: [
      { kind: "aws", id: "aws_dmz_world" },
      { kind: "aws", id: "aws_default_sg" },
      { kind: "live", id: "gateway-no-cert" },
      { kind: "check", id: "gateway_mtls" },
      { kind: "check", id: "kafka_peers" },
      { kind: "live", id: "deny-kafka" },
      { kind: "probes" },
    ],
  },
  {
    slug: "devsecops",
    label: "Sesión 7",
    date: "13 oct 2026",
    title: "DevSecOps: seguridad en el pipeline",
    pdf: "Sesión 7 Sistemas de Comunicación y Seguridad Informática",
    concepts: [
      "Integrar la seguridad en CI/CD con GitHub Actions.",
      "Escaneo de vulnerabilidades y secretos con Trivy.",
      "Romper el build (exit-code 1) ante hallazgos CRITICAL/HIGH.",
    ],
    applied: [
      {
        title: "Pipeline de seguridad en cada push",
        detail:
          "Tres trabajos: escaneo del repositorio (vulnerabilidades, secretos y configuración), escaneo de cada imagen propia (bloquea con CRITICAL/HIGH corregibles) y escaneo informativo de las imágenes de terceros.",
        files: [".github/workflows/seguridad.yml"],
      },
      {
        title: "Cadena de suministro",
        detail:
          "Acciones fijadas por SHA de commit, package-lock en todos los servicios, npm audit con 0 vulnerabilidades e imágenes multietapa sin npm en ejecución.",
        files: [".github/workflows/seguridad.yml", "vm-app/security_dashboard/Dockerfile"],
      },
      {
        title: "Secretos fuera del repositorio",
        detail:
          "Las claves privadas que había en el historial se eliminaron reescribiendo los commits; claves, certificados y .env están ignorados por git.",
        files: [".gitignore"],
      },
    ],
    evidence: [
      { kind: "test", id: "trivy-ci" },
      { kind: "check", id: "containers_hardened" },
    ],
  },
  {
    slug: "pentesting",
    label: "Sesión 8",
    date: "20 oct 2026",
    title: "Pentesting e inyección SQL",
    pdf: "Sesión 8 Pentesting y SQL Injection",
    concepts: [
      "Reconocimiento con nmap: puertos y versiones (-sV).",
      "Búsqueda de vulnerabilidades conocidas con --script vuln.",
      "Inyección SQL: entradas que alteran una consulta construida concatenando texto.",
    ],
    applied: [
      {
        title: "Superficie mínima para el reconocimiento",
        detail:
          "Lo que un nmap -sV vería desde internet está acotado por diseño: el grupo de seguridad de la DMZ solo abre 80 y 443 (80 redirige a HTTPS), Nginx no anuncia su versión y el resto de máquinas no tiene IP pública. El 9443 de los agentes y el SSH solo aceptan grupos del proyecto o la IP de administración.",
        files: ["infra/provision.sh", "vm-app/nginx/default.conf"],
      },
      {
        title: "Versiones sin vulnerabilidades conocidas",
        detail:
          "En lugar de buscarlas desde fuera, el pipeline analiza cada imagen con Trivy en cada push y bloquea el despliegue si aparece una vulnerabilidad CRITICAL/HIGH corregible.",
        files: [".github/workflows/seguridad.yml"],
      },
      {
        title: "Entradas que no se interpretan",
        detail:
          "El sistema no usa SQL; aun así, el login valida tipos y busca el cliente con Object.hasOwn sobre un mapa: un client_id con ' OR '1'='1 es solo texto y recibe 401.",
        files: ["vm-auth/auth-server/server.js"],
      },
    ],
    evidence: [
      { kind: "aws", id: "aws_dmz_world" },
      { kind: "check", id: "ports" },
      { kind: "check", id: "nginx_hardening" },
      { kind: "live", id: "auth-sqli" },
      { kind: "test", id: "trivy-ci" },
    ],
    limits:
      "El panel no ejecuta escaneos ofensivos: muestra la superficie que encontraría un escaneo externo a partir de la configuración real y de los puertos en escucha.",
  },
  {
    slug: "dos-mitigacion",
    label: "Sesión 9 y 10",
    date: "27 oct 2026",
    title: "Denegación de servicio y mitigación",
    pdf: "Sesión 9 y 10 Sistemas de Comunicación y Seguridad Informática",
    concepts: [
      "Simular carga y DoS con ApacheBench (ab -n -c).",
      "Limitar peticiones con limit_req (rate=5r/s burst=10 nodelay) y responder 429.",
      "Limitar conexiones simultáneas y recursos por proceso.",
    ],
    applied: [
      {
        title: "Límite de peticiones en Nginx",
        detail:
          "zona_defensa: 5 peticiones/s por IP con ráfaga de 10 sin retraso, igual que en el laboratorio; 20 conexiones por IP. Los ficheros estáticos de Next.js tienen una zona más amplia para que cargar una página no agote el límite.",
        files: ["vm-app/nginx/default.conf"],
      },
      {
        title: "Límite en el servidor de identidad",
        detail: "20 peticiones por minuto e IP en /token, contra fuerza bruta de credenciales.",
        files: ["vm-auth/auth-server/server.js"],
      },
      {
        title: "Recursos acotados",
        detail:
          "Cada contenedor tiene límite de memoria y de procesos (pids_limit 100) y RabbitMQ tiene umbral de memoria y disco. En el kernel, tcp_syncookies protege contra SYN flood.",
        files: ["vm-app/docker-compose.yml", "vm-data/rabbitmq.conf", "infra/bootstrap-host.sh"],
      },
    ],
    evidence: [
      { kind: "check", id: "nginx_rate_limit" },
      { kind: "check", id: "sysctl_syncookies" },
      { kind: "check", id: "containers_hardened" },
    ],
    limits:
      "El panel no genera carga contra el servidor: comprueba el límite en la configuración efectiva de Nginx (nginx -T) y cuenta las respuestas 429 reales de los últimos 10 minutos.",
  },
  {
    slug: "bastionado",
    label: "3 nov 2026",
    date: "3 nov 2026",
    title: "Bastionado como mitigación de riesgos",
    pdf: "Bastionado como mitigación de riesgos",
    concepts: [
      "Reducir la superficie de ataque: menos servicios, paquetes y puertos.",
      "Parches al día y configuración segura por defecto.",
      "SSH solo con claves, sin root y con intentos limitados.",
      "Ajustes del kernel, auditoría y sincronización de hora.",
    ],
    applied: [
      {
        title: "Sistema base",
        detail:
          "Ubuntu 24.04 actualizado con apt upgrade, snapd purgado, auditd activo en todas las máquinas y fail2ban en el bastión. La hora sale del servicio de AWS (169.254.169.123), que funciona sin internet.",
        files: ["infra/bootstrap-host.sh"],
      },
      {
        title: "SSH bastionado",
        detail:
          "Sin contraseñas ni teclado interactivo, sin root, sin X11 ni agent forwarding, MaxAuthTries 3 y LoginGraceTime 30. Solo el bastión puede abrir SSH hacia las demás máquinas.",
        files: ["infra/bootstrap-host.sh"],
      },
      {
        title: "Kernel",
        detail: "Sin redirecciones ICMP ni ruta de origen, log_martians, syncookies, dmesg restringido y ASLR completo.",
        files: ["infra/bootstrap-host.sh"],
      },
      {
        title: "Nube",
        detail: "IMDSv2 obligatorio (evita robar credenciales por SSRF), discos cifrados y grupo default vacío.",
        files: ["infra/provision.sh"],
      },
      {
        title: "Monitoreo continuo",
        detail:
          "Cada máquina revisa sus controles cada 30 s y envía el resultado por TLS mutuo. Si una máquina deja de reportar, el dashboard la marca como caída a los 90 s.",
        files: ["infra/agent/st-agent.py"],
      },
    ],
    evidence: [
      { kind: "check", id: "patched" },
      { kind: "check", id: "no_reboot" },
      { kind: "check", id: "ssh_no_password" },
      { kind: "check", id: "ssh_no_root" },
      { kind: "check", id: "ssh_maxauth" },
      { kind: "check", id: "sysctl_redirects" },
      { kind: "check", id: "aslr" },
      { kind: "check", id: "auditd" },
      { kind: "check", id: "time_synced" },
      { kind: "check", id: "ports" },
      { kind: "aws", id: "aws_imdsv2" },
      { kind: "aws", id: "aws_bastion_ssh" },
    ],
  },
];

export function classBySlug(slug: string) {
  return CLASSES.find((c) => c.slug === slug);
}
