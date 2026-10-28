import 'server-only';
import { hash, verify } from '@node-rs/argon2';

// Argon2id con parámetros recomendados por OWASP (19 MiB, 2 iteraciones).
const OPCIONES = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPCIONES);
}

export async function verificarPassword(hashGuardado: string, password: string): Promise<boolean> {
  try {
    return await verify(hashGuardado, password);
  } catch {
    return false;
  }
}

/** Hash fijo para igualar el tiempo de respuesta cuando el correo no existe. */
let hashSenuelo: Promise<string> | null = null;
export async function verificarSenuelo(password: string) {
  hashSenuelo ??= hash('contraseña-señuelo-que-nunca-coincide', OPCIONES);
  await verificarPassword(await hashSenuelo, password);
}

const COMUNES = [
  'password', 'contraseña', '123456', 'qwerty', 'filosofia', 'unal', 'universidad', 'colombia',
  'bogota', 'admin', 'letmein', 'welcome', 'iloveyou', '000000', '111111', 'abc123',
];

/** Devuelve el problema de la contraseña o null si cumple la política. */
export function problemaPassword(password: string, email?: string, nombre?: string): string | null {
  if (password.length < 12) return 'Debe tener al menos 12 caracteres.';
  if (password.length > 128) return 'Debe tener como máximo 128 caracteres.';
  const clases = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (clases < 3) return 'Combina al menos tres de estos: minúsculas, mayúsculas, números y símbolos.';
  const baja = password.toLowerCase();
  if (COMUNES.some((c) => baja.includes(c) && c.length >= 6 && baja.length - c.length < 6)) {
    return 'Es demasiado parecida a una contraseña común.';
  }
  const local = email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && baja.includes(local)) return 'No puede contener tu usuario de correo.';
  const partes = (nombre ?? '').toLowerCase().split(/\s+/).filter((p) => p.length >= 4);
  if (partes.some((p) => baja.includes(p))) return 'No puede contener tu nombre.';
  if (/(.)\1{3,}/.test(password)) return 'No repitas el mismo carácter cuatro veces seguidas.';
  return null;
}
