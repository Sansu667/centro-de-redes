import 'server-only';
import type { Red } from './redes';

export type Proveedor = 'meta' | 'google' | 'linkedin' | 'x';

export const PROVEEDORES: Record<Proveedor, { nombre: string; redes: Red[]; variables: string[]; consola: string }> = {
  meta: {
    nombre: 'Meta (Facebook e Instagram)',
    redes: ['facebook', 'instagram'],
    variables: ['META_APP_ID', 'META_APP_SECRET', 'META_CONFIG_ID'],
    consola: 'https://developers.facebook.com/apps',
  },
  google: {
    nombre: 'Google (YouTube)',
    redes: ['youtube'],
    variables: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    consola: 'https://console.cloud.google.com/apis/credentials',
  },
  linkedin: {
    nombre: 'LinkedIn',
    redes: ['linkedin'],
    variables: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
    consola: 'https://www.linkedin.com/developers/apps',
  },
  x: {
    nombre: 'X',
    redes: ['x'],
    variables: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
    consola: 'https://developer.x.com/en/portal/dashboard',
  },
};

export function proveedorDe(red: Red): Proveedor {
  return red === 'facebook' || red === 'instagram' ? 'meta' : red === 'youtube' ? 'google' : red;
}

export function configurado(p: Proveedor): boolean {
  return PROVEEDORES[p].variables.every((v) => Boolean(process.env[v]));
}
