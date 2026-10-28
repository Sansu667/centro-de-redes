'use server';

import { randomInt } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db';
import { cerrarOtrasSesiones, obtenerSesion } from '@/lib/auth';
import { hashPassword, problemaPassword, verificarPassword } from '@/lib/password';
import { descifrar, sha256 } from '@/lib/crypto';
import { verificarCodigo } from '@/lib/totp';
import { registrar } from '@/lib/bitacora';
import { fallarCuenta } from '@/lib/limites';

export type EstadoCuenta = { error?: string; ok?: string; codigos?: string[] } | undefined;

async function sesionCompleta() {
  const s = await obtenerSesion();
  if (!s || !s.mfa_verificado) redirect('/ingresar');
  return s;
}

export async function cambiarClave(_: EstadoCuenta, form: FormData): Promise<EstadoCuenta> {
  const s = await sesionCompleta();
  const actual = String(form.get('actual') ?? '');
  const nueva = String(form.get('nueva') ?? '');
  const confirmacion = String(form.get('confirmacion') ?? '');
  const [u] = await sql`select password_hash, email, nombre, debe_cambiar_password from usuarios where id = ${s.usuario.id}`;
  if (!(await verificarPassword(u.password_hash, actual))) {
    await fallarCuenta(s.usuario.id);
    return { error: 'La contraseña actual no es correcta.' };
  }
  if (nueva !== confirmacion) return { error: 'La nueva contraseña y su confirmación no coinciden.' };
  if (nueva === actual) return { error: 'La nueva contraseña debe ser distinta de la actual.' };
  const p = problemaPassword(nueva, u.email, u.nombre);
  if (p) return { error: p };
  await sql`update usuarios set password_hash = ${await hashPassword(nueva)}, debe_cambiar_password = false, password_cambiada_en = now() where id = ${s.usuario.id}`;
  await cerrarOtrasSesiones(s.usuario.id, s.id);
  await registrar(s.usuario.id, 'seguridad.clave_cambiada', 'usuario', s.usuario.id);
  if (u.debe_cambiar_password) redirect('/panel');
  revalidatePath('/cuenta');
  return { ok: 'Contraseña actualizada. Se cerraron tus sesiones en otros dispositivos.' };
}

export async function nuevosCodigos(_: EstadoCuenta, form: FormData): Promise<EstadoCuenta> {
  const s = await sesionCompleta();
  const codigo = String(form.get('codigo') ?? '').trim();
  const [u] = await sql`select totp_secret_cifrado, totp_ultimo_paso from usuarios where id = ${s.usuario.id}`;
  const paso = u.totp_secret_cifrado ? verificarCodigo(descifrar(u.totp_secret_cifrado), codigo, Number(u.totp_ultimo_paso)) : null;
  if (paso === null) {
    await fallarCuenta(s.usuario.id);
    return { error: 'El código de tu app de autenticación no es válido.' };
  }
  await sql`update usuarios set totp_ultimo_paso = ${paso} where id = ${s.usuario.id}`;
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const codigos = Array.from({ length: 10 }, () => {
    let c = '';
    while (c.length < 8) c += alfabeto[randomInt(alfabeto.length)];
    return `${c.slice(0, 4)}-${c.slice(4)}`;
  });
  await sql.begin(async (tx) => {
    await tx`delete from codigos_recuperacion where usuario_id = ${s.usuario.id}`;
    for (const c of codigos) await tx`insert into codigos_recuperacion (usuario_id, codigo_hash) values (${s.usuario.id}, ${sha256(c.replace('-', ''))})`;
  });
  await registrar(s.usuario.id, 'seguridad.codigos_regenerados', 'usuario', s.usuario.id);
  return { codigos };
}

export async function cerrarSesion(id: string): Promise<void> {
  const s = await sesionCompleta();
  await sql`delete from sesiones where id = ${id} and usuario_id = ${s.usuario.id} and id <> ${s.id}`;
  await registrar(s.usuario.id, 'sesion.revocada', 'sesion', id);
  revalidatePath('/cuenta');
}

export async function cerrarOtras(): Promise<void> {
  const s = await sesionCompleta();
  await cerrarOtrasSesiones(s.usuario.id, s.id);
  await registrar(s.usuario.id, 'sesion.revocadas_todas', 'usuario', s.usuario.id);
  revalidatePath('/cuenta');
}
