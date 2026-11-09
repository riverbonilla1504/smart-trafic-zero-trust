"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; hint?: string };

export function Nav({ items, classes }: { items: NavItem[]; classes: NavItem[] }) {
  const pathname = usePathname();
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav className="nav" aria-label="Secciones">
      <ul>
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} prefetch={false} className={active(item.href) ? "active" : undefined} aria-current={active(item.href) ? "page" : undefined}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      <div className="nav-group">Clases aplicadas</div>
      <ul>
        {classes.map((item) => (
          <li key={item.href}>
            <Link href={item.href} prefetch={false} className={pathname === item.href ? "active" : undefined}>
              <span className="nav-hint">{item.hint}</span>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
