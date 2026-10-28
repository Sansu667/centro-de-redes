import { INFO_RED, type Red } from '@/lib/redes';
import { numero, porcentaje } from '@/lib/formato';

/** Banda horizontal con la composición de la audiencia: cada estrato es una red. */
export function Estratos({ partes }: { partes: { red: Red; valor: number }[] }) {
  const total = partes.reduce((a, p) => a + p.valor, 0);
  if (!total) return null;
  return (
    <div>
      <div className="estratos" role="img" aria-label="Distribución de seguidores por red">
        {partes.map((p) => (
          <span key={p.red} style={{ width: `${(p.valor / total) * 100}%`, background: INFO_RED[p.red].color }} title={`${INFO_RED[p.red].nombre}: ${numero(p.valor)}`} />
        ))}
      </div>
      <div className="estratos-leyenda">
        {partes.map((p) => (
          <span key={p.red}>
            <span className="punto-red" style={{ background: INFO_RED[p.red].color, marginRight: 6 }} />
            {INFO_RED[p.red].nombre} <b>{porcentaje(p.valor / total, 0)}</b> · {numero(p.valor)}
          </span>
        ))}
      </div>
    </div>
  );
}
