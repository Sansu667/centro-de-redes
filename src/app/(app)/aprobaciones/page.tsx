import Link from 'next/link';
import { requerirUsuario } from '@/lib/auth';
import { sql } from '@/lib/db';
import { NOMBRE_TIPO, type Red, type TipoPublicacion } from '@/lib/redes';
import { fechaHora, hace } from '@/lib/formato';
import { IconoRed } from '@/components/IconoRed';

export const metadata = { title: 'Aprobaciones' };

export default async function Aprobaciones() {
  await requerirUsuario('aprobar');
  const filas = await sql`
    select p.id, p.titulo, p.texto, p.tipo, p.enviada_en, p.programada_para, a.nombre as autor,
      coalesce(array_agg(distinct c.red) filter (where c.red is not null), '{}') as redes,
      (select count(*)::int from archivos f where f.publicacion_id = p.id) as archivos
    from publicaciones p
    left join usuarios a on a.id = p.creada_por
    left join destinos_publicacion d on d.publicacion_id = p.id
    left join cuentas_sociales c on c.id = d.cuenta_id
    where p.estado = 'en_revision'
    group by p.id, a.nombre
    order by coalesce(p.programada_para, p.enviada_en) asc
  `;
  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Aprobaciones</h1>
          <p>Publicaciones que esperan visto bueno. Las que tienen fecha más cercana van primero.</p>
        </div>
      </div>
      {filas.length === 0 ? (
        <div className="panel vacio">
          <h3>No hay nada por revisar</h3>
          <p>Cuando alguien envíe una publicación a revisión, aparecerá aquí.</p>
        </div>
      ) : (
        <div className="rejilla">
          {filas.map((p) => (
            <article key={p.id} className="panel" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 16, alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                  {(p.redes as Red[]).map((r) => <IconoRed key={r} red={r} />)}
                  <span className="ayuda">
                    {NOMBRE_TIPO[p.tipo as TipoPublicacion]} · {p.archivos} archivo(s) · enviada {hace(p.enviada_en)} por {p.autor ?? '—'}
                  </span>
                </div>
                <h2>
                  <Link href={`/publicaciones/${p.id}`} style={{ color: 'var(--tinta)', textDecoration: 'none' }}>{p.titulo}</Link>
                </h2>
                <p className="texto-corto" style={{ color: 'var(--tinta-2)', marginTop: 4 }}>{p.texto}</p>
                {p.programada_para && <p className="ayuda" style={{ marginTop: 4 }}>Programada para {fechaHora(p.programada_para)}</p>}
              </div>
              <Link className="boton" href={`/publicaciones/${p.id}`}>Revisar</Link>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
