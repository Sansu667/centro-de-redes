'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Check, X, Send, Pencil, Trash2, RotateCcw, CalendarX } from 'lucide-react';

type Props = {
  id: string;
  puedeAprobar: boolean;
  puedeEditar: boolean;
  puedeEnviar: boolean;
  puedeEliminar: boolean;
  puedeReintentar: boolean;
  puedeCancelar: boolean;
  esPropiaSinAutoaprobacion: boolean;
  acciones: {
    aprobar: (id: string) => Promise<void>;
    rechazar: (id: string, motivo: string) => Promise<void>;
    enviarARevision: (id: string) => Promise<void>;
    reintentar: (id: string) => Promise<void>;
    cancelarProgramacion: (id: string) => Promise<void>;
    eliminar: (id: string) => Promise<void>;
  };
};

export function AccionesPublicacion(p: Props) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');

  const correr = (f: () => Promise<void>) =>
    iniciar(async () => {
      setError(null);
      try {
        await f();
      } catch (e) {
        const m = (e as Error).message;
        if (!m.includes('NEXT_REDIRECT')) setError(m);
        else throw e;
      }
    });

  return (
    <div>
      {error && (
        <div className="aviso-caja error" role="alert">
          <span>{error}</span>
        </div>
      )}
      <div className="acciones">
        {p.puedeAprobar && !p.esPropiaSinAutoaprobacion && (
          <button className="boton" disabled={pendiente} onClick={() => correr(() => p.acciones.aprobar(p.id))}>
            <Check aria-hidden="true" /> {pendiente ? 'Procesando…' : 'Aprobar'}
          </button>
        )}
        {p.puedeAprobar && (
          <button className="boton peligro" disabled={pendiente} onClick={() => setRechazando((r) => !r)} aria-expanded={rechazando}>
            <X aria-hidden="true" /> Rechazar
          </button>
        )}
        {p.puedeEnviar && (
          <button className="boton" disabled={pendiente} onClick={() => correr(() => p.acciones.enviarARevision(p.id))}>
            <Send aria-hidden="true" /> Enviar a revisión
          </button>
        )}
        {p.puedeReintentar && (
          <button className="boton" disabled={pendiente} onClick={() => correr(() => p.acciones.reintentar(p.id))}>
            <RotateCcw aria-hidden="true" /> {pendiente ? 'Publicando…' : 'Publicar ahora'}
          </button>
        )}
        {p.puedeEditar && (
          <Link className="boton secundario" href={`/publicaciones/${p.id}/editar`}>
            <Pencil aria-hidden="true" /> Editar
          </Link>
        )}
        {p.puedeCancelar && (
          <button className="boton secundario" disabled={pendiente} onClick={() => correr(() => p.acciones.cancelarProgramacion(p.id))}>
            <CalendarX aria-hidden="true" /> Quitar programación
          </button>
        )}
        {p.puedeEliminar && (
          <button
            className="boton peligro"
            disabled={pendiente}
            onClick={() => {
              if (confirm('¿Eliminar esta publicación? No se puede deshacer.')) correr(() => p.acciones.eliminar(p.id));
            }}
          >
            <Trash2 aria-hidden="true" /> Eliminar
          </button>
        )}
      </div>
      {p.esPropiaSinAutoaprobacion && p.puedeAprobar && (
        <p className="ayuda" style={{ marginTop: 8 }}>La creaste tú: otra persona con rol de aprobador debe aprobarla.</p>
      )}
      {rechazando && (
        <div className="panel" style={{ marginTop: 14 }}>
          <label htmlFor="motivo">Qué hay que cambiar</label>
          <textarea id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} style={{ minHeight: 80 }} />
          <div className="acciones" style={{ marginTop: 10 }}>
            <button className="boton peligro" disabled={pendiente || motivo.trim().length < 5} onClick={() => correr(async () => {
              await p.acciones.rechazar(p.id, motivo);
              setRechazando(false);
            })}>
              Rechazar con este motivo
            </button>
            <button className="boton secundario" onClick={() => setRechazando(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
