import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { obtenerSesion } from '@/lib/auth';
import { MarcoIngreso } from '@/components/MarcoIngreso';
import { FormIngreso } from '@/components/Formularios';
import { ingresar } from './acciones';

export const metadata = { title: 'Ingresar' };

export default async function Ingresar({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const s = await obtenerSesion();
  if (s?.mfa_verificado) redirect('/panel');
  const [{ n }] = await sql`select count(*)::int as n from usuarios`;
  const q = await searchParams;
  return (
    <MarcoIngreso>
      <h2>Ingresar</h2>
      <p>Usa el correo con el que te registró el administrador.</p>
      {n === 0 ? (
        <div className="aviso-caja info">
          <span>
            Todavía no hay usuarios. <Link href="/configuracion-inicial">Crea la cuenta de administrador</Link>.
          </span>
        </div>
      ) : (
        <FormIngreso
          accion={ingresar}
          aviso={q.bloqueada ? 'Por seguridad, la cuenta quedó bloqueada 15 minutos tras varios códigos incorrectos.' : undefined}
        />
      )}
    </MarcoIngreso>
  );
}
