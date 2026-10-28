import { redirect } from 'next/navigation';
import { requerirUsuario } from '@/lib/auth';
import { FormClave } from '@/components/FormsCuenta';
import { cambiarClave } from '../acciones';

export const metadata = { title: 'Cambia tu contraseña' };

export default async function CambiarClave() {
  const u = await requerirUsuario('ver', { permitirCambioClave: true });
  if (!u.debe_cambiar_password) redirect('/cuenta');
  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Cambia tu contraseña</h1>
          <p>Entraste con una contraseña temporal. Elige una propia para continuar.</p>
        </div>
      </div>
      <section className="panel" style={{ maxWidth: 520 }}>
        <FormClave accion={cambiarClave} forzado />
      </section>
    </>
  );
}
