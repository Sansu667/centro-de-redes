import 'server-only';
import { createHmac } from 'node:crypto';
import { sql } from './db';
import { igualSeguro } from './crypto';

export const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime'];
export const MAX_IMAGEN = 8 * 1024 * 1024; // 8 MB
export const MAX_VIDEO = 500 * 1024 * 1024; // 500 MB (solo con Vercel Blob)
export const MAX_EN_BASE = 4 * 1024 * 1024; // 4 MB cuando no hay Vercel Blob

export const usaBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export function urlBase(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return 'http://localhost:3000';
}

function firma(id: string, expira: number) {
  const k = process.env.ENCRYPTION_KEY ?? '';
  return createHmac('sha256', k).update(`medio:${id}:${expira}`).digest('base64url');
}

/**
 * URL pública y temporal (1 hora) de un archivo guardado en la base de datos.
 * Las redes la necesitan para descargar la imagen o el video al publicar.
 */
export function urlFirmada(id: string, horas = 1): string {
  const expira = Math.floor(Date.now() / 1000) + horas * 3600;
  return `${urlBase()}/api/medios/${id}?e=${expira}&f=${firma(id, expira)}`;
}

export function firmaValida(id: string, e: string | null, f: string | null): boolean {
  if (!e || !f) return false;
  const exp = Number(e);
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  return igualSeguro(firma(id, exp), f);
}

export type Medio = { id: string; nombre: string; mime: string; tamano: number; url: string; urlInterna: string };

export async function mediosDe(publicacionId: string): Promise<Medio[]> {
  const filas = await sql`
    select id, nombre, mime, tamano, url, almacen from archivos
    where publicacion_id = ${publicacionId} order by posicion, creado_en
  `;
  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    mime: f.mime,
    tamano: f.tamano,
    url: f.almacen === 'blob' ? f.url : urlFirmada(f.id, 2),
    urlInterna: f.almacen === 'blob' ? f.url : `/api/medios/${f.id}`,
  }));
}

/** Comprueba la firma real del archivo (no solo la extensión que declara el navegador). */
export function mimeReal(buf: Buffer): string | null {
  const h = buf.subarray(0, 16);
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return 'image/jpeg';
  if (h.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (h.subarray(0, 4).toString('ascii') === 'RIFF' && h.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (h.subarray(0, 3).toString('ascii') === 'GIF') return 'image/gif';
  if (h.subarray(4, 8).toString('ascii') === 'ftyp') {
    const marca = h.subarray(8, 12).toString('ascii');
    return marca === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  }
  return null;
}
