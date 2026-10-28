import { notFound, redirect } from 'next/navigation';
import { requerirUsuario } from '@/lib/auth';
import { sql } from '@/lib/db';
import { puede } from '@/lib/roles';
import { autoaprobacionPermitida } from '@/lib/ajustes';
import { mediosDe, usaBlob } from '@/lib/medios';
import { aBogotaInput } from '@/lib/formato';
import { cuentasParaPublicar } from '@/lib/consultas-publicaciones';
import { Compositor } from '@/components/Compositor';
import { guardarPublicacion } from '../../acciones';

export const metadata = { title: 'Editar publicación' };

export default async function Editar({ params }: { params: Promise<{ id: string }> }) {
  const u = await requerirUsuario('crear_publicacion');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [p] = await sql`select * from publicaciones where id = ${id}`;
  if (!p) notFound();
  const aprobador = puede(u.rol, 'aprobar');
  const editable = aprobador
    ? ['borrador', 'rechazada', 'en_revision', 'aprobada', 'programada', 'fallida'].includes(p.estado)
    : p.creada_por === u.id && ['borrador', 'rechazada', 'en_revision'].includes(p.estado);
  if (!editable) redirect(`/publicaciones/${id}`);
  const [cuentas, destinos, medios] = await Promise.all([
    cuentasParaPublicar(),
    sql`select cuenta_id, texto_propio from destinos_publicacion where publicacion_id = ${id}`,
    mediosDe(id),
  ]);
  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Editar publicación</h1>
          <p>{['aprobada', 'programada'].includes(p.estado) ? 'Ya estaba aprobada: si la envías a revisión, tendrá que aprobarse de nuevo.' : 'Los cambios se guardan al enviar o guardar el borrador.'}</p>
        </div>
      </div>
      <Compositor
        cuentas={cuentas}
        inicial={{
          id,
          titulo: p.titulo,
          texto: p.texto,
          tipo: p.tipo,
          enlace: p.enlace ?? '',
          programada: aBogotaInput(p.programada_para),
          cuentas: destinos.map((d) => d.cuenta_id),
          textosPropios: Object.fromEntries(destinos.filter((d) => d.texto_propio).map((d) => [d.cuenta_id, d.texto_propio])),
          archivos: medios.map((m) => ({ id: m.id, url: m.urlInterna, mime: m.mime, nombre: m.nombre, tamano: m.tamano })),
        }}
        puedeAutoaprobar={aprobador && (await autoaprobacionPermitida())}
        conBlob={usaBlob()}
        usuarioId={u.id}
        accion={guardarPublicacion}
      />
    </>
  );
}
