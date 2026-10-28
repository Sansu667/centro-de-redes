'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { usuarioParaAccion } from '@/lib/auth';
import { registrar } from '@/lib/bitacora';
import { cargarCuenta, conectorPara } from '@/lib/conectores';
import { INFO_RED, type Red } from '@/lib/redes';

const uuid = z.string().uuid();

async function comentario(id: string) {
  uuid.parse(id);
  const [k] = await sql`select k.*, c.red, c.nombre as cuenta_nombre from comentarios k join cuentas_sociales c on c.id = k.cuenta_id where k.id = ${id}`;
  if (!k) throw new Error('El comentario ya no existe.');
  return k;
}

export async function responder(id: string, texto: string): Promise<void> {
  const u = await usuarioParaAccion('moderar_comentarios');
  const k = await comentario(id);
  const limpio = z.string().trim().min(1, 'Escribe la respuesta.').max(INFO_RED[k.red as Red].limiteTexto, 'La respuesta es demasiado larga para esta red.').parse(texto);
  const cuenta = await cargarCuenta(k.cuenta_id);
  const r = await conectorPara(cuenta).responder(cuenta, { idExterno: k.id_externo, publicacionExternaId: k.publicacion_externa_id }, limpio);
  await sql.begin(async (tx) => {
    await tx`
      insert into comentarios (cuenta_id, id_externo, id_padre_externo, publicacion_externa_id, autor_nombre, autor_usuario, texto,
        escrito_en, estado, es_propio, respondido_por)
      values (${k.cuenta_id}, ${r.idExterno}, ${k.id_externo}, ${k.publicacion_externa_id}, ${cuenta.nombre}, ${cuenta.usuario_red},
        ${limpio}, now(), 'respondido', true, ${u.id})
      on conflict (cuenta_id, id_externo) do nothing
    `;
    await tx`update comentarios set estado = 'respondido', respondido_por = ${u.id}, respondido_en = now() where id = ${id}`;
  });
  await registrar(u.id, 'comentario.respondido', 'comentario', id, { red: k.red, respuesta: limpio.slice(0, 280) });
  revalidatePath('/comentarios');
  revalidatePath('/', 'layout');
}

export async function cambiarEstado(id: string, estado: 'nuevo' | 'respondido' | 'archivado'): Promise<void> {
  const u = await usuarioParaAccion('moderar_comentarios');
  z.enum(['nuevo', 'respondido', 'archivado']).parse(estado);
  const k = await comentario(id);
  await sql`update comentarios set estado = ${estado},
              respondido_por = case when ${estado} = 'respondido' then ${u.id}::uuid else respondido_por end,
              respondido_en = case when ${estado} = 'respondido' then now() else respondido_en end
            where id = ${id}`;
  await registrar(u.id, `comentario.${estado}`, 'comentario', id, { red: k.red });
  revalidatePath('/', 'layout');
}

export async function ocultar(id: string, ocultarlo: boolean): Promise<void> {
  const u = await usuarioParaAccion('moderar_comentarios');
  const k = await comentario(id);
  if (!INFO_RED[k.red as Red].ocultaComentarios) throw new Error(`${INFO_RED[k.red as Red].nombre} no permite ocultar comentarios por API.`);
  const cuenta = await cargarCuenta(k.cuenta_id);
  const c = conectorPara(cuenta);
  if (!c.ocultar) throw new Error('Esta red no permite ocultar comentarios.');
  await c.ocultar(cuenta, k.id_externo, ocultarlo);
  await sql`update comentarios set estado = ${ocultarlo ? 'oculto' : 'nuevo'} where id = ${id}`;
  await registrar(u.id, ocultarlo ? 'comentario.ocultado' : 'comentario.mostrado', 'comentario', id, { red: k.red, texto: k.texto.slice(0, 280) });
  revalidatePath('/', 'layout');
}
