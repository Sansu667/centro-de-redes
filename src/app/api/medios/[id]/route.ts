import { sql } from '@/lib/db';
import { obtenerSesion } from '@/lib/auth';
import { firmaValida } from '@/lib/medios';

export const runtime = 'nodejs';

/** Sirve archivos guardados en la base: con sesión iniciada, o con una URL firmada temporal (para las redes). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('No encontrado', { status: 404 });
  const u = new URL(req.url);
  const firmada = firmaValida(id, u.searchParams.get('e'), u.searchParams.get('f'));
  if (!firmada) {
    const s = await obtenerSesion();
    if (!s?.mfa_verificado) return new Response('No autorizado', { status: 401 });
  }
  const [f] = await sql`select mime, datos, nombre, tamano from archivos where id = ${id} and almacen = 'db'`;
  if (!f) return new Response('No encontrado', { status: 404 });
  return new Response(new Uint8Array(f.datos), {
    headers: {
      'Content-Type': f.mime,
      'Content-Length': String(f.tamano),
      'Content-Disposition': `inline; filename="${encodeURIComponent(f.nombre)}"`,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
