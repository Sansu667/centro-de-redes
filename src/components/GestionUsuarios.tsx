'use client';

import { useActionState, useState, useTransition } from 'react';
import { UserPlus, Copy } from 'lucide-react';
import { BotonEnviar } from './Formularios';
import type { EstadoUsuario } from '@/app/(app)/usuarios/acciones';

const ROLES = [
  ['admin', 'Administrador'],
  ['aprobador', 'Aprobador'],
  ['editor', 'Editor'],
  ['lector', 'Solo lectura'],
] as const;

function Temporal({ email, clave }: { email: string; clave: string }) {
  return (
    <div className="aviso-caja exito" role="status" style={{ display: 'block' }}>
      <div>
        Entrega a <strong>{email}</strong> esta contraseña temporal por un canal privado. Al ingresar deberá cambiarla y activar la verificación en dos
        pasos. No se volverá a mostrar.
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <code className="secreto" style={{ margin: 0 }}>{clave}</code>
        <button type="button" className="boton secundario chico" onClick={() => navigator.clipboard?.writeText(clave)}>
          <Copy aria-hidden="true" /> Copiar
        </button>
      </div>
    </div>
  );
}

export function NuevoUsuario({ accion }: { accion: (e: EstadoUsuario, f: FormData) => Promise<EstadoUsuario> }) {
  const [estado, enviar] = useActionState(accion, undefined);
  return (
    <form action={enviar}>
      {estado?.error && <div className="aviso-caja error" role="alert"><span>{estado.error}</span></div>}
      {estado?.temporal && estado.email && <Temporal email={estado.email} clave={estado.temporal} />}
      <div className="fila-campos">
        <div className="campo">
          <label htmlFor="n-nombre">Nombre</label>
          <input id="n-nombre" name="nombre" type="text" required defaultValue={estado?.valores?.nombre} key={'n' + (estado?.valores?.nombre ?? '')} />
        </div>
        <div className="campo">
          <label htmlFor="n-email">Correo</label>
          <input id="n-email" name="email" type="email" required defaultValue={estado?.valores?.email} key={'e' + (estado?.valores?.email ?? '')} />
        </div>
        <div className="campo">
          <label htmlFor="n-rol">Rol</label>
          <select id="n-rol" name="rol" defaultValue="editor">
            {ROLES.map(([v, n]) => (
              <option key={v} value={v}>{n}</option>
            ))}
          </select>
        </div>
      </div>
      <BotonEnviar pendiente="Creando…">
        <UserPlus aria-hidden="true" /> Crear usuario
      </BotonEnviar>
    </form>
  );
}

type Acciones = {
  cambiarRol: (id: string, rol: string) => Promise<void>;
  activarUsuario: (id: string, a: boolean) => Promise<void>;
  restablecerAcceso: (id: string) => Promise<{ temporal: string }>;
  desbloquear: (id: string) => Promise<void>;
};

export function FilaUsuario({
  u,
  esYo,
  acciones,
}: {
  u: { id: string; email: string; rol: string; activo: boolean; bloqueado: boolean };
  esYo: boolean;
  acciones: Acciones;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [temporal, setTemporal] = useState<string | null>(null);
  const correr = (f: () => Promise<unknown>) =>
    iniciar(async () => {
      setError(null);
      try {
        await f();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  if (esYo) return <span className="ayuda">Tu cuenta</span>;
  return (
    <div>
      <div className="acciones">
        <select
          aria-label={`Rol de ${u.email}`}
          defaultValue={u.rol}
          disabled={pendiente}
          onChange={(e) => correr(() => acciones.cambiarRol(u.id, e.target.value))}
          style={{ width: 'auto', padding: '4px 8px', fontSize: 'var(--t-s)' }}
        >
          {ROLES.map(([v, n]) => (
            <option key={v} value={v}>{n}</option>
          ))}
        </select>
        {u.bloqueado && (
          <button className="boton secundario chico" disabled={pendiente} onClick={() => correr(() => acciones.desbloquear(u.id))}>
            Desbloquear
          </button>
        )}
        <button
          className="boton secundario chico"
          disabled={pendiente}
          onClick={() => {
            if (confirm(`Se generará una contraseña temporal para ${u.email} y deberá configurar de nuevo la verificación en dos pasos. ¿Continuar?`)) {
              correr(async () => setTemporal((await acciones.restablecerAcceso(u.id)).temporal));
            }
          }}
        >
          Restablecer acceso
        </button>
        <button
          className={u.activo ? 'boton peligro chico' : 'boton secundario chico'}
          disabled={pendiente}
          onClick={() => correr(() => acciones.activarUsuario(u.id, !u.activo))}
        >
          {u.activo ? 'Desactivar' : 'Reactivar'}
        </button>
      </div>
      {error && <p className="ayuda" role="alert" style={{ color: 'var(--critico)', marginTop: 4 }}>{error}</p>}
      {temporal && <div style={{ marginTop: 8 }}><Temporal email={u.email} clave={temporal} /></div>}
    </div>
  );
}
