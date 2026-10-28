'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavEnlace({ href, children, exacto = false }: { href: string; children: React.ReactNode; exacto?: boolean }) {
  const ruta = usePathname();
  const activo = exacto ? ruta === href : ruta === href || ruta.startsWith(href + '/');
  return (
    <Link href={href} className="nav-enlace" aria-current={activo ? 'page' : undefined}>
      {children}
    </Link>
  );
}
