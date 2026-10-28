import 'server-only';
import { sql } from './db';

const VENTANA = '15 minutes';
const MAX_POR_IP = 20;
export const MAX_POR_CUENTA = 5;
export const BLOQUEO_MIN = 15;

/** ¿Esta IP ya superó el número de intentos fallidos permitidos en la ventana? */
export async function ipBloqueada(ip: string): Promise<boolean> {
  const [{ n }] = await sql`
    select count(*)::int as n from intentos_ingreso
    where ip = ${ip} and not exitoso and creado_en > now() - ${VENTANA}::interval
  `;
  return n >= MAX_POR_IP;
}

export async function anotarIntento(email: string | null, ip: string, exitoso: boolean, motivo: string) {
  await sql`insert into intentos_ingreso (email, ip, exitoso, motivo) values (${email}, ${ip}, ${exitoso}, ${motivo})`;
  // Limpieza: se guardan 30 días de intentos.
  if (Math.random() < 0.02) await sql`delete from intentos_ingreso where creado_en < now() - interval '30 days'`;
}

/** Suma un fallo a la cuenta y la bloquea temporalmente al llegar al máximo. */
export async function fallarCuenta(usuarioId: string) {
  await sql`
    update usuarios set
      intentos_fallidos = intentos_fallidos + 1,
      bloqueado_hasta = case when intentos_fallidos + 1 >= ${MAX_POR_CUENTA}
        then now() + ${BLOQUEO_MIN + ' minutes'}::interval else bloqueado_hasta end
    where id = ${usuarioId}
  `;
}

export async function reiniciarFallos(usuarioId: string) {
  await sql`update usuarios set intentos_fallidos = 0, bloqueado_hasta = null where id = ${usuarioId}`;
}
