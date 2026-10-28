import 'server-only';
import { sql } from './db';
import { cargarCuenta, conectorPara, marcarErrorCuenta } from './conectores';
import { mediosDe } from './medios';
import { problemasParaRed, type TipoPublicacion } from './redes';
import { registrar } from './bitacora';

/**
 * Publica una publicación aprobada en todas sus redes de destino.
 * Solo avanza si logra pasarla a "publicando" (evita publicar dos veces en paralelo).
 */
export async function publicarAhora(publicacionId: string, usuarioId: string | null) {
  const tomadas = await sql`
    update publicaciones set estado = 'publicando', actualizada_en = now()
    where id = ${publicacionId} and estado in ('aprobada', 'programada', 'fallida', 'parcial')
    returning *
  `;
  const pub = tomadas[0];
  if (!pub) throw new Error('La publicación no está lista para publicarse o ya se está publicando.');

  const medios = await mediosDe(publicacionId);
  const destinos = await sql`
    select d.id, d.cuenta_id, d.texto_propio, d.estado, c.red, c.nombre
    from destinos_publicacion d join cuentas_sociales c on c.id = d.cuenta_id
    where d.publicacion_id = ${publicacionId} and d.estado <> 'publicada'
  `;

  let ok = 0;
  let fallas = 0;
  for (const d of destinos) {
    const texto = d.texto_propio ?? pub.texto;
    const problemas = problemasParaRed(d.red, pub.tipo as TipoPublicacion, texto, medios);
    if (problemas.length) {
      fallas++;
      await sql`update destinos_publicacion set estado = 'fallida', error = ${problemas.join(' ')} where id = ${d.id}`;
      continue;
    }
    await sql`update destinos_publicacion set estado = 'publicando', error = null where id = ${d.id}`;
    try {
      const cuenta = await cargarCuenta(d.cuenta_id);
      const r = await conectorPara(cuenta).publicar(cuenta, {
        tipo: pub.tipo,
        titulo: pub.titulo,
        texto,
        enlace: pub.enlace,
        medios: medios.map((m) => ({ id: m.id, url: m.url, mime: m.mime, nombre: m.nombre, tamano: m.tamano })),
      });
      await sql`
        update destinos_publicacion set estado = 'publicada', id_externo = ${r.idExterno},
          url_externa = ${r.url}, publicada_en = now(), error = null
        where id = ${d.id}
      `;
      await sql`
        insert into publicaciones_externas (cuenta_id, id_externo, url, texto, tipo, publicada_en)
        values (${d.cuenta_id}, ${r.idExterno}, ${r.url}, ${texto.slice(0, 2000)}, ${pub.tipo}, now())
        on conflict (cuenta_id, id_externo) do nothing
      `;
      ok++;
    } catch (e) {
      fallas++;
      await sql`update destinos_publicacion set estado = 'fallida', error = ${(e as Error).message.slice(0, 800)} where id = ${d.id}`;
      await marcarErrorCuenta(d.cuenta_id, e);
    }
  }

  const [{ publicadas, total }] = await sql`
    select count(*) filter (where estado = 'publicada')::int as publicadas, count(*)::int as total
    from destinos_publicacion where publicacion_id = ${publicacionId}
  `;
  const estado = publicadas === total ? 'publicada' : publicadas === 0 ? 'fallida' : 'parcial';
  await sql`update publicaciones set estado = ${estado}, actualizada_en = now() where id = ${publicacionId}`;
  await registrar(usuarioId, 'publicacion.publicada', 'publicacion', publicacionId, { estado, exitosas: ok, fallidas: fallas });
  return { estado, ok, fallas };
}

/** Publica todo lo programado cuya hora ya llegó. Lo llaman el cron y las visitas a la app. */
export async function publicarVencidas(limite = 5) {
  const vencidas = await sql`
    select id from publicaciones
    where estado = 'programada' and programada_para <= now()
    order by programada_para limit ${limite}
  `;
  const resultados = [];
  for (const v of vencidas) {
    try {
      resultados.push({ id: v.id, ...(await publicarAhora(v.id, null)) });
    } catch (e) {
      resultados.push({ id: v.id, error: (e as Error).message });
    }
  }
  return resultados;
}
