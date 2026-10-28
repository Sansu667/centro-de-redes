import 'server-only';
import { sql } from './db';
import { cifrar, descifrar } from './crypto';
import { generarSecreto } from './totp';

/** Crea el secreto pendiente de confirmar (no activa la verificación todavía). */
export async function secretoPendiente(usuarioId: string): Promise<string> {
  const [u] = await sql`select totp_secret_cifrado, totp_activo from usuarios where id = ${usuarioId}`;
  if (u.totp_secret_cifrado && !u.totp_activo) return descifrar(u.totp_secret_cifrado);
  const secreto = generarSecreto();
  await sql`update usuarios set totp_secret_cifrado = ${cifrar(secreto)}, totp_activo = false, totp_ultimo_paso = 0 where id = ${usuarioId}`;
  return secreto;
}

