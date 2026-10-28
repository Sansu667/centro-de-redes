import 'server-only';
import { sql } from './db';
import { REDES, type Red } from './redes';

export type ResumenRed = {
  red: Red;
  cuentas: number;
  seguidores: number;
  seguidoresInicio: number;
  alcance: number;
  alcanceAnterior: number;
  impresiones: number;
  interacciones: number;
  interaccionesAnterior: number;
  vistas: number;
  publicaciones: number;
};

export const PERIODOS = [7, 28, 90] as const;
export type Periodo = (typeof PERIODOS)[number];

export function leerPeriodo(v: string | undefined): Periodo {
  const n = Number(v);
  return (PERIODOS as readonly number[]).includes(n) ? (n as Periodo) : 28;
}

/** Totales por red en el periodo y en el periodo anterior de igual duración. */
export async function resumenPorRed(dias: number, red?: Red): Promise<ResumenRed[]> {
  const filas = await sql`
    with cuentas as (
      select id, red from cuentas_sociales
      where estado <> 'desactivada' ${red ? sql`and red = ${red}` : sql``}
    ),
    actual as (
      select c.red,
        sum(m.alcance)::bigint as alcance, sum(m.impresiones)::bigint as impresiones,
        sum(m.interacciones)::bigint as interacciones, sum(m.vistas)::bigint as vistas,
        sum(m.publicaciones)::bigint as publicaciones
      from metricas_diarias m join cuentas c on c.id = m.cuenta_id
      where m.dia > current_date - ${dias}::int
      group by c.red
    ),
    anterior as (
      select c.red, sum(m.alcance)::bigint as alcance, sum(m.interacciones)::bigint as interacciones
      from metricas_diarias m join cuentas c on c.id = m.cuenta_id
      where m.dia > current_date - ${dias * 2}::int and m.dia <= current_date - ${dias}::int
      group by c.red
    ),
    seg as (
      select c.red,
        sum((select seguidores from metricas_diarias x where x.cuenta_id = c.id order by dia desc limit 1))::bigint as hoy,
        sum((select seguidores from metricas_diarias x where x.cuenta_id = c.id and x.dia <= current_date - ${dias}::int
             order by dia desc limit 1))::bigint as inicio,
        count(*)::int as cuentas
      from cuentas c group by c.red
    )
    select s.red, s.cuentas, coalesce(s.hoy, 0) as seguidores, coalesce(s.inicio, s.hoy, 0) as seguidores_inicio,
      coalesce(a.alcance, 0) as alcance, coalesce(p.alcance, 0) as alcance_anterior,
      coalesce(a.impresiones, 0) as impresiones, coalesce(a.interacciones, 0) as interacciones,
      coalesce(p.interacciones, 0) as interacciones_anterior, coalesce(a.vistas, 0) as vistas,
      coalesce(a.publicaciones, 0) as publicaciones
    from seg s left join actual a on a.red = s.red left join anterior p on p.red = s.red
  `;
  return filas
    .map((f) => ({
      red: f.red as Red,
      cuentas: f.cuentas,
      seguidores: Number(f.seguidores),
      seguidoresInicio: Number(f.seguidores_inicio),
      alcance: Number(f.alcance),
      alcanceAnterior: Number(f.alcance_anterior),
      impresiones: Number(f.impresiones),
      interacciones: Number(f.interacciones),
      interaccionesAnterior: Number(f.interacciones_anterior),
      vistas: Number(f.vistas),
      publicaciones: Number(f.publicaciones),
    }))
    .sort((a, b) => REDES.indexOf(a.red) - REDES.indexOf(b.red));
}

export type PuntoSerie = { dia: string } & Partial<Record<Red, number>>;

/** Serie diaria de una métrica, una columna por red. */
export async function serie(
  dias: number,
  metrica: 'seguidores' | 'alcance' | 'impresiones' | 'interacciones' | 'vistas',
  red?: Red,
): Promise<PuntoSerie[]> {
  const col = sql(metrica);
  const filas = await sql`
    select to_char(m.dia, 'YYYY-MM-DD') as dia, c.red, sum(m.${col})::bigint as valor
    from metricas_diarias m join cuentas_sociales c on c.id = m.cuenta_id
    where c.estado <> 'desactivada' and m.dia > current_date - ${dias}::int
      ${red ? sql`and c.red = ${red}` : sql``}
    group by m.dia, c.red order by m.dia
  `;
  const mapa = new Map<string, PuntoSerie>();
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    mapa.set(d, { dia: d });
  }
  for (const f of filas) {
    const p = mapa.get(f.dia);
    if (p) p[f.red as Red] = Number(f.valor);
  }
  return [...mapa.values()];
}

export async function mejoresPublicaciones(dias: number, red?: Red, limite = 8) {
  return sql`
    select p.id, p.url, p.texto, p.tipo, p.publicada_en, p.me_gusta, p.comentarios, p.compartidos, p.guardados,
      p.vistas, p.alcance, c.red, c.nombre as cuenta,
      (p.me_gusta + p.comentarios + p.compartidos + p.guardados) as interacciones
    from publicaciones_externas p join cuentas_sociales c on c.id = p.cuenta_id
    where c.estado <> 'desactivada' and p.publicada_en > now() - ${dias + ' days'}::interval
      ${red ? sql`and c.red = ${red}` : sql``}
    order by (p.me_gusta + p.comentarios * 2 + p.compartidos * 3 + p.guardados * 2) desc, p.vistas desc
    limit ${limite}
  `;
}

export async function comentariosPorRed(dias: number) {
  return sql`
    select c.red, count(*)::int as total,
      count(*) filter (where k.estado = 'nuevo')::int as sin_responder
    from comentarios k join cuentas_sociales c on c.id = k.cuenta_id
    where not k.es_propio and k.escrito_en > now() - ${dias + ' days'}::interval
    group by c.red
  `;
}

export const tasa = (interacciones: number, alcance: number) => (alcance > 0 ? interacciones / alcance : 0);

export function variacion(actual: number, anterior: number): number | null {
  if (!anterior) return null;
  return (actual - anterior) / anterior;
}
