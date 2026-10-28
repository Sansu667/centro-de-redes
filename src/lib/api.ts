import 'server-only';
import { NextResponse } from 'next/server';
import { usuarioParaAccion } from './auth';
import type { Permiso } from './roles';

/** Rechaza peticiones que no vienen de la propia app (protección CSRF para rutas API). */
export function mismoOrigen(req: Request): boolean {
  const origen = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!origen || !host) return false;
  try {
    return new URL(origen).host === host;
  } catch {
    return false;
  }
}

export async function usuarioApi(permiso: Permiso) {
  try {
    return await usuarioParaAccion(permiso);
  } catch {
    return null;
  }
}

export const prohibido = (msg = 'No autorizado') => NextResponse.json({ error: msg }, { status: 403 });
export const malo = (msg: string) => NextResponse.json({ error: msg }, { status: 400 });
