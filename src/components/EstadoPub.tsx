import { ESTADOS_PUBLICACION, type EstadoPublicacion } from '@/lib/redes';

export function EstadoPub({ estado }: { estado: EstadoPublicacion }) {
  const e = ESTADOS_PUBLICACION[estado];
  return <span className={`etiqueta ${e.clase}`}>{e.nombre}</span>;
}
