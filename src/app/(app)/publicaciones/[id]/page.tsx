import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink, TriangleAlert } from 'lucide-react';
import { requerirUsuario } from '@/lib/auth';
import { sql } from '@/lib/db';
import { puede } from '@/lib/roles';
import { autoaprobacionPermitida } from '@/lib/ajustes';
import { mediosDe } from '@/lib/medios';
import { INFO_RED, NOMBRE_TIPO, type Red, type TipoPublicacion } from '@/lib/redes';
import { fechaHora } from '@/lib/formato';
import { EstadoPub } from '@/components/EstadoPub';
import { ChipRed } from '@/components/IconoRed';
import { AccionesPublicacion } from '@/components/AccionesPublicacion';
import { aprobar, cancelarProgramacion, eliminar, enviarARevision, rechazar, reintentar } from '../acciones';

export const metadata = { title: 'Publicación' };

const ACCIONES_BITACORA: Record<string, string> = {
  'publicacion.creada': 'Creó la publicación',
  'publicacion.editada': 'Editó la publicación',
  'publicacion.enviada_revision': 'La envió a revisión',
  'publicacion.aprobada': 'La aprobó',
  'publicacion.rechazada': 'La rechazó',
  'publicacion.publicada': 'Resultado de la publicación',
  'publicacion.publicar_ahora': 'Pidió publicarla ahora',
  'publicacion.programacion_cancelada': 'Quitó la programación',
};

const ESTADO_DESTINO: Record<string, { nombre: string; clase: string }> = {
  pendiente: { nombre: 'Pendiente', clase: '' },
  publicando: { nombre: 'Publicando', clase: 'info' },
  publicada: { nombre: 'Publicada', clase: 'ok' },
  fallida: { nombre: 'Falló', clase: 'critico' },
};

