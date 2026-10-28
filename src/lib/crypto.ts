import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Clave AES-256 para cifrar tokens de redes y secretos 2FA en la base de datos. */
function clave(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('Falta ENCRYPTION_KEY (32 bytes en base64)');
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new Error('ENCRYPTION_KEY debe ser de 32 bytes en base64');
  return k;
}

/** Cifra con AES-256-GCM. Formato: v1.<iv>.<tag>.<datos> en base64url. */
export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', clave(), iv);
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), datos.toString('base64url')].join('.');
}

export function descifrar(valor: string): string {
  const [v, iv, tag, datos] = valor.split('.');
  if (v !== 'v1' || !iv || !tag || !datos) throw new Error('Formato cifrado no reconocido');
  const d = createDecipheriv('aes-256-gcm', clave(), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(datos, 'base64url')), d.final()]).toString('utf8');
}

export function sha256(texto: string): string {
  return createHash('sha256').update(texto).digest('hex');
}

export function tokenAleatorio(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function igualSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
