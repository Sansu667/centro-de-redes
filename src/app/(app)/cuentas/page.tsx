import { TriangleAlert, CircleCheck, ExternalLink } from 'lucide-react';
import { requerirUsuario } from '@/lib/auth';
import { sql } from '@/lib/db';
import { INFO_RED, REDES, type Red } from '@/lib/redes';
import { configurado, PROVEEDORES, proveedorDe, type Proveedor } from '@/lib/oauth';
import { urlBase } from '@/lib/medios';
import { hace } from '@/lib/formato';
import { IconoRed } from '@/components/IconoRed';
import { BotonAccion } from '@/components/AccionesCuenta';
import { activar, crearDemo, eliminarCuenta, sincronizar } from './acciones';

export const metadata = { title: 'Cuentas de redes' };

const ESTADO_CUENTA: Record<string, { nombre: string; clase: string }> = {
  activa: { nombre: 'Conectada', clase: 'ok' },
  requiere_reconexion: { nombre: 'Hay que reconectar', clase: 'critico' },
  error: { nombre: 'Con errores', clase: 'grave' },
  desactivada: { nombre: 'Desactivada', clase: '' },
};

const ERRORES: Record<string, string> = {
  permiso: 'Solo un administrador puede conectar cuentas.',
  sin_credenciales: 'Faltan las credenciales de la app de desarrollador de esta red en las variables de entorno.',
  estado: 'La conexión expiró o no se inició desde esta sesión. Vuelve a intentarlo.',
  cancelado: 'Se canceló la autorización en la red social.',
  conexion: 'La red rechazó la conexión.',
  proveedor: 'Red desconocida.',
};

export default async function Cuentas({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requerirUsuario('gestionar_cuentas');
  const q = await searchParams;
  const cuentas = await sql`
    select c.*, u.nombre as conectada_por_nombre from cuentas_sociales c left join usuarios u on u.id = c.conectada_por
    order by c.red, c.nombre
  `;
  const porRed = new Map<Red, typeof cuentas>();
  for (const c of cuentas) porRed.set(c.red, [...(porRed.get(c.red) ?? []), c] as any);

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Cuentas de redes</h1>
          <p>
            Conecta cada red con la cuenta oficial del Departamento. Los tokens de acceso se guardan cifrados y nunca se muestran. Mientras llegan las
            credenciales, puedes usar una cuenta de demostración para probar la app.
          </p>
        </div>
      </div>

      {q.error && (
        <div className="aviso-caja error" role="alert">
          <TriangleAlert aria-hidden="true" />
          <span>
            {ERRORES[q.error] ?? 'No se pudo completar la conexión.'} {q.m && <><br /><small>{q.m}</small></>}
          </span>
        </div>
      )}
      {q.conectadas && (
        <div className="aviso-caja exito" role="status">
          <CircleCheck aria-hidden="true" />
          <span>Se conectaron {q.conectadas} cuenta(s). La primera sincronización ya corrió.</span>
        </div>
      )}

      <section className="panel" style={{ marginBottom: 20 }}>
        {REDES.map((red) => {
          const lista = porRed.get(red) ?? [];
          const p = proveedorDe(red);
          const listo = configurado(p);
          return (
            <div className="cuenta-fila" key={red}>
              <IconoRed red={red} tam={44} />
              <div>
                <h2>{INFO_RED[red].nombre}</h2>
                {lista.length === 0 ? (
                  <p className="ayuda">Sin conectar.</p>
                ) : (
                  <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'grid', gap: 10 }}>
                    {lista.map((c: any) => (
                      <li key={c.id}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <strong>{c.nombre}</strong>
                          {c.usuario_red && <span className="ayuda">{c.usuario_red}</span>}
                          <span className={`etiqueta ${ESTADO_CUENTA[c.estado].clase}`}>{ESTADO_CUENTA[c.estado].nombre}</span>
                          {c.modo === 'demo' && <span className="etiqueta info">Demostración</span>}
                        </div>
                        <div className="ayuda">
                          Sincronizada {hace(c.ultima_sincronizacion)}
                          {c.conectada_por_nombre && ` · conectada por ${c.conectada_por_nombre}`}
                          {c.token_expira_en && c.modo === 'real' && red === 'linkedin' && ` · el acceso vence ${hace(c.token_expira_en).replace('hace ', 'en ')}`}
                        </div>
                        {c.ultimo_error && <div className="ayuda" style={{ color: 'var(--critico)' }}>{c.ultimo_error}</div>}
                        <div className="acciones" style={{ marginTop: 8 }}>
                          {c.estado !== 'desactivada' && <BotonAccion accion={sincronizar.bind(null, c.id)} texto="Sincronizar" icono="sync" />}
                          <BotonAccion
                            accion={activar.bind(null, c.id, c.estado === 'desactivada')}
                            texto={c.estado === 'desactivada' ? 'Reactivar' : 'Desactivar'}
                            icono="power"
                          />
                          <BotonAccion
                            accion={eliminarCuenta.bind(null, c.id)}
                            texto="Quitar"
                            icono="trash"
                            clase="boton peligro chico"
                            confirmar={`Se quitará ${c.nombre} con todas sus estadísticas y comentarios guardados en la app (en ${INFO_RED[red].nombre} no se borra nada). ¿Continuar?`}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="acciones" style={{ justifyContent: 'flex-end' }}>
                {listo ? (
                  <a className="boton" href={`/api/oauth/${p}/inicio`}>
                    {lista.some((c: any) => c.modo === 'real') ? 'Reconectar' : 'Conectar'}
                  </a>
                ) : (
                  <span className="ayuda" style={{ maxWidth: 220, textAlign: 'right' }}>
                    Falta configurar {PROVEEDORES[p].variables.join(' y ')}
                  </span>
                )}
                {lista.length === 0 && <BotonAccion accion={crearDemo.bind(null, red)} texto="Probar con demostración" icono="plus" />}
              </div>
            </div>
          );
        })}
      </section>

      <section className="panel" aria-labelledby="t-guia">
        <div className="panel-cabeza">
          <h2 id="t-guia">Cómo obtener las credenciales de cada red</h2>
        </div>
        <p style={{ marginBottom: 14, maxWidth: '75ch' }}>
          Cada red exige registrar una app de desarrollador a nombre del Departamento. En todas, la dirección de retorno (redirect URI) es la que
          aparece abajo. Las claves se guardan como variables de entorno en Vercel y luego se vuelve a desplegar.
        </p>
        <div className="tabla-envoltura">
          <table>
            <thead>
              <tr>
                <th scope="col">Proveedor</th>
                <th scope="col">Variables</th>
                <th scope="col">Dirección de retorno</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(PROVEEDORES) as Proveedor[]).map((p) => (
                <tr key={p}>
                  <td>
                    <a href={PROVEEDORES[p].consola} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                      {PROVEEDORES[p].nombre} <ExternalLink size={13} aria-hidden="true" />
                    </a>
                  </td>
                  <td><code>{PROVEEDORES[p].variables.join(', ')}</code></td>
                  <td><code style={{ wordBreak: 'break-all' }}>{urlBase()}/api/oauth/{p}/retorno</code></td>
                  <td>{configurado(p) ? <span className="etiqueta ok">Configurado</span> : <span className="etiqueta">Pendiente</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
