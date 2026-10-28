import Link from 'next/link';
import { SquarePen } from 'lucide-react';
import { requerirUsuario } from '@/lib/auth';
import { sql } from '@/lib/db';
import { puede } from '@/lib/roles';
import { NOMBRE_TIPO, type EstadoPublicacion, type Red, type TipoPublicacion } from '@/lib/redes';
import { fechaHora, hace } from '@/lib/formato';
import { EstadoPub } from '@/components/EstadoPub';
import { IconoRed } from '@/components/IconoRed';

export const metadata = { title: 'Publicaciones' };

const FILTROS: { clave: string; nombre: string; estados: EstadoPublicacion[] | null }[] = [
  { clave: 'todas', nombre: 'Todas', estados: null },
  { clave: 'borrador', nombre: 'Borradores', estados: ['borrador'] },
  { clave: 'en_revision', nombre: 'En revisión', estados: ['en_revision'] },
  { clave: 'programada', nombre: 'Programadas', estados: ['programada', 'aprobada'] },
  { clave: 'publicada', nombre: 'Publicadas', estados: ['publicada', 'parcial'] },
  { clave: 'problemas', nombre: 'Con problemas', estados: ['rechazada', 'fallida', 'parcial'] },
];

export default async function Publicaciones({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const u = await requerirUsuario('ver');
  const q = await searchParams;
  const filtro = FILTROS.find((f) => f.clave === q.estado) ?? FILTROS[0];
  const pagina = Math.max(1, Number(q.p) || 1);
  const porPagina = 25;
  const busqueda = (q.q ?? '').trim().slice(0, 100);

  const filas = await sql`
    select p.id, p.titulo, p.texto, p.tipo, p.estado, p.programada_para, p.actualizada_en, p.creada_en,
      autor.nombre as autor,
      coalesce(array_agg(distinct c.red) filter (where c.red is not null), '{}') as redes,
      count(*) over() as total
    from publicaciones p
    left join usuarios autor on autor.id = p.creada_por
    left join destinos_publicacion d on d.publicacion_id = p.id
    left join cuentas_sociales c on c.id = d.cuenta_id
    where true
      ${filtro.estados ? sql`and p.estado in ${sql(filtro.estados)}` : sql``}
      ${busqueda ? sql`and (p.titulo ilike ${'%' + busqueda + '%'} or p.texto ilike ${'%' + busqueda + '%'})` : sql``}
    group by p.id, autor.nombre
    order by coalesce(p.programada_para, p.actualizada_en) desc
    limit ${porPagina} offset ${(pagina - 1) * porPagina}
  `;
  const total = Number(filas[0]?.total ?? 0);

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Publicaciones</h1>
          <p>Todo lo que se ha preparado desde la app, con su estado en cada red.</p>
        </div>
        {puede(u.rol, 'crear_publicacion') && (
          <Link href="/publicar" className="boton">
            <SquarePen aria-hidden="true" /> Nueva publicación
          </Link>
        )}
      </div>

      <div className="acciones" style={{ marginBottom: 16, justifyContent: 'space-between' }}>
        <nav className="segmentado" aria-label="Filtrar por estado">
          {FILTROS.map((f) => (
            <Link key={f.clave} href={`/publicaciones?estado=${f.clave}`} aria-current={f.clave === filtro.clave ? 'true' : undefined}>
              {f.nombre}
            </Link>
          ))}
        </nav>
        <form role="search" style={{ minWidth: 240 }}>
          <input type="hidden" name="estado" value={filtro.clave} />
          <input type="search" name="q" defaultValue={busqueda} placeholder="Buscar por título o texto" aria-label="Buscar publicaciones" />
        </form>
      </div>

      <section className="panel">
        {filas.length === 0 ? (
          <div className="vacio">
            <h3>No hay publicaciones aquí</h3>
            <p>{busqueda ? 'Prueba con otras palabras.' : 'Cuando prepares una publicación aparecerá en esta lista.'}</p>
          </div>
        ) : (
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th scope="col">Publicación</th>
                  <th scope="col">Redes</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Autor</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/publicaciones/${p.id}`} style={{ fontWeight: 600, color: 'var(--tinta)', textDecoration: 'none' }}>
                        {p.titulo}
                      </Link>
                      <div className="ayuda">{NOMBRE_TIPO[p.tipo as TipoPublicacion]}</div>
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', gap: 4 }}>
                        {(p.redes as Red[]).map((r) => (
                          <IconoRed key={r} red={r} tam={18} />
                        ))}
                      </span>
                    </td>
                    <td><EstadoPub estado={p.estado} /></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {p.programada_para && ['programada', 'aprobada'].includes(p.estado) ? fechaHora(p.programada_para) : hace(p.actualizada_en)}
                    </td>
                    <td>{p.autor ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > porPagina && (
          <div className="paginacion">
            <span>
              {(pagina - 1) * porPagina + 1}–{Math.min(total, pagina * porPagina)} de {total}
            </span>
            <span className="acciones">
              {pagina > 1 && <Link className="boton secundario chico" href={`/publicaciones?estado=${filtro.clave}&q=${encodeURIComponent(busqueda)}&p=${pagina - 1}`}>Anteriores</Link>}
              {pagina * porPagina < total && <Link className="boton secundario chico" href={`/publicaciones?estado=${filtro.clave}&q=${encodeURIComponent(busqueda)}&p=${pagina + 1}`}>Siguientes</Link>}
            </span>
          </div>
        )}
      </section>
    </>
  );
}
