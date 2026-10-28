'use client';

import { useActionState, useState } from 'react';
import { Copy, Check, ExternalLink, Download } from 'lucide-react';
import { BotonEnviar } from './Formularios';

type Estado = { error?: string } | undefined;
type Accion = (e: Estado, f: FormData) => Promise<Estado>;

/** Formulario para registrar la cuenta de X que se publica a mano. */
export function FormCuentaManual({ accion }: { accion: Accion }) {
  const [estado, enviar] = useActionState(accion, undefined);
  return (
    <form action={enviar} style={{ display: 'grid', gap: 8, minWidth: 240 }}>
      <input type="hidden" name="red" value="x" />
      {estado?.error && <span className="ayuda" role="alert" style={{ color: 'var(--critico)' }}>{estado.error}</span>}
      <label className="ayuda" htmlFor="x-nombre">Nombre de la cuenta</label>
      <input id="x-nombre" name="nombre" defaultValue="Departamento de Filosofía UNAL" required maxLength={100} />
      <label className="ayuda" htmlFor="x-usuario">Usuario en X</label>
      <input id="x-usuario" name="usuario" placeholder="@usuario" required maxLength={60} autoComplete="off" />
      <BotonEnviar pendiente="Guardando…">Añadir para publicar a mano</BotonEnviar>
    </form>
  );
}

/** Lo que hace falta para publicar en X a mano: texto listo, botón que abre X y dónde pegar el enlace. */
export function PanelManual({
  texto,
  usuario,
  medios,
  accion,
}: {
  texto: string;
  usuario: string | null;
  medios: { id: string; nombre: string; url: string }[];
  accion: Accion;
}) {
  const [copiado, setCopiado] = useState(false);
  const [estado, enviar] = useActionState(accion, undefined);
  const intento = `https://x.com/intent/post?text=${encodeURIComponent(texto)}`;
  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
      <ol className="ayuda" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
        <li>Entra a X con la cuenta {usuario ?? 'del Departamento'}.</li>
        <li>Abre X con el texto listo{medios.length > 0 ? ', descarga las imágenes y adjúntalas' : ''}, y publica.</li>
        <li>Copia el enlace del post publicado y pégalo aquí.</li>
      </ol>
      <div className="acciones">
        <a className="boton chico" href={intento} target="_blank" rel="noopener noreferrer">
          <ExternalLink aria-hidden="true" /> Abrir X con el texto
        </a>
        <button
          type="button"
          className="boton secundario chico"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(texto);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            } catch {
              setCopiado(false);
            }
          }}
        >
          {copiado ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copiado ? 'Copiado' : 'Copiar texto'}
        </button>
        {medios.map((m, i) => (
          <a key={m.id} className="boton secundario chico" href={m.url} download={m.nombre}>
            <Download aria-hidden="true" /> {medios.length > 1 ? `Archivo ${i + 1}` : 'Descargar archivo'}
          </a>
        ))}
      </div>
      <form action={enviar} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label className="sr-only" htmlFor="url-x">Enlace del post en X</label>
        <input id="url-x" name="url" type="url" placeholder="https://x.com/usuario/status/…" required style={{ flex: '1 1 240px' }} />
        <BotonEnviar pendiente="Guardando…">Marcar como publicada</BotonEnviar>
      </form>
      {estado?.error && <span className="ayuda" role="alert" style={{ color: 'var(--critico)' }}>{estado.error}</span>}
    </div>
  );
}
