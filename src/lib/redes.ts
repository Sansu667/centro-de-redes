// Datos de cada red que la interfaz y el servidor comparten.

export type Red = 'facebook' | 'instagram' | 'youtube' | 'linkedin' | 'x';
export type TipoPublicacion = 'publicacion' | 'historia' | 'reel' | 'video';

export const REDES: Red[] = ['facebook', 'instagram', 'youtube', 'linkedin', 'x'];

type InfoRed = {
  nombre: string;
  sigla: string;
  color: string;
  limiteTexto: number;
  tipos: TipoPublicacion[];
  /** Tipos que exigen al menos un archivo y de qué clase. */
  requiereMedio: Partial<Record<TipoPublicacion, 'imagen' | 'video' | 'cualquiera'>>;
  maxArchivos: number;
  ocultaComentarios: boolean;
  nota?: string;
};

export const INFO_RED: Record<Red, InfoRed> = {
  facebook: {
    nombre: 'Facebook',
    sigla: 'FB',
    color: 'var(--red-facebook)',
    limiteTexto: 63206,
    tipos: ['publicacion', 'historia', 'reel', 'video'],
    requiereMedio: { historia: 'imagen', reel: 'video', video: 'video' },
    maxArchivos: 10,
    ocultaComentarios: true,
  },
  instagram: {
    nombre: 'Instagram',
    sigla: 'IG',
    color: 'var(--red-instagram)',
    limiteTexto: 2200,
    tipos: ['publicacion', 'historia', 'reel'],
    requiereMedio: { publicacion: 'cualquiera', historia: 'cualquiera', reel: 'video' },
    maxArchivos: 10,
    ocultaComentarios: true,
  },
  youtube: {
    nombre: 'YouTube',
    sigla: 'YT',
    color: 'var(--red-youtube)',
    limiteTexto: 5000,
    tipos: ['video'],
    requiereMedio: { video: 'video' },
    maxArchivos: 1,
    ocultaComentarios: true,
    nota: 'YouTube solo admite subir videos por API. El título de la publicación se usa como título del video.',
  },
  linkedin: {
    nombre: 'LinkedIn',
    sigla: 'Li',
    color: 'var(--red-linkedin)',
    limiteTexto: 3000,
    tipos: ['publicacion', 'video'],
    requiereMedio: { video: 'video' },
    maxArchivos: 9,
    ocultaComentarios: false,
  },
  x: {
    nombre: 'X',
    sigla: 'X',
    color: 'var(--red-x)',
    limiteTexto: 280,
    tipos: ['publicacion', 'video'],
    requiereMedio: { video: 'video' },
    maxArchivos: 4,
    ocultaComentarios: true,
  },
};

export const NOMBRE_TIPO: Record<TipoPublicacion, string> = {
  publicacion: 'Publicación',
  historia: 'Historia',
  reel: 'Reel',
  video: 'Video',
};

export const DESCRIPCION_TIPO: Record<TipoPublicacion, string> = {
  publicacion: 'Texto con imágenes o enlace, en el muro o feed.',
  historia: 'Imagen o video vertical 9:16 que dura 24 horas.',
  reel: 'Video vertical corto.',
  video: 'Video horizontal o vertical en el canal o el muro.',
};

export const ESTADOS_PUBLICACION = {
  borrador: { nombre: 'Borrador', clase: '' },
  en_revision: { nombre: 'En revisión', clase: 'aviso' },
  aprobada: { nombre: 'Aprobada', clase: 'info' },
  rechazada: { nombre: 'Rechazada', clase: 'critico' },
  programada: { nombre: 'Programada', clase: 'info' },
  publicando: { nombre: 'Publicando', clase: 'info' },
  publicada: { nombre: 'Publicada', clase: 'ok' },
  parcial: { nombre: 'Publicada en parte', clase: 'grave' },
  fallida: { nombre: 'Falló', clase: 'critico' },
} as const;

export type EstadoPublicacion = keyof typeof ESTADOS_PUBLICACION;

/** Valida el texto y los archivos de una publicación contra las reglas de una red. */
export function problemasParaRed(
  red: Red,
  tipo: TipoPublicacion,
  texto: string,
  medios: { mime: string }[],
): string[] {
  const info = INFO_RED[red];
  const p: string[] = [];
  if (!info.tipos.includes(tipo)) p.push(`${info.nombre} no admite ${NOMBRE_TIPO[tipo].toLowerCase()}s.`);
  if (texto.length > info.limiteTexto) p.push(`El texto pasa el límite de ${info.limiteTexto.toLocaleString('es-CO')} caracteres de ${info.nombre}.`);
  const req = info.requiereMedio[tipo];
  const videos = medios.filter((m) => m.mime.startsWith('video/')).length;
  const imagenes = medios.filter((m) => m.mime.startsWith('image/')).length;
  if (req === 'video' && videos === 0) p.push(`${info.nombre} necesita un video para este tipo.`);
  if (req === 'imagen' && imagenes === 0) p.push(`${info.nombre} necesita una imagen para este tipo.`);
  if (req === 'cualquiera' && medios.length === 0) p.push(`${info.nombre} necesita al menos una imagen o un video.`);
  if (medios.length > info.maxArchivos) p.push(`${info.nombre} acepta como máximo ${info.maxArchivos} archivo(s).`);
  if ((tipo === 'historia' || tipo === 'reel' || tipo === 'video') && medios.length > 1) {
    p.push(`${NOMBRE_TIPO[tipo]} lleva un solo archivo.`);
  }
  if (videos > 0 && imagenes > 0 && red !== 'instagram' && red !== 'facebook') {
    p.push(`${info.nombre} no mezcla imágenes y video en una misma publicación.`);
  }
  if (red === 'x' && videos > 1) p.push('X acepta un solo video por publicación.');
  if (!texto.trim() && medios.length === 0) p.push('Escribe un texto o agrega un archivo.');
  return p;
}
