'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { usuarioParaAccion } from '@/lib/auth';
import { registrar } from '@/lib/bitacora';
import { REDES, INFO_RED, type Red } from '@/lib/redes';
import { sembrarDemo } from '@/lib/demo-datos';
import { sincronizarCuenta } from '@/lib/sincronizador';

const uuid = z.string().uuid();

export async function crearDemo(red: Red): Promise<void> {
  const u = await usuarioParaAccion('gestionar_cuentas');
  if (!REDES.includes(red)) throw new Error('Red desconocida.');
  const [ya] = await sql`select id from cuentas_sociales where red = ${red}`;
  if (ya) throw new Error(`Ya hay una cuenta de ${INFO_RED[red].nombre}.`);
  const nombres: Record<Red, [string, string]> = {
    facebook: ['Departamento de Filosofía UNAL', 'filosofiaunal'],
    instagram: ['Filosofía UNAL', '@filosofia.unal'],
    youtube: ['Departamento de Filosofía UNAL', '@DepartamentodeFilosofíaUNAL'],
    linkedin: ['Departamento de Filosofía · UNAL', 'filosofia-unal'],
    x: ['Filosofía UNAL', '@FilosofiaUNAL'],
  };
  const [c] = await sql`
    insert into cuentas_sociales (red, nombre, usuario_red, id_externo, modo, conectada_por)
    values (${red}, ${nombres[red][0]}, ${nombres[red][1]}, ${'demo_' + red}, 'demo', ${u.id}) returning id
  `;
  await sembrarDemo(c.id, red);
  await registrar(u.id, 'cuenta.demo_creada', 'cuenta', c.id, { red });
  revalidatePath('/', 'layout');
}

export async function sincronizar(id: string): Promise<void> {
  const u = await usuarioParaAccion('sincronizar');
  uuid.parse(id);
  const r = await sincronizarCuenta(id);
  await registrar(u.id, 'cuenta.sincronizada', 'cuenta', id, r);
  revalidatePath('/', 'layout');
}

export async function activar(id: string, activa: boolean): Promise<void> {
  const u = await usuarioParaAccion('gestionar_cuentas');
  uuid.parse(id);
  await sql`update cuentas_sociales set estado = ${activa ? 'activa' : 'desactivada'} where id = ${id}`;
  await registrar(u.id, activa ? 'cuenta.reactivada' : 'cuenta.desactivada', 'cuenta', id);
  revalidatePath('/', 'layout');
}

export async function eliminarCuenta(id: string): Promise<void> {
  const u = await usuarioParaAccion('gestionar_cuentas');
  uuid.parse(id);
  const [c] = await sql`select red, nombre, modo from cuentas_sociales where id = ${id}`;
  if (!c) return;
  await sql`delete from cuentas_sociales where id = ${id}`;
  await registrar(u.id, 'cuenta.eliminada', 'cuenta', id, { red: c.red, nombre: c.nombre, modo: c.modo });
  revalidatePath('/', 'layout');
}
