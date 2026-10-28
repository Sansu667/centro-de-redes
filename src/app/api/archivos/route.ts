import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { malo, mismoOrigen, prohibido, usuarioApi } from '@/lib/api';
import { MAX_IMAGEN, TIPOS_PERMITIDOS, usaBlob } from '@/lib/medios';
import { registrar } from '@/lib/bitacora';

export const runtime = 'nodejs';

const esquema = z.object({ url: z.string().url().max(1000), nombre: z.string().max(200) });

/** Registra en la base de datos un archivo que el navegador acaba de subir a Vercel Blob. */
export async function POST(req: Request) {
  if (!mismoOrigen(req)) return prohibido();
  const u = await usuarioApi('crear_publicacion');
  if (!u) return prohibido();
  if (!usaBlob()) return malo('Vercel Blob no está configurado.');
  const d = esquema.safeParse(await req.json().catch(() => null));
  if (!d.success) return malo('Datos inválidos.');
  const url = new URL(d.data.url);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.public.blob.vercel-storage.com')) return malo('El archivo no está en el almacenamiento de la app.');
  if (!url.pathname.startsWith(`/medios/${u.id}/`)) return prohibido('El archivo no te pertenece.');
  const cab = await fetch(url, { method: 'HEAD' });
  if (!cab.ok) return malo('No se encontró el archivo subido.');
  const mime = (cab.headers.get('content-type') ?? '').split(';')[0];
  const tamano = Number(cab.headers.get('content-length') ?? 0);
  if (!TIPOS_PERMITIDOS.includes(mime)) return malo('Tipo de archivo no permitido.');
  if (mime.startsWith('image/') && tamano > MAX_IMAGEN) return malo('La imagen pesa más de 8 MB.');
  const nombre = d.data.nombre.replace(/[^\p{L}\p{N}._ -]/gu, '').slice(0, 120) || 'archivo';
  const [f] = await sql`
    insert into archivos (nombre, mime, tamano, url, almacen, subido_por)
    values (${nombre}, ${mime}, ${tamano}, ${url.toString()}, 'blob', ${u.id}) returning id
  `;
  await registrar(u.id, 'archivo.subido', 'archivo', f.id, { nombre, mime, tamano });
  return NextResponse.json({ id: f.id, url: url.toString(), mime, nombre, tamano });
}
