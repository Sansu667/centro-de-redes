import Link from 'next/link';
import { PERIODOS } from '@/lib/estadisticas';

export function SelectorPeriodo({ actual, ruta }: { actual: number; ruta: string }) {
  return (
    <nav className="segmentado" aria-label="Periodo">
      {PERIODOS.map((p) => (
        <Link key={p} href={`${ruta}?periodo=${p}`} aria-current={p === actual ? 'true' : undefined} scroll={false}>
          {p} días
        </Link>
      ))}
    </nav>
  );
}
