import { redirect } from 'next/navigation';
import { obtenerSesion } from '@/lib/auth';
import { MarcoIngreso } from '@/components/MarcoIngreso';
import { FormCodigo } from '@/components/Formularios';
import { salir, verificar } from '../acciones';

export const metadata = { title: 'Verificación' };

export default async function Verificacion() {
  const s = await obtenerSesion();
  if (!s) redirect('/ingresar');
  if (s.mfa_verificado) redirect('/panel');
  if (!s.usuario.totp_activo) redirect('/ingresar/configurar-2fa');
  return (
    <MarcoIngreso>
      <h2>Verificación en dos pasos</h2>
      <p>Hola, {s.usuario.nombre.split(' ')[0]}. Abre tu app de autenticación y escribe el código de Centro de Redes.</p>
      <FormCodigo accion={verificar} />
      <form action={salir} style={{ marginTop: 14 }}>
        <button className="boton secundario" type="submit">Usar otra cuenta</button>
      </form>
    </MarcoIngreso>
  );
}
