import Link from 'next/link';
import { TriangleAlert, Plug } from 'lucide-react';
import { requerirUsuario } from '@/lib/auth';
import { sql } from '@/lib/db';
import { puede } from '@/lib/roles';
import { INFO_RED, type Red } from '@/lib/redes';
import {
  comentariosPorRed,
  leerPeriodo,
  mejoresPublicaciones,
  resumenPorRed,
  serie,
  tasa,
  variacion,
} from '@/lib/estadisticas';
import { compacto, fechaHora, hace, numero, porcentaje, variacionTexto } from '@/lib/formato';
import { SelectorPeriodo } from '@/components/Periodo';
import { Estratos } from '@/components/Estratos';
import { Cifra } from '@/components/Cifra';
import { BarrasPorRed } from '@/components/Graficos';
import { ChipRed } from '@/components/IconoRed';
import { BotonSincronizar } from '@/components/BotonSincronizar';
import { sincronizarAhora } from '../acciones-generales';

export const metadata = { title: 'Panorama' };

export default async function Panel({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const u = await requerirUsuario('ver');
  const q = await searchParams;
  const dias = leerPeriodo(q.periodo);

  const resumen = await resumenPorRed(dias);
  if (!resumen.length) {
    return (
      <>
        <div className="encabezado">
          <div>
            <h1>Panorama</h1>
            <p>Aquí verás cómo van todas las redes del Departamento.</p>
          </div>
        </div>
        <div className="panel vacio">
          <h3>Aún no hay redes conectadas</h3>
          <p>Conecta Facebook, Instagram, YouTube, LinkedIn o X para empezar a ver estadísticas y comentarios.</p>
          {puede(u.rol, 'gestionar_cuentas') ? (
            <Link className="boton" href="/cuentas">
              <Plug aria-hidden="true" /> Conectar redes
            </Link>
          ) : (
            <p className="ayuda" style={{ marginTop: 10 }}>Pide a un administrador que conecte las cuentas.</p>
          )}
        </div>
      </>
    );
  }

  const redes = resumen.map((r) => r.red);
  const [alcanceDiario, mejores, comentarios, [pend], ultima, programadas] = await Promise.all([
    serie(dias, 'alcance'),
    mejoresPublicaciones(dias, undefined, 6),
    comentariosPorRed(dias),
    sql`select
          (select count(*)::int from publicaciones where estado = 'en_revision') as revision,
          (select count(*)::int from comentarios where estado = 'nuevo' and not es_propio) as comentarios`,
    sql`select max(ultima_sincronizacion) as t, bool_or(modo = 'demo') as demo,
          count(*) filter (where estado in ('error', 'requiere_reconexion'))::int as con_error
        from cuentas_sociales where estado <> 'desactivada'`,
    sql`select p.id, p.titulo, p.programada_para, array_agg(c.red order by c.red) as redes
        from publicaciones p join destinos_publicacion d on d.publicacion_id = p.id join cuentas_sociales c on c.id = d.cuenta_id
        where p.estado = 'programada' group by p.id order by p.programada_para limit 4`,
  ]);
  const recientes = await sql`
    select k.id, k.autor_nombre, k.texto, k.escrito_en, c.red
    from comentarios k join cuentas_sociales c on c.id = k.cuenta_id
    where k.estado = 'nuevo' and not k.es_propio order by k.escrito_en desc limit 5
  `;

  const t = resumen.reduce(
    (a, r) => ({
      seguidores: a.seguidores + r.seguidores,
      inicio: a.inicio + r.seguidoresInicio,
      alcance: a.alcance + r.alcance,
      alcanceAnt: a.alcanceAnt + r.alcanceAnterior,
      inter: a.inter + r.interacciones,
      interAnt: a.interAnt + r.interaccionesAnterior,
    }),
    { seguidores: 0, inicio: 0, alcance: 0, alcanceAnt: 0, inter: 0, interAnt: 0 },
  );
  const nuevos = t.seguidores - t.inicio;
  const tasaActual = tasa(t.inter, t.alcance);
  const tasaAnterior = tasa(t.interAnt, t.alcanceAnt);
  const sinResponder = new Map(comentarios.map((c) => [c.red as Red, c.sin_responder as number]));

  return (
    <>
      {q.sin_permiso && (
        <div className="aviso-caja alerta" role="alert">
          <TriangleAlert aria-hidden="true" />
          <span>Tu rol no tiene acceso a esa sección.</span>
        </div>
      )}
      {ultima[0].demo && (
        <div className="aviso-caja info">
          <span>
            Algunas cuentas están en <strong>modo demostración</strong>: sus cifras son simuladas y nada se publica de verdad.
            {puede(u.rol, 'gestionar_cuentas') && (
              <>
                {' '}
                Conecta las cuentas reales en <Link href="/cuentas">Cuentas de redes</Link>.
              </>
            )}
          </span>
        </div>
      )}
      {ultima[0].con_error > 0 && (
        <div className="aviso-caja error">
          <TriangleAlert aria-hidden="true" />
          <span>
            {ultima[0].con_error === 1 ? 'Una cuenta tiene' : `${ultima[0].con_error} cuentas tienen`} problemas de conexión.{' '}
            <Link href="/cuentas">Revisar cuentas</Link>
          </span>
        </div>
      )}

      <div className="encabezado">
        <div>
          <h1>Panorama</h1>
          <p>
            Las {redes.length} redes del Departamento en los últimos {dias} días. Última sincronización:{' '}
            {ultima[0].t ? hace(ultima[0].t) : 'nunca'}.
          </p>
        </div>
        <div className="acciones">
          <SelectorPeriodo actual={dias} ruta="/panel" />
          {puede(u.rol, 'sincronizar') && <BotonSincronizar accion={sincronizarAhora} />}
        </div>
      </div>

      <section className="mayor" style={{ ['--cols' as string]: 5 }} aria-label="Cifras del periodo">
        <Cifra
          etiqueta="Seguidores en total"
          valor={compacto(t.seguidores)}
          nota={
            <span>
              <span className={nuevos > 0 ? 'sube' : nuevos < 0 ? 'baja' : ''}>
                {nuevos >= 0 ? '+' : '−'}
                {numero(Math.abs(nuevos))}
              </span>{' '}
              en el periodo
            </span>
          }
        />
        <Cifra etiqueta="Alcance" valor={compacto(t.alcance)} cambio={variacion(t.alcance, t.alcanceAnt)} />
        <Cifra etiqueta="Interacciones" valor={compacto(t.inter)} cambio={variacion(t.inter, t.interAnt)} />
        <Cifra
          etiqueta="Tasa de interacción"
          valor={porcentaje(tasaActual)}
          nota={<span>interacciones ÷ alcance{tasaAnterior ? `; antes ${porcentaje(tasaAnterior)}` : ''}</span>}
        />
        <div>
          <div className="cifra-etiqueta">Pendiente</div>
          <div className="cifra">{numero(pend.comentarios)}</div>
          <div className="variacion">
            <Link href="/comentarios">comentarios sin responder</Link>
            {pend.revision > 0 && (
              <>
                {' · '}
                <Link href={puede(u.rol, 'aprobar') ? '/aprobaciones' : '/publicaciones?estado=en_revision'}>
                  {pend.revision} en revisión
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 20 }} aria-labelledby="t-audiencia">
        <div className="panel-cabeza">
          <h2 id="t-audiencia">Dónde está la audiencia</h2>
          <p>Seguidores de hoy por red</p>
        </div>
        <Estratos partes={resumen.map((r) => ({ red: r.red, valor: r.seguidores }))} />
      </section>

      <div className="rejilla dos" style={{ marginBottom: 20 }}>
        <section className="panel" aria-labelledby="t-alcance">
          <div className="panel-cabeza">
            <h2 id="t-alcance">Alcance por {dias > 31 ? 'semana' : 'día'}</h2>
            <p>Personas o vistas únicas que vieron el contenido</p>
          </div>
          <BarrasPorRed datos={alcanceDiario} redes={redes} unidad="alcance" />
        </section>

        <section className="panel" aria-labelledby="t-redes">
          <div className="panel-cabeza">
            <h2 id="t-redes">Cada red</h2>
            <p>{dias} días</p>
          </div>
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th scope="col">Red</th>
                  <th scope="col" className="num">Seguidores</th>
                  <th scope="col" className="num">Nuevos</th>
                  <th scope="col" className="num">Tasa</th>
                  <th scope="col" className="num">Sin resp.</th>
                </tr>
              </thead>
              <tbody>
                {resumen.map((r) => {
                  const n = r.seguidores - r.seguidoresInicio;
                  return (
                    <tr key={r.red}>
                      <td>
                        <Link href={`/redes/${r.red}?periodo=${dias}`} style={{ textDecoration: 'none' }}>
                          <ChipRed red={r.red} />
                        </Link>
                      </td>
                      <td className="num">{numero(r.seguidores)}</td>
                      <td className="num">
                        <span className={variacionTexto(n).clase}>{n >= 0 ? '+' : '−'}{numero(Math.abs(n))}</span>
                      </td>
                      <td className="num">{porcentaje(tasa(r.interacciones, r.alcance))}</td>
                      <td className="num">{sinResponder.get(r.red) ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="rejilla dos">
        <section className="panel" aria-labelledby="t-mejores">
          <div className="panel-cabeza">
            <h2 id="t-mejores">Publicaciones con más interacción</h2>
            <p>Me gusta, comentarios, compartidos y guardados</p>
          </div>
          {mejores.length === 0 ? (
            <p className="ayuda">No hay publicaciones en este periodo. Se cargan al sincronizar.</p>
          ) : (
            <div className="tabla-envoltura">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Publicación</th>
                    <th scope="col" className="num">Interacciones</th>
                    <th scope="col" className="num">Vistas</th>
                  </tr>
                </thead>
                <tbody>
                  {mejores.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                          <ChipRed red={p.red} />
                          <span className="ayuda">{hace(p.publicada_en)}</span>
                        </div>
                        {p.url ? (
                          <a href={p.url} target="_blank" rel="noopener noreferrer" className="texto-corto" style={{ color: 'var(--tinta)' }}>
                            {p.texto || 'Sin texto'}
                          </a>
                        ) : (
                          <span className="texto-corto">{p.texto || 'Sin texto'}</span>
                        )}
                      </td>
                      <td className="num">{numero(p.interacciones)}</td>
                      <td className="num">{p.vistas ? numero(p.vistas) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="rejilla" style={{ alignContent: 'start' }}>
          <section className="panel" aria-labelledby="t-comentarios">
            <div className="panel-cabeza">
              <h2 id="t-comentarios">Esperan respuesta</h2>
              <Link href="/comentarios" className="ayuda">Ver bandeja</Link>
            </div>
            {recientes.length === 0 ? (
              <p className="ayuda">No hay comentarios pendientes.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
                {recientes.map((c) => (
                  <li key={c.id}>
                    <Link href={`/comentarios?c=${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--t-s)' }}>
                        <ChipRed red={c.red} texto={c.autor_nombre} />
                        <span className="ayuda" style={{ marginLeft: 'auto' }}>{hace(c.escrito_en)}</span>
                      </div>
                      <p className="texto-corto" style={{ fontSize: 'var(--t-s)', color: 'var(--tinta-2)', marginTop: 2 }}>{c.texto}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel" aria-labelledby="t-programadas">
            <div className="panel-cabeza">
              <h2 id="t-programadas">Próximas publicaciones</h2>
              <Link href="/publicaciones?estado=programada" className="ayuda">Ver todas</Link>
            </div>
            {programadas.length === 0 ? (
              <p className="ayuda">No hay publicaciones programadas.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                {programadas.map((p) => (
                  <li key={p.id}>
                    <Link href={`/publicaciones/${p.id}`} style={{ fontWeight: 600, color: 'var(--tinta)', textDecoration: 'none' }}>
                      {p.titulo}
                    </Link>
                    <div className="ayuda">
                      {fechaHora(p.programada_para)} · {[...new Set<string>(p.redes)].map((r) => INFO_RED[r as Red].nombre).join(', ')}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
