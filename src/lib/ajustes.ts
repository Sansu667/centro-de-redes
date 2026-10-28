import 'server-only';
import { sql } from './db';

export async function leerAjuste<T>(clave: string, defecto: T): Promise<T> {
  const [f] = await sql`select valor from ajustes where clave = ${clave}`;
  return f ? (f.valor as T) : defecto;
}

export async function autoaprobacionPermitida() {
  return leerAjuste<boolean>('autoaprobacion', true);
}
