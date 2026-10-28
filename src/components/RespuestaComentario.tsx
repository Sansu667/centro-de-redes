'use client';

import { useState, useTransition } from 'react';
import { Send, EyeOff, Eye, Archive, CheckCheck, Inbox } from 'lucide-react';

type Props = {
  id: string;
  estado: string;
  limite: number;
  puedeOcultar: boolean;
  puedeModerar: boolean;
  nombreRed: string;
  acciones: {
    responder: (id: string, texto: string) => Promise<void>;
    cambiarEstado: (id: string, estado: 'nuevo' | 'respondido' | 'archivado') => Promise<void>;
    ocultar: (id: string, o: boolean) => Promise<void>;
  };
};

export function RespuestaComentario(p: Props) {
  const [texto, setTexto] = useState('');
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const correr = (f: () => Promise<void>, ok: string) =>
    iniciar(async () => {
      setError(null);
      setHecho(null);
      try {
        await f();
        setHecho(ok);
      } catch (e) {
        setError((e as Error).message);
      }
    });

  if (!p.puedeModerar) return <p className="ayuda">Tu rol puede leer los comentarios, pero no responderlos.</p>;

  return (
    <div>
      {error && <div className="aviso-caja error" role="alert"><span>{error}</span></div>}
      {hecho && <div className="aviso-caja exito" role="status"><span>{hecho}</span></div>}
      {p.estado !== 'oculto' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            correr(async () => {
              await p.acciones.responder(p.id, texto);
              setTexto('');
            }, `Respuesta publicada en ${p.nombreRed}.`);
          }}
        >
          <label htmlFor="respuesta">Responder como el Departamento</label>
          <textarea
            id="respuesta"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            style={{ minHeight: 90 }}
            maxLength={p.limite}
          />
          <div className="acciones" style={{ marginTop: 10, justifyContent: 'space-between' }}>
            <span className="ayuda">{texto.length} / {p.limite.toLocaleString('es-CO')}</span>
            <button className="boton" disabled={pendiente || !texto.trim()}>
              <Send aria-hidden="true" /> {pendiente ? 'Enviando…' : `Responder en ${p.nombreRed}`}
            </button>
          </div>
        </form>
      )}
      <div className="acciones" style={{ marginTop: 14 }}>
        {p.estado === 'nuevo' && (
          <button className="boton secundario chico" disabled={pendiente} onClick={() => correr(() => p.acciones.cambiarEstado(p.id, 'respondido'), 'Marcado como atendido.')}>
            <CheckCheck aria-hidden="true" /> Marcar como atendido
          </button>
        )}
        {p.estado !== 'nuevo' && p.estado !== 'oculto' && (
          <button className="boton secundario chico" disabled={pendiente} onClick={() => correr(() => p.acciones.cambiarEstado(p.id, 'nuevo'), 'Devuelto a pendientes.')}>
            <Inbox aria-hidden="true" /> Devolver a pendientes
          </button>
        )}
        {p.estado !== 'archivado' && p.estado !== 'oculto' && (
          <button className="boton secundario chico" disabled={pendiente} onClick={() => correr(() => p.acciones.cambiarEstado(p.id, 'archivado'), 'Archivado.')}>
            <Archive aria-hidden="true" /> Archivar
          </button>
        )}
        {p.puedeOcultar &&
          (p.estado === 'oculto' ? (
            <button className="boton secundario chico" disabled={pendiente} onClick={() => correr(() => p.acciones.ocultar(p.id, false), `Visible de nuevo en ${p.nombreRed}.`)}>
              <Eye aria-hidden="true" /> Mostrar de nuevo
            </button>
          ) : (
            <button
              className="boton peligro chico"
              disabled={pendiente}
              onClick={() => {
                if (confirm(`El comentario dejará de verse públicamente en ${p.nombreRed}. ¿Continuar?`)) {
                  correr(() => p.acciones.ocultar(p.id, true), `Comentario oculto en ${p.nombreRed}.`);
                }
              }}
            >
              <EyeOff aria-hidden="true" /> Ocultar en {p.nombreRed}
            </button>
          ))}
      </div>
    </div>
  );
}
