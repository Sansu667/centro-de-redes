import { INFO_RED, type Red } from '@/lib/redes';

/** Monograma de la red: sigla sobre el color de identidad de la red. */
export function IconoRed({ red, tam = 18 }: { red: Red; tam?: number }) {
  const info = INFO_RED[red];
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" role="img" aria-label={info.nombre} style={{ flex: 'none' }}>
      <rect width="24" height="24" rx="6" fill={info.color} />
      <text
        x="12"
        y="16.2"
        textAnchor="middle"
        fontSize={info.sigla.length > 1 ? 10.5 : 13}
        fontWeight="700"
        fill="#fff"
        fontFamily="Source Sans 3, system-ui, sans-serif"
      >
        {info.sigla}
      </text>
    </svg>
  );
}

export function ChipRed({ red, texto }: { red: Red; texto?: string }) {
  return (
    <span className="red-chip">
      <IconoRed red={red} tam={15} />
      {texto ?? INFO_RED[red].nombre}
    </span>
  );
}
