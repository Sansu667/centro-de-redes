import { revalidatePath } from 'next/cache';
import { requerirUsuario, usuarioParaAccion } from '@/lib/auth';
import { sql } from '@/lib/db';
import { autoaprobacionPermitida } from '@/lib/ajustes';
import { registrar } from '@/lib/bitacora';
import { usaBlob } from '@/lib/medios';

export const metadata = { title: 'Ajustes' };

async function guardar(form: FormData) {
  'use server';
  const u = await usuarioParaAccion('gestionar_ajustes');
  const valor = form.get('autoaprobacion') === 'on';
  await sql`
    insert into ajustes (clave, valor, actualizado_por, actualizado_en) values ('autoaprobacion', ${sql.json(valor)}, ${u.id}, now())
    on conflict (clave) do update set valor = excluded.valor, actualizado_por = excluded.actualizado_por, actualizado_en = now()
  `;
  await registrar(u.id, 'ajustes.autoaprobacion', 'ajuste', 'autoaprobacion', { valor });
  revalidatePath('/', 'layout');
}

export default async function Ajustes() {
  await requerirUsuario('gestionar_ajustes');
  const auto = await autoaprobacionPermitida();
  const cron = Boolean(process.env.CRON_SECRET);
  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Ajustes</h1>
          <p>Reglas generales del flujo de publicación.</p>
        </div>
      </div>
      <section className="panel" style={{ marginBottom: 20, maxWidth: 760 }}>
        <div className="panel-cabeza">
          <h2>Aprobación</h2>
        </div>
        <form action={guardar}>
          <label className="casilla" style={{ marginBottom: 14 }}>
            <input type="checkbox" name="autoaprobacion" defaultChecked={auto} />
            <span>
              <strong>Quien aprueba puede aprobar sus propias publicaciones</strong>
              <br />
              <span className="ayuda">
                Útil mientras una sola persona tiene permiso de aprobar. Si lo desactivas, toda publicación necesita el visto bueno de otra persona
                con rol de aprobador o administrador.
              </span>
            </span>
          </label>
          <button className="boton" type="submit">Guardar ajustes</button>
        </form>
      </section>
      <section className="panel" style={{ maxWidth: 760 }}>
        <div className="panel-cabeza">
          <h2>Estado del servidor</h2>
        </div>
        <dl className="lista-definicion">
          <dt>Archivos</dt>
          <dd>{usaBlob() ? 'Vercel Blob (imágenes de hasta 8 MB y videos de hasta 500 MB)' : 'Base de datos (hasta 4 MB por archivo). Conecta Vercel Blob para videos.'}</dd>
          <dt>Tareas automáticas</dt>
          <dd>{cron ? 'Activas: sincronización diaria y publicación de lo programado.' : 'Falta CRON_SECRET: las tareas automáticas no correrán.'}</dd>
          <dt>Programadas</dt>
          <dd>Se publican al llegar su hora cuando alguien abre la app, y en cada ejecución del cron.</dd>
        </dl>
      </section>
    </>
  );
}
