import 'server-only';
import { headers } from 'next/headers';
import { sql } from './db';

export async function ipCliente(): Promise<string> {
  const h = await headers();
  // En Vercel, x-forwarded-for lo fija la plataforma; el primer valor es el cliente.
  const xff = h.get('x-forwarded-for');
  return (xff?.split(',')[0] ?? h.get('x-real-ip') ?? 'desconocida').trim().slice(0, 64);
}

export async function agenteCliente(): Promise<string> {
  return ((await headers()).get('user-agent') ?? '').slice(0, 300);
}

export async function registrar(
  usuarioId: string | null,
  accion: string,
  entidad?: string | null,
  entidadId?: string | null,
  detalles: Record<string, unknown> = {},
) {
  const ip = await ipCliente().catch(() => null);
  await sql`
    insert into bitacora (usuario_id, accion, entidad, entidad_id, detalles, ip)
    values (${usuarioId}, ${accion}, ${entidad ?? null}, ${entidadId ?? null}, ${sql.json(detalles as never)}, ${ip})
  `;
}
