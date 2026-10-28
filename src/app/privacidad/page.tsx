import Link from 'next/link';
import { Simbolo } from '@/components/Simbolo';

export const metadata = {
  title: 'Política de privacidad',
  robots: { index: true, follow: false },
};

const ACTUALIZADA = '28 de octubre de 2026';

export default function Privacidad() {
  return (
    <main className="documento">
      <header className="documento-cabeza">
        <Link href="/ingresar" className="marca" style={{ padding: 0, color: 'var(--tinta)' }}>
          <Simbolo className="marca-simbolo" />
          <span className="marca-texto">
            Centro de Redes
            <small style={{ color: 'var(--tinta-3)' }}>Departamento de Filosofía · Universidad Nacional de Colombia, sede Bogotá</small>
          </span>
        </Link>
      </header>

      <article>
        <h1>Política de privacidad</h1>
        <p className="ayuda">Última actualización: {ACTUALIZADA}</p>

        <h2>Qué es esta aplicación</h2>
        <p>
          Centro de Redes es una herramienta interna del Departamento de Filosofía de la Universidad Nacional de Colombia, sede Bogotá. La usa
          únicamente el equipo de comunicaciones del Departamento para publicar contenido en las cuentas oficiales del Departamento en Facebook,
          Instagram, YouTube, LinkedIn y X, responder los comentarios que reciben y consultar sus estadísticas. No está abierta al público ni
          permite crear cuentas por cuenta propia.
        </p>

        <h2>Qué datos usa</h2>
        <ul>
          <li>
            <strong>Del equipo que usa la app:</strong> nombre, correo, rol, contraseña guardada con cifrado irreversible (Argon2id), el secreto de la
            verificación en dos pasos (cifrado) y un registro de las acciones que hace cada persona.
          </li>
          <li>
            <strong>De las cuentas oficiales del Departamento:</strong> los permisos de acceso que cada red entrega al conectarlas, guardados con
            cifrado AES-256. Con ellos la app publica, lee las publicaciones propias del Departamento con sus métricas y lee los comentarios que
            recibe.
          </li>
          <li>
            <strong>De quienes comentan:</strong> el nombre público, el usuario y el texto de los comentarios escritos en las publicaciones del
            Departamento, tal como la red los entrega, para que el equipo pueda leerlos y responderlos desde un solo lugar.
          </li>
        </ul>

        <h2>Para qué se usan</h2>
        <p>
          Solo para administrar la comunicación del Departamento en sus propias cuentas. La app no vende ni comparte datos con terceros, no los
          usa para publicidad, perfiles ni seguimiento de personas, y no accede a cuentas personales de nadie.
        </p>

        <h2>Datos de Google y YouTube</h2>
        <p>
          El uso de la información recibida de las API de Google se ajusta a la{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
            Política de datos de usuario de los servicios de API de Google
          </a>
          , incluidos los requisitos de uso limitado. La app usa los{' '}
          <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">
            Servicios de API de YouTube
          </a>
          ; al usarla se aplica también la{' '}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
            Política de privacidad de Google
          </a>
          . El acceso se puede revocar en cualquier momento desde la{' '}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
            configuración de seguridad de la cuenta de Google
          </a>
          .
        </p>

        <h2>Dónde se guardan y por cuánto tiempo</h2>
        <p>
          Los datos se guardan en una base de datos propia de la app, alojada en Vercel y Neon, con conexiones cifradas. Las estadísticas y los
          comentarios se conservan mientras la cuenta de la red siga conectada. Al desconectar una cuenta desde la app, se borran sus permisos de
          acceso, sus estadísticas y sus comentarios guardados. Los registros de ingreso se borran a los 30 días.
        </p>

        <h2>Tus derechos</h2>
        <p>
          Conforme a la Ley 1581 de 2012 de protección de datos personales de Colombia, puedes pedir conocer, actualizar, corregir o eliminar los
          datos tuyos que la app guarde, por ejemplo un comentario que escribiste en una publicación del Departamento, escribiendo al correo de
          contacto del Departamento.
        </p>

        <h2>Contacto</h2>
        <p>
          Departamento de Filosofía, Facultad de Ciencias Humanas, Universidad Nacional de Colombia, sede Bogotá.{' '}
          <a href="mailto:depffchbog@gmail.com">depffchbog@gmail.com</a>
        </p>
      </article>
    </main>
  );
}
