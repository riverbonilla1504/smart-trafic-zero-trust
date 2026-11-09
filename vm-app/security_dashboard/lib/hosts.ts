// Inventario fijo de la arquitectura (coincide con infra/provision.sh).

export type HostMeta = {
  id: string;
  name: string;
  ip: string;
  subnet: string;
  zone: string;
  type: string;
  vcpu: number;
  ramGb: number;
  diskGb: number;
  publicIp: boolean;
  role: string;
  services: string[];
  sg: string;
};

export const HOSTS: HostMeta[] = [
  {
    id: "bastion", name: "bastion-ec2", ip: "10.0.0.10", subnet: "10.0.0.0/24", zone: "Administración",
    type: "t3.micro", vcpu: 1, ramGb: 1, diskGb: 8, publicIp: true, sg: "st-bastion",
    role: "Único punto de entrada SSH. Salta a las demás máquinas; no ejecuta servicios de la aplicación.",
    services: ["OpenSSH", "fail2ban"],
  },
  {
    id: "app", name: "app-ec2", ip: "10.0.1.10", subnet: "10.0.1.0/24", zone: "DMZ",
    type: "t3.small", vcpu: 2, ramGb: 2, diskGb: 16, publicIp: true, sg: "st-app",
    role: "Zona desmilitarizada: Nginx publica el dashboard y recibe los reportes de los agentes.",
    services: ["nginx", "security_dashboard", "alert_dispatcher", "user_dashboard_backend", "query_client"],
  },
  {
    id: "auth", name: "auth-ec2", ip: "10.0.2.10", subnet: "10.0.2.0/24", zone: "Identidad",
    type: "t3.micro", vcpu: 1, ramGb: 1, diskGb: 12, publicIp: false, sg: "st-auth",
    role: "Emite tokens JWT RS256 a clientes autenticados. Es la única que tiene la clave privada.",
    services: ["auth-server"],
  },
  {
    id: "ingest", name: "ingest-ec2", ip: "10.0.3.10", subnet: "10.0.3.0/24", zone: "Ingesta",
    type: "t3.micro", vcpu: 1, ramGb: 1, diskGb: 12, publicIp: false, sg: "st-ingest",
    role: "Simula los sensores de tráfico: pide token y publica eventos firmados en Kafka.",
    services: ["traffic_sensor_simulator"],
  },
  {
    id: "core", name: "core-ec2", ip: "10.0.4.10", subnet: "10.0.4.0/24", zone: "Procesamiento",
    type: "t3.micro", vcpu: 1, ramGb: 1, diskGb: 12, publicIp: false, sg: "st-core",
    role: "Verifica cada token con la clave pública, calcula la congestión y publica en RabbitMQ.",
    services: ["traffic_density_processor"],
  },
  {
    id: "data", name: "data-ec2", ip: "10.0.5.10", subnet: "10.0.5.0/24", zone: "Datos",
    type: "t3.small", vcpu: 2, ramGb: 2, diskGb: 30, publicIp: false, sg: "st-data",
    role: "Mensajería: Kafka con TLS mutuo para la ingesta y RabbitMQ con AMQPS para las alertas.",
    services: ["kafka", "rabbitmq"],
  },
];

export const HOST_IDS = HOSTS.map((h) => h.id);

export function hostMeta(id: string): HostMeta | undefined {
  return HOSTS.find((h) => h.id === id);
}

export function hostByIp(ip: string): HostMeta | undefined {
  return HOSTS.find((h) => h.ip === ip);
}
