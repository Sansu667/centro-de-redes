import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { requerirUsuario } from '@/lib/auth';
import { sql } from '@/lib/db';
import { puede } from '@/lib/roles';
import { INFO_RED, REDES, type Red } from '@/lib/redes';
import { fechaHora, hace, iniciales } from '@/lib/formato';
import { IconoRed } from '@/components/IconoRed';
import { RespuestaComentario } from '@/components/RespuestaComentario';
import { cambiarEstado, ocultar, responder } from './acciones';

export const metadata = { title: 'Comentarios' };

const ESTADOS = [
  { clave: 'nuevo', nombre: 'Sin responder' },
  { clave: 'respondido', nombre: 'Atendidos' },
  { clave: 'oculto', nombre: 'Ocultos' },
  { clave: 'archivado', nombre: 'Archivados' },
  { clave: 'todos', nombre: 'Todos' },
];

function enlace(base: Record<string, string>, cambio: Record<string, string | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...cambio })) if (v) q.set(k, v);
  return `/comentarios?${q}`;
}

export default async function Comentarios({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const u = await requerirUsuario('ver');
  const q = await searchParams;
  const estado = ESTADOS.some((e) => e.clave === q.estado) ? q.estado : 'nuevo';
  const red = REDES.includes(q.red as Red) ? (q.red as Red) : null;
  const busqueda = (q.q ?? '').trim().slice(0, 100);
  const base: Record<string, string> = { estado, ...(red ? { red } : {}), ...(busqueda ? { q: busqueda } : {}) };

  const lista = await sql`
    select k.id, k.autor_nombre, k.autor_usuario, k.texto, k.escrito_en, k.estado, c.red
    from comentarios k join cuentas_sociales c on c.id = k.cuenta_id
    where not k.es_propio and c.estado <> 'desactivada'
      ${estado !== 'todos' ? sql`and k.estado = ${estado}` : sql``}
      ${red ? sql`and c.red = ${red}` : sql``}
      ${busqueda ? sql`and (k.texto ilike ${'%' + busqueda + '%'} or k.autor_nombre ilike ${'%' + busqueda + '%'})` : sql``}
    order by k.escrito_en desc
    limit 150
  `;
  const conteo = await sql`
    select c.red, count(*)::int as n from comentarios k join cuentas_sociales c on c.id = k.cuenta_id
    where not k.es_propio and k.estado = 'nuevo' group by c.red
  `;
  const porRed = new Map(conteo.map((c) => [c.red as Red, c.n as number]));
  const redesActivas = (await sql`select distinct red from cuentas_sociales where estado <> 'desactivada'`).map((r) => r.red as Red);

  // Se fija el comentario en la URL para que siga abierto después de responderlo.
  if (!q.c && lista[0]) redirect(enlace(base, { c: lista[0].id }));
  const seleccionado = /^[0-9a-f-]{36}$/.test(q.c ?? '') ? q.c : undefined;
  const posicion = lista.findIndex((k) => k.id === seleccionado);
  const siguiente = posicion === -1 ? lista[0] : lista[posicion + 1];
  let detalle: any = null;
  let hilo: any[] = [];
  let origen: any = null;
  if (seleccionado) {
    [detalle] = await sql`
      select k.*, c.red, c.nombre as cuenta_nombre, c.usuario_red as cuenta_usuario, c.modo, r.nombre as respondido_por_nombre
      from comentarios k join cuentas_sociales c on c.id = k.cuenta_id left join usuarios r on r.id = k.respondido_por
      where k.id = ${seleccionado}
    `;
    if (detalle) {
      hilo = await sql`
        select k.id, k.autor_nombre, k.autor_usuario, k.autor_avatar, k.texto, k.escrito_en, k.es_propio, k.id_externo, k.id_padre_externo
        from comentarios k
        where k.cuenta_id = ${detalle.cuenta_id}
          and (k.id_externo = ${detalle.id_padre_externo ?? ''} or k.id_padre_externo = ${detalle.id_externo}
               or (k.id_padre_externo = ${detalle.id_padre_externo ?? '__sin_padre__'} ) or k.id = ${detalle.id})
        order by k.escrito_en
      `;
      if (detalle.publicacion_externa_id) {
        [origen] = await sql`select url, texto, publicada_en from publicaciones_externas
                             where cuenta_id = ${detalle.cuenta_id} and id_externo = ${detalle.publicacion_externa_id}`;
      }
    }
  }

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Comentarios</h1>
          <p>Lo que la gente escribe en todas las redes, en una sola bandeja. Las respuestas salen publicadas desde la cuenta del Departamento.</p>
        </div>
      </div>

      <div className="bandeja">
        <div className="bandeja-lista">
          <div className="bandeja-filtros">
            <nav className="segmentado" aria-label="Estado" style={{ flexWrap: 'wrap' }}>
              {ESTADOS.map((e) => (
                <Link key={e.clave} href={enlace(base, { estado: e.clave, c: null })} aria-current={e.clave === estado ? 'true' : undefined}>
                  {e.nombre}
                </Link>
              ))}
            </nav>
            <div className="fila" role="group" aria-label="Red">
              <Link className="filtro-red" href={enlace(base, { red: null, c: null })} aria-current={!red ? 'true' : undefined}>
                Todas
              </Link>
              {redesActivas.map((r) => (
                <Link key={r} className="filtro-red" href={enlace(base, { red: r, c: null })} aria-current={red === r ? 'true' : undefined}>
                  <IconoRed red={r} tam={12} /> {INFO_RED[r].nombre}
                  {porRed.get(r) ? ` · ${porRed.get(r)}` : ''}
                </Link>
              ))}
            </div>
            <form role="search">
              <input type="hidden" name="estado" value={estado} />
              {red && <input type="hidden" name="red" value={red} />}
              <input type="search" name="q" defaultValue={busqueda} placeholder="Buscar en comentarios o autores" aria-label="Buscar comentarios" />
            </form>
          </div>
          {lista.length === 0 ? (
            <div className="vacio">
              <h3>{estado === 'nuevo' ? 'Todo respondido' : 'Nada por aquí'}</h3>
              <p>{estado === 'nuevo' ? 'No quedan comentarios pendientes con estos filtros.' : 'Prueba con otros filtros.'}</p>
            </div>
          ) : (
            lista.map((k) => (
              <Link
                key={k.id}
                href={enlace(base, { c: k.id })}
                className={`comentario-item${k.estado === 'nuevo' ? ' nuevo' : ''}`}
                aria-current={k.id === seleccionado ? 'true' : undefined}
                scroll={false}
              >
                <div className="linea1">
                  <IconoRed red={k.red} tam={15} />
                  <strong>{k.autor_nombre}</strong>
                  <time dateTime={new Date(k.escrito_en).toISOString()}>{hace(k.escrito_en)}</time>
                </div>
                <p>{k.texto}</p>
              </Link>
            ))
          )}
        </div>

        <div className="bandeja-detalle">
          {!detalle ? (
            <div className="vacio">
              <h3>Elige un comentario</h3>
              <p>Su conversación y la publicación donde se escribió aparecerán aquí.</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                <IconoRed red={detalle.red} tam={24} />
                <h2>
                  {INFO_RED[detalle.red as Red].nombre} · {detalle.cuenta_usuario || detalle.cuenta_nombre}
                </h2>
                {detalle.modo === 'demo' && <span className="etiqueta info">Demostración</span>}
                {detalle.estado === 'respondido' && (
                  <span className="etiqueta ok">Atendido{detalle.respondido_por_nombre ? ` por ${detalle.respondido_por_nombre}` : ''}</span>
                )}
                {detalle.estado === 'oculto' && <span className="etiqueta grave">Oculto</span>}
                {detalle.estado === 'archivado' && <span className="etiqueta">Archivado</span>}
                {siguiente && (
                  <Link href={enlace(base, { c: siguiente.id })} className="boton secundario chico" style={{ marginLeft: 'auto' }} scroll={false}>
                    Siguiente
                  </Link>
                )}
              </div>

              {origen && (
                <div className="origen">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                    <strong style={{ color: 'var(--tinta)' }}>Publicación de origen</strong>
                    {origen.url && (
                      <a href={origen.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                        Abrir <ExternalLink size={13} aria-hidden="true" />
                      </a>
                    )}
                  </div>
                  <span className="texto-corto">{origen.texto || 'Sin texto'}</span>
                  <div style={{ marginTop: 4 }}>{fechaHora(origen.publicada_en)}</div>
                </div>
              )}

              <div className="hilo">
                {hilo.map((m) => (
                  <div key={m.id} className={`mensaje${m.id_padre_externo ? ' respuesta' : ''}`}>
                    <div className={`iniciales${m.es_propio ? ' depto' : ''}`} aria-hidden="true">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {m.autor_avatar ? <img src={m.autor_avatar} alt="" referrerPolicy="no-referrer" /> : iniciales(m.autor_nombre)}
                    </div>
                    <div className="burbuja" style={m.id === detalle.id ? { outline: '2px solid var(--liquen)' } : undefined}>
                      <div className="quien">
                        {m.autor_nombre} {m.autor_usuario && m.autor_usuario !== m.autor_nombre && <span>{m.autor_usuario}</span>}{' '}
                        <span>· {fechaHora(m.escrito_en)}</span>
                      </div>
                      <p>{m.texto}</p>
                    </div>
                  </div>
                ))}
              </div>

              <RespuestaComentario
                key={detalle.id}
                id={detalle.id}
                estado={detalle.estado}
                limite={INFO_RED[detalle.red as Red].limiteTexto > 8000 ? 8000 : INFO_RED[detalle.red as Red].limiteTexto}
                puedeOcultar={INFO_RED[detalle.red as Red].ocultaComentarios}
                puedeModerar={puede(u.rol, 'moderar_comentarios')}
                nombreRed={INFO_RED[detalle.red as Red].nombre}
                acciones={{ responder, cambiarEstado, ocultar }}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
