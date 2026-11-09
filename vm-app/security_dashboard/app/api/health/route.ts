import { connection } from "next/server";
import { summary } from "@/lib/store";

// Health check del contenedor y de Nginx. No expone datos de las maquinas.
export async function GET() {
  await connection();
  const s = summary();
  return Response.json({ status: "ok", agents_online: s.online, agents_total: s.total });
}
