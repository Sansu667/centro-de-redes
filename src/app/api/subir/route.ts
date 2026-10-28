import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { sql } from '@/lib/db';
import { malo, mismoOrigen, prohibido, usuarioApi } from '@/lib/api';
import { MAX_EN_BASE, MAX_IMAGEN, MAX_VIDEO, TIPOS_PERMITIDOS, mimeReal, usaBlob } from '@/lib/medios';
import { registrar } from '@/lib/bitacora';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const tipo = req.headers.get('content-type') ?? '';

  // Modo Vercel Blob: el navegador sube el archivo directo al almacenamiento con un token de un solo uso.
  if (tipo.includes('application/json')) {
    if (!usaBlob()) return malo('El almacenamiento de archivos no está configurado.');
    const body = (await req.json()) as HandleUploadBody;
    if (body.type === 'blob.generate-client-token') {
      if (!mismoOrigen(req)) return prohibido();
      const u = await usuarioApi('crear_publicacion');
      if (!u) return prohibido('Tu sesión terminó o tu rol no permite subir archivos.');
      try {
        const r = await handleUpload({
          body,
          request: req,
          onBeforeGenerateToken: async (pathname) => {
            if (!pathname.startsWith(`medios/${u.id}/`)) throw new Error('Ruta de archivo no permitida');
            return {
              allowedContentTypes: TIPOS_PERMITIDOS,
              maximumSizeInBytes: MAX_VIDEO,
              addRandomSuffix: true,
              validUntil: Date.now() + 15 * 60_000,
            };
          },
        });
        return NextResponse.json(r);
      } catch (e) {
        return malo((e as Error).message);
      }
    }
    // Aviso de Vercel Blob al terminar la subida: el registro lo hace /api/archivos.
    try {
      return NextResponse.json(await handleUpload({ body, request: req, onBeforeGenerateToken: async () => ({}), onUploadCompleted: async () => {} }));
    } catch (e) {
      return malo((e as Error).message);
    }
  }

  // Modo base de datos (sin Vercel Blob): archivos pequeños guardados en Postgres.
  if (!mismoOrigen(req)) return prohibido();
  const u = await usuarioApi('crear_publicacion');
  if (!u) return prohibido('Tu sesión terminó o tu rol no permite subir archivos.');
  const form = await req.formData().catch(() => null);
  const archivo = form?.get('archivo');
  if (!(archivo instanceof File)) return malo('No llegó ningún archivo.');
  if (archivo.size > MAX_EN_BASE) {
    return malo(`Sin Vercel Blob el límite es ${MAX_EN_BASE / 1024 / 1024} MB por archivo. Configura Vercel Blob para subir videos.`);
  }
  const datos = Buffer.from(await archivo.arrayBuffer());
  const mime = mimeReal(datos);
  if (!mime || !TIPOS_PERMITIDOS.includes(mime)) return malo('Solo se aceptan imágenes JPG, PNG, WEBP o GIF y videos MP4 o MOV.');
  if (mime.startsWith('image/') && datos.length > MAX_IMAGEN) return malo('La imagen pesa más de 8 MB.');
  const nombre = archivo.name.replace(/[^\p{L}\p{N}._ -]/gu, '').slice(0, 120) || 'archivo';
  const [f] = await sql`
    insert into archivos (nombre, mime, tamano, datos, almacen, subido_por)
    values (${nombre}, ${mime}, ${datos.length}, ${datos}, 'db', ${u.id}) returning id
  `;
  await registrar(u.id, 'archivo.subido', 'archivo', f.id, { nombre, mime, tamano: datos.length });
  return NextResponse.json({ id: f.id, url: `/api/medios/${f.id}`, mime, nombre, tamano: datos.length });
}
