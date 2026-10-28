'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { TriangleAlert, Copy } from 'lucide-react';
import type { Estado } from '@/app/ingresar/acciones';

export function BotonEnviar({ children, className = 'boton', pendiente }: { children: React.ReactNode; className?: string; pendiente?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? pendiente ?? 'Un momento…' : children}
    </button>
  );
}

export function Error({ texto }: { texto?: string }) {
  if (!texto) return null;
  return (
    <div className="aviso-caja error" role="alert">
      <TriangleAlert aria-hidden="true" />
      <span>{texto}</span>
    </div>
  );
}

type Accion = (e: Estado, f: FormData) => Promise<Estado>;

export function FormIngreso({ accion, aviso }: { accion: Accion; aviso?: string }) {
  const [estado, enviar] = useActionState(accion, undefined);
  return (
    <form action={enviar} noValidate>
      <Error texto={estado?.error ?? aviso} />
      <div className="campo">
        <label htmlFor="email">Correo</label>
        <input id="email" name="email" type="email" autoComplete="username" required autoFocus defaultValue={estado?.valores?.email} key={estado?.valores?.email} />
      </div>
      <div className="campo">
        <label htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <BotonEnviar pendiente="Verificando…">Ingresar</BotonEnviar>
    </form>
  );
}

export function FormCodigo({ accion }: { accion: Accion }) {
  const [estado, enviar] = useActionState(accion, undefined);
  return (
    <form action={enviar}>
      <Error texto={estado?.error} />
      <div className="campo">
        <label htmlFor="codigo">Código de verificación</label>
        <input
          id="codigo"
          name="codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          className="codigo-otp"
          maxLength={9}
          required
          autoFocus
        />
        <p className="ayuda" style={{ marginTop: 6 }}>
          Seis dígitos de tu app de autenticación. Si perdiste el teléfono, usa uno de tus códigos de recuperación (formato ABCD-EFGH).
        </p>
      </div>
      <BotonEnviar pendiente="Verificando…">Verificar</BotonEnviar>
    </form>
  );
}

export function FormActivar2fa({ accion, yaActiva = false }: { accion: Accion; yaActiva?: boolean }) {
  const [estado, enviar] = useActionState(accion, undefined);
  if (estado?.codigos) {
    const texto = estado.codigos.join('\n');
    return (
      <div>
        <div className="aviso-caja exito" role="status">
          <span>La verificación en dos pasos quedó activa.</span>
        </div>
        <h3>Guarda estos códigos de recuperación</h3>
        <p className="ayuda" style={{ marginTop: 4 }}>
          Cada código sirve una sola vez para entrar si pierdes el teléfono. No se volverán a mostrar: guárdalos en un gestor de contraseñas o
          imprímelos.
        </p>
        <div className="codigos-recuperacion">
          {estado.codigos.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <div className="acciones" style={{ marginBottom: 14 }}>
          <button type="button" className="boton secundario chico" onClick={() => navigator.clipboard?.writeText(texto)}>
            <Copy aria-hidden="true" /> Copiar códigos
          </button>
        </div>
        <Link href="/panel" className="boton">
          Ya los guardé, ir al panel
        </Link>
      </div>
    );
  }
  if (yaActiva) {
    return (
      <Link href="/panel" className="boton">
        Ir al panel
      </Link>
    );
  }
  return (
    <form action={enviar}>
      <Error texto={estado?.error} />
      <div className="campo">
        <label htmlFor="codigo">Código que muestra la app</label>
        <input id="codigo" name="codigo" inputMode="numeric" autoComplete="one-time-code" className="codigo-otp" maxLength={6} required />
      </div>
      <BotonEnviar pendiente="Activando…">Activar verificación en dos pasos</BotonEnviar>
    </form>
  );
}

export function FormInicial({ accion }: { accion: Accion }) {
  const [estado, enviar] = useActionState(accion, undefined);
  return (
    <form action={enviar}>
      <Error texto={estado?.error} />
      <div className="campo">
        <label htmlFor="token">Código de instalación</label>
        <input id="token" name="token" type="password" autoComplete="off" required />
        <p className="ayuda" style={{ marginTop: 6 }}>Es el valor de la variable SETUP_TOKEN configurada en Vercel.</p>
      </div>
      <div className="campo">
        <label htmlFor="nombre">Nombre completo</label>
        <input id="nombre" name="nombre" type="text" autoComplete="name" required defaultValue={estado?.valores?.nombre} key={'n' + (estado?.valores?.nombre ?? '')} />
      </div>
      <div className="campo">
        <label htmlFor="email">Correo institucional</label>
        <input id="email" name="email" type="email" autoComplete="username" required defaultValue={estado?.valores?.email} key={'e' + (estado?.valores?.email ?? '')} />
      </div>
      <div className="campo">
        <label htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required />
        <p className="ayuda" style={{ marginTop: 6 }}>Mínimo 12 caracteres, combinando al menos tres de: minúsculas, mayúsculas, números y símbolos.</p>
      </div>
      <div className="campo">
        <label htmlFor="confirmacion">Repite la contraseña</label>
        <input id="confirmacion" name="confirmacion" type="password" autoComplete="new-password" required />
      </div>
      <BotonEnviar pendiente="Creando…">Crear administrador</BotonEnviar>
    </form>
  );
}
