'use server';

import { randomInt } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { usuarioParaAccion } from '@/lib/auth';
import { hashPassword } from '@/lib/password';
import { registrar } from '@/lib/bitacora';

export type EstadoUsuario = { error?: string; temporal?: string; email?: string; valores?: Record<string, string> } | undefined;

const roles = z.enum(['admin', 'aprobador', 'editor', 'lector']);

function claveTemporal() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 16; i++) s += a[randomInt(a.length)];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12)}#`;
}

export async function crearUsuario(_: EstadoUsuario, form: FormData): Promise<EstadoUsuario> {
  const u = await usuarioParaAccion('gestionar_usuarios');
  const d = z
    .object({ nombre: z.string().trim().min(3).max(120), email: z.string().trim().toLowerCase().email().max(200), rol: roles })
    .safeParse(Object.fromEntries(form));
  const valores = { nombre: String(form.get('nombre') ?? ''), email: String(form.get('email') ?? ''), rol: String(form.get('rol') ?? 'editor') };
  if (!d.success) return { error: 'Escribe nombre, correo válido y rol.', valores };
  const temporal = claveTemporal();
  try {
    const [n] = await sql`
      insert into usuarios (email, nombre, rol, password_hash, debe_cambiar_password)
      values (${d.data.email}, ${d.data.nombre}, ${d.data.rol}, ${await hashPassword(temporal)}, true) returning id
    `;
    await registrar(u.id, 'usuario.creado', 'usuario', n.id, { email: d.data.email, rol: d.data.rol });
  } catch (e) {
    if (String((e as Error).message).includes('usuarios_email_unico')) return { error: 'Ya existe un usuario con ese correo.', valores };
    throw e;
  }
  revalidatePath('/usuarios');
  return { temporal, email: d.data.email };
}

async function objetivo(id: string, actorId: string) {
  z.string().uuid().parse(id);
  const [x] = await sql`select id, email, rol, activo from usuarios where id = ${id}`;
  if (!x) throw new Error('El usuario no existe.');
  if (x.id === actorId) throw new Error('No puedes cambiar tu propia cuenta desde aquí; usa Mi cuenta.');
  return x;
}

async function quedaOtroAdmin(excepto: string) {
  const [{ n }] = await sql`select count(*)::int as n from usuarios where rol = 'admin' and activo and id <> ${excepto}`;
  return n > 0;
}

export async function cambiarRol(id: string, rol: string): Promise<void> {
  const u = await usuarioParaAccion('gestionar_usuarios');
  const x = await objetivo(id, u.id);
  const nuevo = roles.parse(rol);
  if (x.rol === 'admin' && nuevo !== 'admin' && !(await quedaOtroAdmin(id))) throw new Error('Debe quedar al menos un administrador activo.');
  await sql`update usuarios set rol = ${nuevo} where id = ${id}`;
  await sql`delete from sesiones where usuario_id = ${id}`;
  await registrar(u.id, 'usuario.rol_cambiado', 'usuario', id, { de: x.rol, a: nuevo });
  revalidatePath('/usuarios');
}

export async function activarUsuario(id: string, activo: boolean): Promise<void> {
  const u = await usuarioParaAccion('gestionar_usuarios');
  const x = await objetivo(id, u.id);
  if (!activo && x.rol === 'admin' && !(await quedaOtroAdmin(id))) throw new Error('Debe quedar al menos un administrador activo.');
  await sql`update usuarios set activo = ${activo} where id = ${id}`;
  if (!activo) await sql`delete from sesiones where usuario_id = ${id}`;
  await registrar(u.id, activo ? 'usuario.reactivado' : 'usuario.desactivado', 'usuario', id, { email: x.email });
  revalidatePath('/usuarios');
}

export async function restablecerAcceso(id: string): Promise<{ temporal: string }> {
  const u = await usuarioParaAccion('gestionar_usuarios');
  const x = await objetivo(id, u.id);
  const temporal = claveTemporal();
  await sql`
    update usuarios set password_hash = ${await hashPassword(temporal)}, debe_cambiar_password = true,
      totp_activo = false, totp_secret_cifrado = null, totp_ultimo_paso = 0, intentos_fallidos = 0, bloqueado_hasta = null
    where id = ${id}
  `;
  await sql`delete from codigos_recuperacion where usuario_id = ${id}`;
  await sql`delete from sesiones where usuario_id = ${id}`;
  await registrar(u.id, 'usuario.acceso_restablecido', 'usuario', id, { email: x.email });
  revalidatePath('/usuarios');
  return { temporal };
}

export async function desbloquear(id: string): Promise<void> {
  const u = await usuarioParaAccion('gestionar_usuarios');
  await objetivo(id, u.id);
  await sql`update usuarios set intentos_fallidos = 0, bloqueado_hasta = null where id = ${id}`;
  await registrar(u.id, 'usuario.desbloqueado', 'usuario', id);
  revalidatePath('/usuarios');
}
