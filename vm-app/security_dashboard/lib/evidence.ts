import fs from "node:fs";
import path from "node:path";
import type { TestsFile } from "./types";

// Evidencias que se generan desde el equipo de administracion y se copian a app-ec2:
//   tests.json -> infra/collect-ci.sh (resultado del pipeline de GitHub Actions + Trivy)
//   aws.json   -> infra/collect-aws.sh (inventario real de la cuenta)

const EVIDENCE_DIR = process.env.EVIDENCE_DIR ?? "/evidence";

function readJson<T>(name: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(/*turbopackIgnore: true*/ EVIDENCE_DIR, name), "utf8")) as T;
  } catch {
    return null;
  }
}

export function testsFile(): TestsFile | null {
  return readJson<TestsFile>("tests.json");
}


export type SgRule = { direction: "entrada" | "salida"; protocol: string; ports: string; peer: string; description: string };
export type AwsInventory = {
  generated_at: string;
  account_region: string;
  vpc: { id: string; cidr: string };
  subnets: { name: string; id: string; cidr: string; public: boolean; route: string }[];
  instances: {
    name: string; id: string; type: string; vcpu: number; state: string; private_ip: string; public_ip: string | null;
    subnet: string; imdsv2: boolean; ebs: { size: number; type: string; encrypted: boolean }[]; groups: string[];
    launch_time: string;
  }[];
  security_groups: { name: string; id: string; description: string; rules: SgRule[] }[];
  nat_gateways: { id: string; state: string }[];
  internet_gateway: string | null;
};

export function awsInventory(): AwsInventory | null {
  return readJson<AwsInventory>("aws.json");
}

export type AwsCheck = { id: string; label: string; ok: boolean; detail: string };

export function awsChecks(inv: AwsInventory | null): AwsCheck[] {
  if (!inv) return [];
  const running = inv.instances.filter((i) => i.state === "running");
  const priv = inv.instances.filter((i) => !["bastion-ec2", "app-ec2"].includes(i.name));
  const defaultSg = inv.security_groups.find((g) => g.name === "default");
  const bastion = inv.security_groups.find((g) => g.name === "st-bastion");
  const bastionSsh = bastion?.rules.filter((r) => r.direction === "entrada") ?? [];
  const app = inv.security_groups.find((g) => g.name === "st-app");
  const worldIn = (app?.rules ?? []).filter((r) => r.direction === "entrada" && r.peer === "0.0.0.0/0");
  const vcpus = inv.instances.reduce((s, i) => s + i.vcpu, 0);
  return [
    {
      id: "aws_imdsv2", label: "IMDSv2 obligatorio (metadatos con token)",
      ok: inv.instances.every((i) => i.imdsv2), detail: `${inv.instances.filter((i) => i.imdsv2).length}/${inv.instances.length} instancias`,
    },
    {
      id: "aws_ebs_encrypted", label: "Discos EBS cifrados",
      ok: inv.instances.every((i) => i.ebs.every((v) => v.encrypted)),
      detail: `${inv.instances.flatMap((i) => i.ebs).filter((v) => v.encrypted).length} volúmenes gp3 cifrados con KMS`,
    },
    {
      id: "aws_private", label: "Zonas internas sin IP pública",
      ok: priv.every((i) => !i.public_ip), detail: priv.map((i) => `${i.name}: ${i.public_ip ?? "sin IP pública"}`).join(" · "),
    },
    {
      id: "aws_no_nat", label: "Sin NAT: las zonas internas no salen a internet",
      ok: inv.nat_gateways.filter((n) => n.state !== "deleted").length === 0,
      detail: inv.nat_gateways.length ? inv.nat_gateways.map((n) => `${n.id} ${n.state}`).join(", ") : "ningún NAT Gateway",
    },
    {
      id: "aws_default_sg", label: "Grupo «default» sin reglas",
      ok: (defaultSg?.rules.length ?? 0) === 0, detail: `${defaultSg?.rules.length ?? 0} reglas`,
    },
    {
      id: "aws_bastion_ssh", label: "SSH del bastión limitado a una IP /32",
      ok: bastionSsh.length > 0 && bastionSsh.every((r) => r.peer.endsWith("/32")),
      detail: bastionSsh.map((r) => `${r.ports} desde una IP /32`).join(", ") || "sin reglas",
    },
    {
      id: "aws_dmz_world", label: "Desde internet solo 80 y 443 hacia la DMZ",
      ok: worldIn.every((r) => ["80", "443"].includes(r.ports)) && worldIn.length > 0,
      detail: worldIn.map((r) => `tcp/${r.ports}`).join(", "),
    },
    {
      id: "aws_vcpu", label: "Dentro del plan gratuito (8 vCPU)",
      ok: vcpus <= 8, detail: `${vcpus} vCPU en ${running.length} instancias en ejecución`,
    },
  ];
}
