import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from './db';
import { sha256, tokenAleatorio } from './crypto';
import { agenteCliente, ipCliente } from './bitacora';
import { puede, type Permiso, type Rol } from './roles';

const SEGURA = process.env.NODE_ENV === 'production' && process.env.COOKIE_INSEGURA !== '1';
export const NOMBRE_COOKIE = SEGURA ? '__Host-redes_sesion' : 'redes_sesion';

const INACTIVIDAD_MS = 2 * 60 * 60 * 1000; // 2 horas sin actividad cierra la sesión
const DURACION_MS = 12 * 60 * 60 * 1000; // 12 horas como máximo
const DURACION_PENDIENTE_MS = 10 * 60 * 1000; // 10 minutos para completar la verificación en dos pasos

export type Usuario = {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  totp_activo: boolean;
  debe_cambiar_password: boolean;
};

export type Sesion = { id: string; mfa_verificado: boolean; usuario: Usuario };

async function fijarCookie(token: string, expira: Date) {
  (await cookies()).set(NOMBRE_COOKIE, token, {
    httpOnly: true,
    secure: SEGURA,
    sameSite: 'lax',
    path: '/',
    expires: expira,
    priority: 'high',
  });
}

export async function crearSesion(usuarioId: string, mfaVerificado: boolean) {
  const token = tokenAleatorio(32);
  const expira = new Date(Date.now() + (mfaVerificado ? DURACION_MS : DURACION_PENDIENTE_MS));
  await sql`
    insert into sesiones (token_hash, usuario_id, mfa_verificado, expira_en, ip, agente)
    values (${sha256(token)}, ${usuarioId}, ${mfaVerificado}, ${expira}, ${await ipCliente()}, ${await agenteCliente()})
  `;
  await fijarCookie(token, expira);
}

/** Tras verificar el segundo factor se emite un token nuevo (evita fijación de sesión). */
export async function elevarSesion(sesionId: string) {
  const token = tokenAleatorio(32);
  const expira = new Date(Date.now() + DURACION_MS);
  await sql`
    update sesiones set token_hash = ${sha256(token)}, mfa_verificado = true,
      expira_en = ${expira}, ultima_actividad = now()
    where id = ${sesionId}
  `;
  await fijarCookie(token, expira);
}

export const obtenerSesion = cache(async (): Promise<Sesion | null> => {
  const token = (await cookies()).get(NOMBRE_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const filas = await sql`
    select s.id, s.mfa_verificado, s.expira_en, s.ultima_actividad,
           u.id as uid, u.email, u.nombre, u.rol, u.totp_activo, u.debe_cambiar_password, u.activo
    from sesiones s join usuarios u on u.id = s.usuario_id
    where s.token_hash = ${sha256(token)}
  `;
  const f = filas[0];
  if (!f) return null;
  const ahora = Date.now();
  const inactiva = ahora - new Date(f.ultima_actividad).getTime() > INACTIVIDAD_MS;
  if (!f.activo || new Date(f.expira_en).getTime() < ahora || (f.mfa_verificado && inactiva)) {
    await sql`delete from sesiones where id = ${f.id}`;
    return null;
  }
  if (ahora - new Date(f.ultima_actividad).getTime() > 60_000) {
    await sql`update sesiones set ultima_actividad = now() where id = ${f.id}`;
  }
  return {
    id: f.id,
    mfa_verificado: f.mfa_verificado,
    usuario: {
      id: f.uid,
      email: f.email,
      nombre: f.nombre,
      rol: f.rol,
      totp_activo: f.totp_activo,
      debe_cambiar_password: f.debe_cambiar_password,
    },
  };
});

/** Exige una sesión completa (contraseña + segundo factor) y, opcionalmente, un permiso. */
export async function requerirUsuario(permiso: Permiso = 'ver', opciones: { permitirCambioClave?: boolean } = {}) {
  const s = await obtenerSesion();
  if (!s) redirect('/ingresar');
  if (!s.mfa_verificado) redirect(s.usuario.totp_activo ? '/ingresar/verificacion' : '/ingresar/configurar-2fa');
  if (s.usuario.debe_cambiar_password && !opciones.permitirCambioClave) redirect('/cuenta/cambiar-clave');
  if (!puede(s.usuario.rol, permiso)) redirect('/panel?sin_permiso=1');
  return s.usuario;
}

/** Variante para acciones de servidor: lanza error en vez de redirigir a otra página. */
export async function usuarioParaAccion(permiso: Permiso): Promise<Usuario> {
  const s = await obtenerSesion();
  if (!s || !s.mfa_verificado) throw new Error('Tu sesión terminó. Vuelve a ingresar.');
  if (s.usuario.debe_cambiar_password) throw new Error('Cambia tu contraseña antes de continuar.');
  if (!puede(s.usuario.rol, permiso)) throw new Error('Tu rol no permite esta acción.');
  return s.usuario;
}

export async function cerrarSesionActual() {
  const token = (await cookies()).get(NOMBRE_COOKIE)?.value;
  if (token) await sql`delete from sesiones where token_hash = ${sha256(token)}`;
  (await cookies()).delete(NOMBRE_COOKIE);
}

export async function cerrarOtrasSesiones(usuarioId: string, excepto?: string) {
  await sql`delete from sesiones where usuario_id = ${usuarioId} and id <> ${excepto ?? '00000000-0000-0000-0000-000000000000'}`;
}
