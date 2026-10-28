import 'server-only';
import { sql } from '../db';
import { cifrar, descifrar } from '../crypto';
import type { Red } from '../redes';
import type { Conector, CuentaConectada } from './tipos';
import { ErrorRed } from './tipos';
import { conectorDemo } from './demo';
import { conectorFacebook, conectorInstagram } from './meta';
import { conectorYouTube, refrescarGoogle } from './youtube';
import { conectorLinkedIn, refrescarLinkedIn } from './linkedin';
import { conectorX, refrescarX } from './x';

const REALES: Record<Red, Conector> = {
  facebook: conectorFacebook,
  instagram: conectorInstagram,
  youtube: conectorYouTube,
  linkedin: conectorLinkedIn,
  x: conectorX,
};

/** Cuenta que se publica a mano: no hay API, así que no se lee ni se publica nada desde la app. */
const conectorManual: Conector = {
  async publicar() {
    throw new ErrorRed('Esta cuenta se publica a mano desde la página de la publicación.');
  },
  async publicacionesRecientes() {
    return [];
  },
  async comentarios() {
    return [];
  },
  async responder() {
    throw new ErrorRed('Esta cuenta no está conectada por API: responde directamente en la red.');
  },
  async ocultar() {
    throw new ErrorRed('Esta cuenta no está conectada por API: oculta el comentario directamente en la red.');
  },
  async metricas() {
    return [];
  },
};

export function conectorPara(c: CuentaConectada): Conector {
  return c.modo === 'demo' ? conectorDemo : c.modo === 'manual' ? conectorManual : REALES[c.red];
}

const REFRESCAR: Partial<Record<Red, (r: string) => Promise<{ token: string; expira: Date; refresh: string | null }>>> = {
  youtube: refrescarGoogle,
  linkedin: refrescarLinkedIn,
  x: refrescarX,
};

/** Carga una cuenta con sus tokens descifrados y los renueva si están por vencer. */
export async function cargarCuenta(id: string): Promise<CuentaConectada> {
  const [f] = await sql`select * from cuentas_sociales where id = ${id}`;
  if (!f) throw new ErrorRed('La cuenta no existe.');
  const cuenta: CuentaConectada = {
    id: f.id,
    red: f.red,
    nombre: f.nombre,
    usuario_red: f.usuario_red,
    id_externo: f.id_externo,
    modo: f.modo,
    token: f.token_cifrado ? descifrar(f.token_cifrado) : null,
    refresh: f.refresh_cifrado ? descifrar(f.refresh_cifrado) : null,
    token_expira_en: f.token_expira_en,
    datos: f.datos ?? {},
  };
  const porVencer = cuenta.token_expira_en && cuenta.token_expira_en.getTime() - Date.now() < 5 * 60_000;
  const refrescar = REFRESCAR[cuenta.red];
  if (cuenta.modo === 'real' && porVencer && cuenta.refresh && refrescar) {
    try {
      const n = await refrescar(cuenta.refresh);
      cuenta.token = n.token;
      cuenta.token_expira_en = n.expira;
      if (n.refresh) cuenta.refresh = n.refresh;
      await sql`
        update cuentas_sociales set token_cifrado = ${cifrar(n.token)}, token_expira_en = ${n.expira},
          refresh_cifrado = ${cuenta.refresh ? cifrar(cuenta.refresh) : null}, estado = 'activa', ultimo_error = null
        where id = ${id}
      `;
    } catch (e) {
      await sql`update cuentas_sociales set estado = 'requiere_reconexion', ultimo_error = ${(e as Error).message} where id = ${id}`;
      throw new ErrorRed('El acceso a la cuenta venció y no se pudo renovar. Vuelve a conectarla.', true);
    }
  }
  return cuenta;
}

export async function marcarErrorCuenta(id: string, e: unknown) {
  const reconectar = e instanceof ErrorRed && e.requiereReconexion;
  await sql`
    update cuentas_sociales set ultimo_error = ${(e as Error).message?.slice(0, 500) ?? 'Error'},
      estado = ${reconectar ? 'requiere_reconexion' : 'error'}
    where id = ${id}
  `;
}
