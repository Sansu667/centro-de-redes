import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { obtenerSesion } from '@/lib/auth';
import { uriOtpauth } from '@/lib/totp';
import { secretoPendiente } from '@/lib/dosfactores';
import { MarcoIngreso } from '@/components/MarcoIngreso';
import { FormActivar2fa } from '@/components/Formularios';
import { confirmar2fa } from '../acciones';

export const metadata = { title: 'Activar verificación' };

export default async function Configurar2fa() {
  const s = await obtenerSesion();
  if (!s) redirect('/ingresar');
  // Recién activada: la página se vuelve a pintar tras la acción y debe conservar los códigos en pantalla.
  const activa = s.usuario.totp_activo;
  if (activa && !s.mfa_verificado) redirect('/ingresar/verificacion');
  let qr: string | null = null;
  let agrupado = '';
  if (!activa) {
    const secreto = await secretoPendiente(s.usuario.id);
    qr = await QRCode.toDataURL(uriOtpauth(secreto, s.usuario.email), { margin: 0, width: 176, color: { dark: '#18241b' } });
    agrupado = secreto.match(/.{1,4}/g)?.join(' ') ?? '';
  }
  return (
    <MarcoIngreso>
      <h2>{activa ? 'Verificación en dos pasos activa' : 'Activa la verificación en dos pasos'}</h2>
      <p>
        {activa
          ? 'Tu cuenta ya pide un código de tu teléfono al ingresar.'
          : 'Es obligatoria para todas las cuentas. Escanea el código con Google Authenticator, Microsoft Authenticator o una app similar.'}
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {qr && <img className="qr" src={qr} alt="Código QR para la app de autenticación" width={196} height={196} />}
      {qr && (
        <details className="desplegable" style={{ marginBottom: 16 }}>
          <summary>¿No puedes escanear? Escribe la clave a mano</summary>
          <code className="secreto" style={{ marginTop: 8 }}>{agrupado}</code>
        </details>
      )}
      <FormActivar2fa accion={confirmar2fa} yaActiva={activa} />
    </MarcoIngreso>
  );
}
