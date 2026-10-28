import 'server-only';
import { createHmac, randomBytes } from 'node:crypto';

// TOTP según RFC 6238 (SHA-1, 6 dígitos, 30 s), compatible con Google Authenticator,
// Microsoft Authenticator, Authy y similares.

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Codificar(buf: Buffer): string {
  let bits = 0;
  let valor = 0;
  let salida = '';
  for (const byte of buf) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) salida += ALFABETO[(valor << (5 - bits)) & 31];
  return salida;
}

export function base32Decodificar(texto: string): Buffer {
  const limpio = texto.replace(/=+$/, '').toUpperCase().replace(/\s/g, '');
  let bits = 0;
  let valor = 0;
  const salida: number[] = [];
  for (const ch of limpio) {
    const i = ALFABETO.indexOf(ch);
    if (i < 0) throw new Error('Secreto base32 inválido');
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      salida.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(salida);
}

export function generarSecreto(): string {
  return base32Codificar(randomBytes(20));
}

function codigoParaPaso(secreto: Buffer, paso: number): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(paso));
  const h = createHmac('sha1', secreto).update(contador).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return (n % 1_000_000).toString().padStart(6, '0');
}

/**
 * Verifica un código y devuelve el paso de tiempo usado (para impedir que el mismo
 * código se reutilice) o null si no es válido. Acepta ±1 paso por desfase de reloj.
 */
export function verificarCodigo(secretoB32: string, codigo: string, ultimoPaso: number): number | null {
  if (!/^\d{6}$/.test(codigo)) return null;
  const secreto = base32Decodificar(secretoB32);
  const ahora = Math.floor(Date.now() / 1000 / 30);
  for (const delta of [0, -1, 1]) {
    const paso = ahora + delta;
    if (paso <= ultimoPaso) continue;
    if (codigoParaPaso(secreto, paso) === codigo) return paso;
  }
  return null;
}

/** Solo para pruebas automatizadas. */
export function codigoActual(secretoB32: string): string {
  return codigoParaPaso(base32Decodificar(secretoB32), Math.floor(Date.now() / 1000 / 30));
}

export function uriOtpauth(secreto: string, email: string): string {
  const emisor = 'Redes Filosofía UNAL';
  const etiqueta = encodeURIComponent(`${emisor}:${email}`);
  return `otpauth://totp/${etiqueta}?secret=${secreto}&issuer=${encodeURIComponent(emisor)}&algorithm=SHA1&digits=6&period=30`;
}
