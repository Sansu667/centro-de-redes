import 'server-only';
import { sql } from './db';
import { cargarCuenta, conectorPara, marcarErrorCuenta } from './conectores';

/** Trae métricas, publicaciones recientes y comentarios de una cuenta y los guarda. */
export async function sincronizarCuenta(id: string) {
  const cuenta = await cargarCuenta(id);
  if (cuenta.modo === 'manual') return { cuenta: cuenta.nombre, dias: 0, publicaciones: 0, comentariosNuevos: 0 };
  const conector = conectorPara(cuenta);
  const [{ n }] = await sql`select count(*)::int as n from metricas_diarias where cuenta_id = ${id}`;
  const dias = n < 30 ? 90 : 7;

  try {
    const metricas = await conector.metricas(cuenta, dias);
    for (const m of metricas) {
      await sql`
        insert into metricas_diarias (cuenta_id, dia, seguidores, alcance, impresiones, interacciones, vistas, publicaciones)
        values (${id}, ${m.dia}, ${m.seguidores ?? 0}, ${m.alcance ?? 0}, ${m.impresiones ?? 0},
                ${m.interacciones ?? 0}, ${m.vistas ?? 0}, ${m.publicaciones ?? 0})
        on conflict (cuenta_id, dia) do update set
          seguidores = case when ${m.seguidores ?? null}::int is null then metricas_diarias.seguidores else excluded.seguidores end,
          alcance = case when ${m.alcance ?? null}::int is null then metricas_diarias.alcance else excluded.alcance end,
          impresiones = case when ${m.impresiones ?? null}::int is null then metricas_diarias.impresiones else excluded.impresiones end,
          interacciones = case when ${m.interacciones ?? null}::int is null then metricas_diarias.interacciones else excluded.interacciones end,
          vistas = case when ${m.vistas ?? null}::int is null then metricas_diarias.vistas else excluded.vistas end,
          publicaciones = case when ${m.publicaciones ?? null}::int is null then metricas_diarias.publicaciones else excluded.publicaciones end
      `;
    }
    // Donde la red no da historial de seguidores, se arrastra el último valor conocido.
    await sql`
      update metricas_diarias m set seguidores = sub.previo
      from (
        select dia, (select seguidores from metricas_diarias p where p.cuenta_id = ${id} and p.dia < m2.dia and p.seguidores > 0 order by dia desc limit 1) as previo
        from metricas_diarias m2 where m2.cuenta_id = ${id} and m2.seguidores = 0
      ) sub
      where m.cuenta_id = ${id} and m.dia = sub.dia and sub.previo is not null
    `;

    const pubs = await conector.publicacionesRecientes(cuenta);
    for (const p of pubs) {
      await sql`
        insert into publicaciones_externas (cuenta_id, id_externo, url, texto, tipo, publicada_en,
          me_gusta, comentarios, compartidos, guardados, vistas, alcance, actualizada_en)
        values (${id}, ${p.idExterno}, ${p.url}, ${p.texto?.slice(0, 2000) ?? null}, ${p.tipo}, ${p.publicadaEn},
          ${p.meGusta ?? 0}, ${p.comentarios ?? 0}, ${p.compartidos ?? 0}, ${p.guardados ?? 0}, ${p.vistas ?? 0}, ${p.alcance ?? 0}, now())
        on conflict (cuenta_id, id_externo) do update set
          url = coalesce(excluded.url, publicaciones_externas.url),
          texto = coalesce(excluded.texto, publicaciones_externas.texto),
          me_gusta = excluded.me_gusta, comentarios = excluded.comentarios, compartidos = excluded.compartidos,
          guardados = excluded.guardados, vistas = excluded.vistas, alcance = excluded.alcance, actualizada_en = now()
      `;
    }

    let nuevos = 0;
    const comentarios = await conector.comentarios(cuenta, pubs);
    for (const k of comentarios) {
      const r = await sql`
        insert into comentarios (cuenta_id, id_externo, id_padre_externo, publicacion_externa_id, autor_nombre,
          autor_usuario, autor_avatar, texto, escrito_en, es_propio, estado)
        values (${id}, ${k.idExterno}, ${k.idPadreExterno}, ${k.publicacionExternaId}, ${k.autorNombre.slice(0, 200)},
          ${k.autorUsuario}, ${k.autorAvatar}, ${k.texto.slice(0, 5000)}, ${k.escritoEn}, ${k.esPropio},
          ${k.esPropio ? 'respondido' : 'nuevo'})
        on conflict (cuenta_id, id_externo) do update set texto = excluded.texto
        returning (xmax = 0) as insertado
      `;
      if (r[0]?.insertado && !k.esPropio) nuevos++;
    }
    // Un comentario queda "respondido" si la cuenta del Departamento ya le contestó desde la red.
    await sql`
      update comentarios c set estado = 'respondido'
      where c.cuenta_id = ${id} and c.estado = 'nuevo'
        and exists (select 1 from comentarios r where r.cuenta_id = c.cuenta_id and r.es_propio and r.id_padre_externo = c.id_externo)
    `;

    await sql`update cuentas_sociales set ultima_sincronizacion = now(), estado = 'activa', ultimo_error = null where id = ${id}`;
    return { cuenta: cuenta.nombre, dias: metricas.length, publicaciones: pubs.length, comentariosNuevos: nuevos };
  } catch (e) {
    await marcarErrorCuenta(id, e);
    throw e;
  }
}

export async function sincronizarTodo() {
  const cuentas = await sql`select id, nombre from cuentas_sociales where estado <> 'desactivada' and modo <> 'manual' order by red`;
  const resultados = [];
  for (const c of cuentas) {
    try {
      resultados.push(await sincronizarCuenta(c.id));
    } catch (e) {
      resultados.push({ cuenta: c.nombre, error: (e as Error).message });
    }
  }
  return resultados;
}
