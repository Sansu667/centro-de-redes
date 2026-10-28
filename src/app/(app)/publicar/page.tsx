import { requerirUsuario } from '@/lib/auth';
import { puede } from '@/lib/roles';
import { autoaprobacionPermitida } from '@/lib/ajustes';
import { usaBlob } from '@/lib/medios';
import { cuentasParaPublicar } from '@/lib/consultas-publicaciones';
import { Compositor } from '@/components/Compositor';
import { guardarPublicacion } from '../publicaciones/acciones';

export const metadata = { title: 'Nueva publicación' };

export default async function Publicar() {
  const u = await requerirUsuario('crear_publicacion');
  const cuentas = await cuentasParaPublicar();
  const autoaprobar = puede(u.rol, 'aprobar') && (await autoaprobacionPermitida());
  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Nueva publicación</h1>
          <p>
            Escribe una vez y elige en qué redes sale.{' '}
            {autoaprobar
              ? 'Tu rol puede aprobarla y publicarla de inmediato.'
              : 'Cuando la envíes, un aprobador la revisará antes de publicarla.'}
          </p>
        </div>
      </div>
      <Compositor
        cuentas={cuentas}
        inicial={{ titulo: '', texto: '', tipo: 'publicacion', enlace: '', programada: '', cuentas: [], textosPropios: {}, archivos: [] }}
        puedeAutoaprobar={autoaprobar}
        conBlob={usaBlob()}
        usuarioId={u.id}
        accion={guardarPublicacion}
      />
    </>
  );
}
