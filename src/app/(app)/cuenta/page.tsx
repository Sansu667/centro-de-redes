import { requerirUsuario, obtenerSesion } from '@/lib/auth';
import { sql } from '@/lib/db';
import { NOMBRE_ROL } from '@/lib/roles';
import { fechaHora, hace } from '@/lib/formato';
import { BotonCerrar, FormClave, FormCodigos } from '@/components/FormsCuenta';
import { cambiarClave, cerrarOtras, cerrarSesion, nuevosCodigos } from './acciones';

export const metadata = { title: 'Mi cuenta' };

function navegador(ua: string | null) {
  if (!ua) return 'Navegador desconocido';
  const n = /Edg\//.test(ua) ? 'Edge' : /Brave/.test(ua) ? 'Brave' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const so = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return `${n}${so ? ' en ' + so : ''}`;
}

export default async function Cuenta() {
  const u = await requerirUsuario('ver');
  const s = (await obtenerSesion())!;
  const [datos] = await sql`
    select password_cambiada_en, ultimo_ingreso,
      (select count(*)::int from codigos_recuperacion c where c.usuario_id = u.id and c.usado_en is null) as codigos
    from usuarios u where id = ${u.id}
  `;
  const sesiones = await sql`
    select id, creada_en, ultima_actividad, ip, agente from sesiones
    where usuario_id = ${u.id} and mfa_verificado and expira_en > now() order by ultima_actividad desc
  `;
  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Mi cuenta</h1>
          <p>{u.nombre} · {u.email} · {NOMBRE_ROL[u.rol]}</p>
        </div>
      </div>
      <div className="rejilla mitades">
        <section className="panel" aria-labelledby="t-clave">
          <div className="panel-cabeza">
            <h2 id="t-clave">Contraseña</h2>
            <p>Cambiada {hace(datos.password_cambiada_en)}</p>
          </div>
          <FormClave accion={cambiarClave} />
        </section>
        <div className="rejilla" style={{ alignContent: 'start' }}>
          <section className="panel" aria-labelledby="t-codigos">
            <div className="panel-cabeza">
              <h2 id="t-codigos">Códigos de recuperación</h2>
              <p>{datos.codigos} sin usar</p>
            </div>
            <p className="ayuda" style={{ marginBottom: 12 }}>
              Sirven para entrar si pierdes el teléfono con la app de autenticación. Generar nuevos invalida los anteriores.
            </p>
            <FormCodigos accion={nuevosCodigos} />
          </section>
          <section className="panel" aria-labelledby="t-sesiones">
            <div className="panel-cabeza">
              <h2 id="t-sesiones">Sesiones abiertas</h2>
              {sesiones.length > 1 && <BotonCerrar accion={cerrarOtras} texto="Cerrar las demás" />}
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
              {sesiones.map((x) => (
                <li key={x.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <div>
                    <strong>{navegador(x.agente)}</strong> {x.id === s.id && <span className="etiqueta ok">Esta sesión</span>}
                    <div className="ayuda">
                      IP {x.ip} · desde {fechaHora(x.creada_en)} · activa {hace(x.ultima_actividad)}
                    </div>
                  </div>
                  {x.id !== s.id && <BotonCerrar accion={cerrarSesion.bind(null, x.id)} texto="Cerrar" />}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
