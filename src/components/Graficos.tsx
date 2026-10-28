'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { INFO_RED, type Red } from '@/lib/redes';

const COLOR: Record<Red, string> = {
  facebook: '#2a78d6',
  instagram: '#c2408e',
  youtube: '#e2562f',
  linkedin: '#14917a',
  x: '#6250d6',
};

const fmt = new Intl.NumberFormat('es-CO');
const fmtCorto = (n: number) =>
  Math.abs(n) >= 10_000 ? new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 }).format(n) : fmt.format(n);

function etiquetaDia(d: string) {
  const [, m, dd] = d.split('-').map(Number);
  return `${dd} ${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][m - 1]}`;
}

type Punto = { dia: string } & Partial<Record<Red, number>>;

function Info({ active, payload, label, redes, unidad }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((a: number, p: any) => a + (Number(p.value) || 0), 0);
  return (
    <div className="tooltip-grafico">
      <div className="titulo">{String(label).includes('–') ? label : etiquetaDia(label)}</div>
      {[...payload].reverse().map((p: any) => (
        <div className="fila" key={p.dataKey}>
          <span>
            <span className="punto-red" style={{ background: COLOR[p.dataKey as Red] }} />
            {INFO_RED[p.dataKey as Red].nombre}
          </span>
          <strong>{fmt.format(p.value ?? 0)}</strong>
        </div>
      ))}
      {redes.length > 1 && (
        <div className="fila" style={{ borderTop: '1px solid var(--piedra-200)', marginTop: 5, paddingTop: 5 }}>
          <span>Total {unidad}</span>
          <strong>{fmt.format(total)}</strong>
        </div>
      )}
    </div>
  );
}

function Leyenda({ redes }: { redes: Red[] }) {
  if (redes.length < 2) return null;
  return (
    <div className="leyenda-grafico" aria-hidden="true">
      {redes.map((r) => (
        <span key={r}>
          <span className="punto-red" style={{ background: COLOR[r] }} />
          {INFO_RED[r].nombre}
        </span>
      ))}
    </div>
  );
}

/** Agrupa por semana cuando el periodo es largo, para que las barras se lean. */
function agrupar(datos: Punto[], redes: Red[]): Punto[] {
  if (datos.length <= 31) return datos;
  const salida: Punto[] = [];
  for (let i = 0; i < datos.length; i += 7) {
    const trozo = datos.slice(i, i + 7);
    const p: Punto = { dia: `${etiquetaDia(trozo[0].dia)} – ${etiquetaDia(trozo[trozo.length - 1].dia)}` };
    for (const r of redes) p[r] = trozo.reduce((a, x) => a + (x[r] ?? 0), 0);
    salida.push(p);
  }
  return salida;
}

export function BarrasPorRed({ datos, redes, unidad, alto = 280 }: { datos: Punto[]; redes: Red[]; unidad: string; alto?: number }) {
  const serie = agrupar(datos, redes);
  const semanal = serie !== datos;
  return (
    <div>
      <Leyenda redes={redes} />
      <div style={{ width: '100%', height: alto }} role="img" aria-label={`Barras de ${unidad} por ${semanal ? 'semana' : 'día'} y por red`}>
        <ResponsiveContainer>
          <BarChart data={serie} margin={{ top: 6, right: 4, bottom: 0, left: 0 }} barCategoryGap={serie.length > 20 ? 2 : 6}>
            <CartesianGrid vertical={false} stroke="#e9ece6" />
            <XAxis
              dataKey="dia"
              tickFormatter={(d) => (semanal ? String(d).split(' – ')[0] : etiquetaDia(d))}
              tick={{ fontSize: 12, fill: '#6f7a72' }}
              tickLine={false}
              axisLine={{ stroke: '#c5ccc3' }}
              interval="preserveStartEnd"
              minTickGap={18}
            />
            <YAxis tickFormatter={fmtCorto} tick={{ fontSize: 12, fill: '#6f7a72' }} tickLine={false} axisLine={false} width={48} />
            <Tooltip cursor={{ fill: 'rgba(24,36,27,0.05)' }} content={<Info redes={redes} unidad={unidad} />} />
            {redes.map((r, i) => (
              <Bar
                key={r}
                dataKey={r}
                stackId="a"
                fill={COLOR[r]}
                stroke="#fff"
                strokeWidth={1}
                radius={i === redes.length - 1 ? [3, 3, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function LineaRed({ datos, red, unidad, alto = 220 }: { datos: Punto[]; red: Red; unidad: string; alto?: number }) {
  const valores = datos.map((d) => d[red] ?? 0).filter((v) => v > 0);
  const min = valores.length ? Math.min(...valores) : 0;
  const max = valores.length ? Math.max(...valores) : 0;
  const margen = Math.max(1, Math.round((max - min) * 0.15));
  return (
    <div style={{ width: '100%', height: alto }} role="img" aria-label={`Línea de ${unidad} de ${INFO_RED[red].nombre}`}>
      <ResponsiveContainer>
        <LineChart data={datos} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#e9ece6" />
          <XAxis
            dataKey="dia"
            tickFormatter={etiquetaDia}
            tick={{ fontSize: 12, fill: '#6f7a72' }}
            tickLine={false}
            axisLine={{ stroke: '#c5ccc3' }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            domain={[Math.max(0, min - margen), max + margen]}
            tickFormatter={fmtCorto}
            tick={{ fontSize: 12, fill: '#6f7a72' }}
            tickLine={false}
            axisLine={false}
            width={52}
          />
          <Tooltip content={<Info redes={[red]} unidad={unidad} />} cursor={{ stroke: '#c5ccc3' }} />
          <Line type="monotone" dataKey={red} stroke={COLOR[red]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
