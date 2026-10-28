import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { usuarioApi } from '@/lib/api';
import { cifrar } from '@/lib/crypto';
import { urlBase } from '@/lib/medios';
import { registrar } from '@/lib/bitacora';
import { PROVEEDORES, type Proveedor } from '@/lib/oauth';
import { completarMeta } from '@/lib/conectores/meta';
import { completarGoogle } from '@/lib/conectores/youtube';
import { completarLinkedIn } from '@/lib/conectores/linkedin';
import { completarX } from '@/lib/conectores/x';
import { sincronizarCuenta } from '@/lib/sincronizador';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Nueva = {
  red: string;
  nombre: string;
  usuario: string | null;
  idExterno: string;
  token: string;
  refresh?: string | null;
  expira?: Date | null;
  datos?: Record<string, unknown>;
};

export async function GET(req: Request, { params }: { params: Promise<{ proveedor: string }> }) {
  const { proveedor } = await params;
  const volver = (q: string) => NextResponse.redirect(new URL(`/cuentas?${q}`, urlBase()));
  if (!(proveedor in PROVEEDORES)) return volver('error=proveedor');
  const p = proveedor as Proveedor;
  const u = await usuarioApi('gestionar_cuentas');
  if (!u) return volver('error=permiso');

  const url = new URL(req.url);
  const estado = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code');
  const [e] = await sql`
    delete from estados_oauth where estado = ${estado} and usuario_id = ${u.id} and red = ${p}
      and creado_en > now() - interval '15 minutes'
    returning verificador
  `;
  if (!e) return volver('error=estado');
  if (!code) return volver(`error=cancelado&p=${p}`);

  const retorno = `${urlBase()}/api/oauth/${p}/retorno`;
  let nuevas: Nueva[];
  try {
    nuevas =
      p === 'meta'
        ? await completarMeta(code, retorno)
        : p === 'google'
          ? [await completarGoogle(code, retorno)]
          : p === 'linkedin'
            ? await completarLinkedIn(code, retorno)
            : [await completarX(code, retorno, e.verificador)];
  } catch (err) {
    await registrar(u.id, 'cuenta.conexion_fallida', 'proveedor', p, { error: (err as Error).message });
    return volver(`error=conexion&p=${p}&m=${encodeURIComponent((err as Error).message.slice(0, 300))}`);
  }

  const ids: string[] = [];
  for (const n of nuevas) {
    // Al conectar una cuenta real se retiran las de demostración de esa red.
    await sql`delete from cuentas_sociales where red = ${n.red} and modo = 'demo'`;
    const [c] = await sql`
      insert into cuentas_sociales (red, nombre, usuario_red, id_externo, modo, token_cifrado, refresh_cifrado, token_expira_en, datos, estado, conectada_por)
      values (${n.red}, ${n.nombre}, ${n.usuario}, ${n.idExterno}, 'real', ${cifrar(n.token)}, ${n.refresh ? cifrar(n.refresh) : null},
        ${n.expira ?? null}, ${sql.json((n.datos ?? {}) as never)}, 'activa', ${u.id})
      on conflict (red, coalesce(id_externo, nombre)) do update set
        nombre = excluded.nombre, usuario_red = excluded.usuario_red, modo = 'real', token_cifrado = excluded.token_cifrado,
        refresh_cifrado = coalesce(excluded.refresh_cifrado, cuentas_sociales.refresh_cifrado),
        token_expira_en = excluded.token_expira_en, datos = excluded.datos, estado = 'activa', ultimo_error = null,
        conectada_por = excluded.conectada_por, conectada_en = now()
      returning id
    `;
    ids.push(c.id);
    await registrar(u.id, 'cuenta.conectada', 'cuenta', c.id, { red: n.red, nombre: n.nombre });
  }
  // Primera sincronización (lo que no alcance a cargar se completa en la siguiente).
  for (const id of ids) {
    try {
      await sincronizarCuenta(id);
    } catch {}
  }
  return volver(`conectadas=${ids.length}&p=${p}`);
}