export default async function Detalle({ params }: { params: Promise<{ id: string }> }) {
  const u = await requerirUsuario('ver');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [p] = await sql`
    select p.*, a.nombre as autor, r.nombre as revisor
    from publicaciones p left join usuarios a on a.id = p.creada_por left join usuarios r on r.id = p.revisada_por
    where p.id = ${id}
  `;
  if (!p) notFound();
  const [destinos, medios, historial] = await Promise.all([
    sql`select d.*, c.red, c.nombre, c.usuario_red, c.modo from destinos_publicacion d join cuentas_sociales c on c.id = d.cuenta_id
        where d.publicacion_id = ${id} order by c.red`,
    mediosDe(id),
    sql`select b.accion, b.detalles, b.creado_en, u.nombre from bitacora b left join usuarios u on u.id = b.usuario_id
        where b.entidad = 'publicacion' and b.entidad_id = ${id} order by b.creado_en`,
  ]);

  const aprobador = puede(u.rol, 'aprobar');
  const propia = p.creada_por === u.id;
  const auto = await autoaprobacionPermitida();
  const editable = aprobador
    ? ['borrador', 'rechazada', 'en_revision', 'aprobada', 'programada', 'fallida'].includes(p.estado)
    : propia && ['borrador', 'rechazada', 'en_revision'].includes(p.estado);

  return (
    <>
      <div className="encabezado">
        <div>
          <p style={{ marginTop: 0, marginBottom: 6 }}>
            <Link href="/publicaciones">Publicaciones</Link>
          </p>
          <h1>{p.titulo}</h1>
          <p style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <EstadoPub estado={p.estado} />
            <span>{NOMBRE_TIPO[p.tipo as TipoPublicacion]}</span>
            {p.programada_para && <span>· programada para {fechaHora(p.programada_para)}</span>}
          </p>
        </div>
      </div>

      {p.estado === 'rechazada' && p.motivo_rechazo && (
        <div className="aviso-caja alerta" role="status">
          <TriangleAlert aria-hidden="true" />
          <span>
            <strong>{p.revisor ?? 'Un aprobador'} la rechazó:</strong> {p.motivo_rechazo}
          </span>
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <AccionesPublicacion
          id={id}
          puedeAprobar={aprobador && p.estado === 'en_revision'}
          esPropiaSinAutoaprobacion={propia && !auto}
          puedeEditar={editable}
          puedeEnviar={(propia || aprobador) && ['borrador', 'rechazada'].includes(p.estado) && puede(u.rol, 'crear_publicacion')}
          puedeEliminar={(propia || u.rol === 'admin') && ['borrador', 'rechazada'].includes(p.estado)}
          puedeReintentar={aprobador && ['aprobada', 'fallida', 'parcial', 'programada'].includes(p.estado)}
          puedeCancelar={aprobador && p.estado === 'programada'}
          acciones={{ aprobar, rechazar, enviarARevision, reintentar, cancelarProgramacion, eliminar }}
        />
      </div>

      <div className="rejilla dos">
        <div className="rejilla" style={{ alignContent: 'start' }}>
          <section className="panel" aria-labelledby="t-texto">
            <div className="panel-cabeza">
              <h2 id="t-texto">Texto</h2>
              <p>{p.texto.length.toLocaleString('es-CO')} caracteres</p>
            </div>
            <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{p.texto || <span className="ayuda">Sin texto</span>}</p>
            {p.enlace && (
              <p style={{ marginTop: 12 }}>
                <a href={p.enlace} target="_blank" rel="noopener noreferrer">{p.enlace}</a>
              </p>
            )}
            {medios.length > 0 && (
              <div className="miniaturas" style={{ marginTop: 16 }}>
                {medios.map((m) => (
                  <a key={m.id} className="miniatura" href={m.urlInterna} target="_blank" rel="noopener noreferrer" style={{ width: 120, height: 120 }}>
                    {m.mime.startsWith('video/') ? (
                      <video src={m.urlInterna} muted preload="metadata" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.urlInterna} alt={m.nombre} />
                    )}
                  </a>
                ))}
              </div>
            )}
          </section>

          <section className="panel" aria-labelledby="t-destinos">
            <div className="panel-cabeza">
              <h2 id="t-destinos">En cada red</h2>
            </div>
            {destinos.length === 0 ? (
              <p className="ayuda">Aún no se eligieron redes.</p>
            ) : (
              <div className="tabla-envoltura">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Cuenta</th>
                      <th scope="col">Estado</th>
                      <th scope="col">Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {destinos.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <ChipRed red={d.red as Red} texto={`${INFO_RED[d.red as Red].nombre} · ${d.usuario_red || d.nombre}`} />
                          {d.modo === 'demo' && <div className="ayuda">Demostración: no se publica de verdad</div>}
                          {d.texto_propio && <div className="ayuda">Con texto propio</div>}
                        </td>
                        <td><span className={`etiqueta ${ESTADO_DESTINO[d.estado].clase}`}>{ESTADO_DESTINO[d.estado].nombre}</span></td>
                        <td>
                          {d.error && <span style={{ color: 'var(--critico)', fontSize: 'var(--t-s)' }}>{d.error}</span>}
                          {d.url_externa && (
                            <a href={d.url_externa} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                              Ver en {INFO_RED[d.red as Red].nombre} <ExternalLink size={14} aria-hidden="true" />
                            </a>
                          )}
                          {d.publicada_en && <div className="ayuda">{fechaHora(d.publicada_en)}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <section className="panel" aria-labelledby="t-historial" style={{ alignSelf: 'start' }}>
          <div className="panel-cabeza">
            <h2 id="t-historial">Historial</h2>
          </div>
          <dl className="lista-definicion" style={{ marginBottom: 18 }}>
            <dt>Autor</dt>
            <dd>{p.autor ?? '—'}</dd>
            <dt>Revisó</dt>
            <dd>{p.revisor ?? '—'}</dd>
            <dt>Creada</dt>
            <dd>{fechaHora(p.creada_en)}</dd>
          </dl>
          <ol className="linea-tiempo">
            {historial.map((h, i) => (
              <li key={i}>
                <div>
                  <strong>{h.nombre ?? 'El sistema'}</strong> · {ACCIONES_BITACORA[h.accion] ?? h.accion}
                  {h.accion === 'publicacion.rechazada' && h.detalles?.motivo && <>: “{h.detalles.motivo}”</>}
                  {h.accion === 'publicacion.publicada' && (
                    <>: {h.detalles?.exitosas ?? 0} red(es) bien, {h.detalles?.fallidas ?? 0} con error</>
                  )}
                  <time dateTime={new Date(h.creado_en).toISOString()}>{fechaHora(h.creado_en)}</time>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
