import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { usuarioApi } from '@/lib/api';
import { tokenAleatorio } from '@/lib/crypto';
import { urlBase } from '@/lib/medios';
import { configurado, PROVEEDORES, type Proveedor } from '@/lib/oauth';
import { urlAutorizacionMeta } from '@/lib/conectores/meta';
import { urlAutorizacionGoogle } from '@/lib/conectores/youtube';
import { urlAutorizacionLinkedIn } from '@/lib/conectores/linkedin';
import { urlAutorizacionX } from '@/lib/conectores/x';

export const runtime = 'nodejs';

export async function GET(_: Request, { params }: { params: Promise<{ proveedor: string }> }) {
  const { proveedor } = await params;
  if (!(proveedor in PROVEEDORES)) return new Response('Proveedor desconocido', { status: 404 });
  const p = proveedor as Proveedor;
  const u = await usuarioApi('gestionar_cuentas');
  if (!u) return NextResponse.redirect(new URL('/cuentas?error=permiso', urlBase()));
  if (!configurado(p)) return NextResponse.redirect(new URL(`/cuentas?error=sin_credenciales&p=${p}`, urlBase()));

  const estado = tokenAleatorio(24);
  const verificador = tokenAleatorio(48);
  await sql`delete from estados_oauth where creado_en < now() - interval '1 hour'`;
  await sql`insert into estados_oauth (estado, usuario_id, red, verificador) values (${estado}, ${u.id}, ${p}, ${verificador})`;
  const retorno = `${urlBase()}/api/oauth/${p}/retorno`;
  const destino =
    p === 'meta'
      ? urlAutorizacionMeta(estado, retorno)
      : p === 'google'
        ? urlAutorizacionGoogle(estado, retorno)
        : p === 'linkedin'
          ? urlAutorizacionLinkedIn(estado, retorno)
          : urlAutorizacionX(estado, retorno, verificador);
  return NextResponse.redirect(destino);
}
