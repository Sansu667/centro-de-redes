import { Fragment } from 'react';
import { requerirUsuario } from '@/lib/auth';
import { sql } from '@/lib/db';
import { DESCRIPCION_ROL, NOMBRE_ROL, type Rol } from '@/lib/roles';
import { hace } from '@/lib/formato';
import { FilaUsuario, NuevoUsuario } from '@/components/GestionUsuarios';
import { activarUsuario, cambiarRol, crearUsuario, desbloquear, restablecerAcceso } from './acciones';

export const metadata = { title: 'Usuarios' };

export default async function Usuarios() {
  const yo = await requerirUsuario('gestionar_usuarios');
  const usuarios = await sql`
    select id, nombre, email, rol, activo, totp_activo, ultimo_ingreso, debe_cambiar_password,
      (bloqueado_hasta is not null and bloqueado_hasta > now()) as bloqueado
    from usuarios order by activo desc, nombre
  `;
  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Usuarios</h1>
          <p>Quién puede entrar y qué puede hacer. Cuando termine tu periodo como auxiliar, deja aquí a la persona que te reemplaza como administradora.</p>
        </div>
      </div>

      <section className="panel" style={{ marginBottom: 20 }} aria-labelledby="t-nuevo">
        <div className="panel-cabeza">
          <h2 id="t-nuevo">Agregar una persona</h2>
        </div>
        <NuevoUsuario accion={crearUsuario} />
        <hr className="separador" />
        <dl className="lista-definicion">
          {(Object.keys(NOMBRE_ROL) as Rol[]).map((r) => (
            <Fragment key={r}>
              <dt>{NOMBRE_ROL[r]}</dt>
              <dd>{DESCRIPCION_ROL[r]}</dd>
            </Fragment>
          ))}
        </dl>
      </section>

      <section className="panel" aria-labelledby="t-lista">
        <div className="panel-cabeza">
          <h2 id="t-lista">Equipo</h2>
          <p>{usuarios.filter((u) => u.activo).length} activos</p>
        </div>
        <div className="tabla-envoltura">
          <table>
            <thead>
              <tr>
                <th scope="col">Persona</th>
                <th scope="col">Rol</th>
                <th scope="col">Seguridad</th>
                <th scope="col">Último ingreso</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} style={u.activo ? undefined : { opacity: 0.6 }}>
                  <td>
                    <strong>{u.nombre}</strong>
                    <div className="ayuda">{u.email}</div>
                  </td>
                  <td>{NOMBRE_ROL[u.rol as Rol]}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {!u.activo && <span className="etiqueta">Desactivado</span>}
                      {u.bloqueado && <span className="etiqueta critico">Bloqueado</span>}
                      {u.totp_activo ? <span className="etiqueta ok">2 pasos</span> : <span className="etiqueta aviso">Sin 2 pasos</span>}
                      {u.debe_cambiar_password && <span className="etiqueta aviso">Clave temporal</span>}
                    </div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{u.ultimo_ingreso ? hace(u.ultimo_ingreso) : 'Nunca'}</td>
                  <td>
                    <FilaUsuario
                      u={{ id: u.id, email: u.email, rol: u.rol, activo: u.activo, bloqueado: u.bloqueado }}
                      esYo={u.id === yo.id}
                      acciones={{ cambiarRol, activarUsuario, restablecerAcceso, desbloquear }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
