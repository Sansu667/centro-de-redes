import Link from 'next/link';
import { requerirUsuario } from '@/lib/auth';
import { sql } from '@/lib/db';
import { fechaHora } from '@/lib/formato';

export const metadata = { title: 'Bitácora' };

const TIPOS = [
  { clave: '', nombre: 'Todo' },
  { clave: 'ingreso', nombre: 'Ingresos' },
  { clave: 'publicacion', nombre: 'Publicaciones' },
  { clave: 'comentario', nombre: 'Comentarios' },
  { clave: 'usuario', nombre: 'Usuarios' },
  { clave: 'cuenta', nombre: 'Cuentas' },
  { clave: 'seguridad', nombre: 'Seguridad' },
];

export default async function Bitacora({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requerirUsuario('ver_bitacora');
  const q = await searchParams;
  const tipo = TIPOS.find((t) => t.clave === q.tipo)?.clave ?? '';
  const antesDe = Number(q.antes) || null;
  const filas = await sql`
    select b.id, b.accion, b.entidad, b.entidad_id, b.detalles, b.ip, b.creado_en, u.nombre
    from bitacora b left join usuarios u on u.id = b.usuario_id
    where true ${tipo ? sql`and b.accion like ${tipo + '.%'}` : sql``} ${antesDe ? sql`and b.id < ${antesDe}` : sql``}
    order by b.id desc limit 60
  `;
  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Bitácora</h1>
          <p>Registro de todo lo que se hace en la app. No se puede editar ni borrar, ni siquiera desde la base de datos.</p>
        </div>
      </div>
      <nav className="segmentado" aria-label="Tipo de evento" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        {TIPOS.map((t) => (
          <Link key={t.clave} href={`/bitacora${t.clave ? `?tipo=${t.clave}` : ''}`} aria-current={t.clave === tipo ? 'true' : undefined}>
            {t.nombre}
          </Link>
        ))}
      </nav>
      <section className="panel">
        <div className="tabla-envoltura">
          <table>
            <thead>
              <tr>
                <th scope="col">Cuándo</th>
                <th scope="col">Quién</th>
                <th scope="col">Acción</th>
                <th scope="col">Detalle</th>
                <th scope="col">IP</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fechaHora(f.creado_en)}</td>
                  <td>{f.nombre ?? 'Sistema'}</td>
                  <td>
                    <code>{f.accion}</code>
                    {f.entidad === 'publicacion' && f.entidad_id && (
                      <div><Link href={`/publicaciones/${f.entidad_id}`} className="ayuda">Ver publicación</Link></div>
                    )}
                  </td>
                  <td>
                    <span className="texto-corto ayuda" style={{ maxWidth: '44ch' }}>
                      {Object.keys(f.detalles ?? {}).length ? JSON.stringify(f.detalles) : '—'}
                    </span>
                  </td>
                  <td className="ayuda">{f.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filas.length === 60 && (
          <div className="paginacion">
            <span />
            <Link className="boton secundario chico" href={`/bitacora?${tipo ? `tipo=${tipo}&` : ''}antes=${filas[filas.length - 1].id}`}>
              Más antiguos
            </Link>
          </div>
        )}
      </section>
    </>
  );
}
