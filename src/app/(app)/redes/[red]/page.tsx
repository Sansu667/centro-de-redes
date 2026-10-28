import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { requerirUsuario } from '@/lib/auth';
import { sql } from '@/lib/db';
import { INFO_RED, REDES, type Red } from '@/lib/redes';
import { leerPeriodo, mejoresPublicaciones, resumenPorRed, serie, tasa, variacion } from '@/lib/estadisticas';
import { compacto, hace, numero, porcentaje } from '@/lib/formato';
import { SelectorPeriodo } from '@/components/Periodo';
import { Cifra } from '@/components/Cifra';
import { BarrasPorRed, LineaRed } from '@/components/Graficos';
import { IconoRed } from '@/components/IconoRed';

export async function generateMetadata({ params }: { params: Promise<{ red: string }> }) {
  const { red } = await params;
  return { title: INFO_RED[red as Red]?.nombre ?? 'Red' };
}

export default async function PaginaRed({
  params,
  searchParams,
}: {
  params: Promise<{ red: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  await requerirUsuario('ver');
  const { red: r } = await params;
  if (!REDES.includes(r as Red)) notFound();
  const red = r as Red;
  const dias = leerPeriodo((await searchParams).periodo);
  const info = INFO_RED[red];

  const [resumen] = await resumenPorRed(dias, red);
  const cuentas = await sql`
    select nombre, usuario_red, modo, ultima_sincronizacion, estado from cuentas_sociales where red = ${red} and estado <> 'desactivada'
  `;
  if (!resumen || !cuentas.length) {
    return (
      <div className="panel vacio">
        <h3>{info.nombre} no está conectado</h3>
        <p>Cuando un administrador conecte la cuenta, aquí verás sus estadísticas.</p>
        <Link href="/cuentas" className="boton">Ir a cuentas de redes</Link>
      </div>
    );
  }

  const [seguidores, alcance, interacciones, mejores, comentarios] = await Promise.all([
    serie(dias, 'seguidores', red),
    serie(dias, red === 'youtube' ? 'vistas' : 'alcance', red),
    serie(dias, 'interacciones', red),
    mejoresPublicaciones(dias, red, 10),
    sql`select count(*)::int as total, count(*) filter (where k.estado = 'nuevo')::int as nuevos,
          percentile_cont(0.5) within group (order by extract(epoch from (respondido_en - escrito_en)) / 3600)
            filter (where respondido_en is not null) as horas_respuesta
        from comentarios k join cuentas_sociales c on c.id = k.cuenta_id
        where c.red = ${red} and not k.es_propio and k.escrito_en > now() - ${dias + ' days'}::interval`,
  ]);
  const nuevos = resumen.seguidores - resumen.seguidoresInicio;
  const crecimiento = resumen.seguidoresInicio ? nuevos / resumen.seguidoresInicio : null;
  const k = comentarios[0];

  return (
    <>
      <div className="encabezado">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <IconoRed red={red} tam={34} /> {info.nombre}
          </h1>
          <p>
            {cuentas.map((c) => c.usuario_red || c.nombre).join(', ')}
            {cuentas.some((c) => c.modo === 'demo') && ' · modo demostración'} · sincronizado {hace(cuentas[0].ultima_sincronizacion)}
          </p>
        </div>
        <SelectorPeriodo actual={dias} ruta={`/redes/${red}`} />
      </div>

      <section className="mayor" style={{ ['--cols' as string]: 5 }} aria-label="Cifras del periodo">
        <Cifra
          etiqueta={red === 'youtube' ? 'Suscriptores' : 'Seguidores'}
          valor={numero(resumen.seguidores)}
          nota={
            <span>
              <span className={nuevos > 0 ? 'sube' : nuevos < 0 ? 'baja' : ''}>
                {nuevos >= 0 ? '+' : '−'}
                {numero(Math.abs(nuevos))}
              </span>{' '}
              {crecimiento !== null && `(${porcentaje(crecimiento)})`}
            </span>
          }
        />
        <Cifra
          etiqueta={red === 'youtube' ? 'Vistas' : 'Alcance'}
          valor={compacto(red === 'youtube' ? resumen.vistas : resumen.alcance)}
          cambio={variacion(resumen.alcance, resumen.alcanceAnterior)}
        />
        <Cifra etiqueta="Interacciones" valor={compacto(resumen.interacciones)} cambio={variacion(resumen.interacciones, resumen.interaccionesAnterior)} />
        <Cifra etiqueta="Tasa de interacción" valor={porcentaje(tasa(resumen.interacciones, resumen.alcance))} nota="interacciones ÷ alcance" />
        <Cifra
          etiqueta="Comentarios"
          valor={numero(k.total)}
          nota={
            <span>
              {k.nuevos} sin responder
              {k.horas_respuesta !== null && ` · respuesta típica en ${Number(k.horas_respuesta) < 1 ? 'menos de 1 h' : `${Math.round(Number(k.horas_respuesta))} h`}`}
            </span>
          }
        />
      </section>

      <div className="rejilla mitades" style={{ marginBottom: 20 }}>
        <section className="panel" aria-labelledby="t-seg">
          <div className="panel-cabeza">
            <h2 id="t-seg">{red === 'youtube' ? 'Suscriptores' : 'Seguidores'}</h2>
            <p>Total al cierre de cada día</p>
          </div>
          <LineaRed datos={seguidores} red={red} unidad="seguidores" />
        </section>
        <section className="panel" aria-labelledby="t-alc">
          <div className="panel-cabeza">
            <h2 id="t-alc">{red === 'youtube' ? 'Vistas' : 'Alcance'}</h2>
            <p>Por {dias > 31 ? 'semana' : 'día'}</p>
          </div>
          <BarrasPorRed datos={alcance} redes={[red]} unidad={red === 'youtube' ? 'vistas' : 'alcance'} alto={220} />
        </section>
      </div>

      <section className="panel" style={{ marginBottom: 20 }} aria-labelledby="t-int">
        <div className="panel-cabeza">
          <h2 id="t-int">Interacciones</h2>
          <p>Reacciones, comentarios, compartidos y clics por {dias > 31 ? 'semana' : 'día'}</p>
        </div>
        <BarrasPorRed datos={interacciones} redes={[red]} unidad="interacciones" alto={200} />
      </section>

      <section className="panel" aria-labelledby="t-pubs">
        <div className="panel-cabeza">
          <h2 id="t-pubs">Publicaciones del periodo</h2>
          <p>Ordenadas por interacción</p>
        </div>
        {mejores.length === 0 ? (
          <p className="ayuda">No hay publicaciones registradas en este periodo.</p>
        ) : (
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th scope="col">Publicación</th>
                  <th scope="col">Fecha</th>
                  <th scope="col" className="num">Me gusta</th>
                  <th scope="col" className="num">Comentarios</th>
                  <th scope="col" className="num">Compartidos</th>
                  <th scope="col" className="num">Vistas</th>
                  <th scope="col"><span className="sr-only">Abrir</span></th>
                </tr>
              </thead>
              <tbody>
                {mejores.map((p) => (
                  <tr key={p.id}>
                    <td><span className="texto-corto">{p.texto || 'Sin texto'}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{hace(p.publicada_en)}</td>
                    <td className="num">{numero(p.me_gusta)}</td>
                    <td className="num">{numero(p.comentarios)}</td>
                    <td className="num">{numero(p.compartidos)}</td>
                    <td className="num">{p.vistas ? numero(p.vistas) : '—'}</td>
                    <td>
                      {p.url && (
                        <a href={p.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir en ${info.nombre}`}>
                          <ExternalLink size={15} aria-hidden="true" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
