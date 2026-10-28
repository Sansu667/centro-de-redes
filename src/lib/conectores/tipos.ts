import type { Red, TipoPublicacion } from '../redes';

export type CuentaConectada = {
  id: string;
  red: Red;
  nombre: string;
  usuario_red: string | null;
  id_externo: string | null;
  modo: 'demo' | 'real';
  token: string | null;
  refresh: string | null;
  token_expira_en: Date | null;
  datos: Record<string, unknown>;
};

export type ContenidoAPublicar = {
  tipo: TipoPublicacion;
  titulo: string;
  texto: string;
  enlace: string | null;
  medios: { id: string; url: string; mime: string; nombre: string; tamano: number }[];
};

export type ResultadoPublicacion = { idExterno: string; url: string | null };

export type ComentarioEntrante = {
  idExterno: string;
  idPadreExterno: string | null;
  publicacionExternaId: string | null;
  autorNombre: string;
  autorUsuario: string | null;
  autorAvatar: string | null;
  texto: string;
  escritoEn: Date;
  esPropio: boolean;
};

export type MetricaDia = {
  dia: string; // AAAA-MM-DD
  seguidores?: number;
  alcance?: number;
  impresiones?: number;
  interacciones?: number;
  vistas?: number;
  publicaciones?: number;
};

export type PublicacionExterna = {
  idExterno: string;
  url: string | null;
  texto: string | null;
  tipo: string | null;
  publicadaEn: Date | null;
  meGusta?: number;
  comentarios?: number;
  compartidos?: number;
  guardados?: number;
  vistas?: number;
  alcance?: number;
};

export interface Conector {
  publicar(cuenta: CuentaConectada, c: ContenidoAPublicar): Promise<ResultadoPublicacion>;
  comentarios(cuenta: CuentaConectada, publicaciones: PublicacionExterna[]): Promise<ComentarioEntrante[]>;
  responder(
    cuenta: CuentaConectada,
    comentario: { idExterno: string; publicacionExternaId: string | null },
    texto: string,
  ): Promise<{ idExterno: string }>;
  ocultar?(cuenta: CuentaConectada, idExterno: string, ocultar: boolean): Promise<void>;
  metricas(cuenta: CuentaConectada, dias: number): Promise<MetricaDia[]>;
  publicacionesRecientes(cuenta: CuentaConectada): Promise<PublicacionExterna[]>;
}

export class ErrorRed extends Error {
  constructor(
    mensaje: string,
    public readonly requiereReconexion = false,
  ) {
    super(mensaje);
  }
}

/** fetch con tiempo límite y mensajes de error legibles de las APIs. */
export async function pedir<T = any>(url: string, init: RequestInit & { tiempo?: number } = {}): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.tiempo ?? 30_000);
  let r: Response;
  try {
    r = await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    throw new ErrorRed(`No hubo respuesta de ${new URL(url).host}: ${(e as Error).message}`);
  } finally {
    clearTimeout(t);
  }
  const texto = await r.text();
  let cuerpo: any = null;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    cuerpo = texto;
  }
  if (!r.ok) {
    const msg =
      cuerpo?.error?.message ??
      cuerpo?.error_description ??
      cuerpo?.detail ??
      cuerpo?.message ??
      cuerpo?.title ??
      (typeof cuerpo === 'string' ? cuerpo.slice(0, 200) : `HTTP ${r.status}`);
    const reconectar = r.status === 401 || cuerpo?.error?.code === 190;
    throw new ErrorRed(`${new URL(url).host} respondió ${r.status}: ${msg}`, reconectar);
  }
  if (cuerpo === null || typeof cuerpo !== 'object') cuerpo = { valor: cuerpo };
  Object.defineProperty(cuerpo, '__cabeceras', { value: Object.fromEntries(r.headers.entries()), enumerable: false });
  return cuerpo as T;
}

export const dia = (d: Date) => d.toISOString().slice(0, 10);
export const haceDias = (n: number) => new Date(Date.now() - n * 86_400_000);
