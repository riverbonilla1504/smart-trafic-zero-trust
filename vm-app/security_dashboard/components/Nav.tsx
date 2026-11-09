"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; hint?: string };

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

// Pestañas numeradas con subrayado, como los pasos del modernizador de Excel.
export function Nav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="tabs" aria-label="Secciones">
      <ol>
        {items.map((item, i) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link href={item.href} prefetch={false} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
                <span className="tab-num">{i + 1}</span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// Submenú de clases en forma de chips.
export function ClassChips({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="chips" aria-label="Clases">
      <Link href="/clases" prefetch={false} className={`chip ${pathname === "/clases" ? "active" : ""}`}>
        Todas
      </Link>
      {items.map((item) => (
        <Link key={item.href} href={item.href} prefetch={false} className={`chip ${pathname === item.href ? "active" : ""}`}>
          <span className="chip-hint">{item.hint}</span>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
