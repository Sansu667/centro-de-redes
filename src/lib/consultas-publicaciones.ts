import 'server-only';
import { sql } from './db';
import type { CuentaOpcion } from '@/components/Compositor';

export async function cuentasParaPublicar(): Promise<CuentaOpcion[]> {
  const filas = await sql`
    select id, red, nombre, usuario_red, modo from cuentas_sociales
    where estado <> 'desactivada'
    order by array_position(array['facebook','instagram','youtube','linkedin','x']::red_social[], red), nombre
  `;
  return filas.map((f) => ({ id: f.id, red: f.red, nombre: f.nombre, usuario_red: f.usuario_red, modo: f.modo }));
}
