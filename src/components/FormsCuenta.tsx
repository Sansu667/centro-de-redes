'use client';

import { useActionState, useTransition } from 'react';
import { BotonEnviar } from './Formularios';
import type { EstadoCuenta } from '@/app/(app)/cuenta/acciones';

type Accion = (e: EstadoCuenta, f: FormData) => Promise<EstadoCuenta>;

export function FormClave({ accion, forzado }: { accion: Accion; forzado?: boolean }) {
  const [estado, enviar] = useActionState(accion, undefined);
  return (
    <form action={enviar} style={{ maxWidth: 420 }}>
      {estado?.error && <div className="aviso-caja error" role="alert"><span>{estado.error}</span></div>}
      {estado?.ok && <div className="aviso-caja exito" role="status"><span>{estado.ok}</span></div>}
      <div className="campo">
        <label htmlFor="actual">{forzado ? 'Contraseña temporal' : 'Contraseña actual'}</label>
        <input id="actual" name="actual" type="password" autoComplete="current-password" required />
      </div>
      <div className="campo">
        <label htmlFor="nueva">Nueva contraseña</label>
        <input id="nueva" name="nueva" type="password" autoComplete="new-password" required />
        <p className="ayuda" style={{ marginTop: 6 }}>Mínimo 12 caracteres, con al menos tres de: minúsculas, mayúsculas, números y símbolos.</p>
      </div>
      <div className="campo">
        <label htmlFor="confirmacion">Repite la nueva contraseña</label>
        <input id="confirmacion" name="confirmacion" type="password" autoComplete="new-password" required />
      </div>
      <BotonEnviar pendiente="Guardando…">Cambiar contraseña</BotonEnviar>
    </form>
  );
}

export function FormCodigos({ accion }: { accion: Accion }) {
  const [estado, enviar] = useActionState(accion, undefined);
  if (estado?.codigos) {
    return (
      <div>
        <div className="aviso-caja exito" role="status"><span>Tus códigos anteriores dejaron de funcionar. Guarda estos:</span></div>
        <div className="codigos-recuperacion">
          {estado.codigos.map((c) => <span key={c}>{c}</span>)}
        </div>
      </div>
    );
  }
  return (
    <form action={enviar} style={{ maxWidth: 420 }}>
      {estado?.error && <div className="aviso-caja error" role="alert"><span>{estado.error}</span></div>}
      <div className="campo">
        <label htmlFor="codigo-r">Código actual de tu app</label>
        <input id="codigo-r" name="codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required />
      </div>
      <BotonEnviar className="boton secundario" pendiente="Generando…">Generar códigos nuevos</BotonEnviar>
    </form>
  );
}

export function BotonCerrar({ accion, texto }: { accion: () => Promise<void>; texto: string }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <button className="boton secundario chico" disabled={pendiente} onClick={() => iniciar(() => accion())}>
      {pendiente ? 'Cerrando…' : texto}
    </button>
  );
}
