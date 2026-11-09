import Link from "next/link";

export default function NotFound() {
  return (
    <div className="empty">
      Página no encontrada. <Link href="/" prefetch={false}>Volver al resumen</Link>
    </div>
  );
}
