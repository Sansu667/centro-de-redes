'use client';

import { useActionState, useMemo, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { upload } from '@vercel/blob/client';
import { ImagePlus, X, Film, TriangleAlert, Send, Save, CalendarClock, Heart, MessageCircle, Repeat2 } from 'lucide-react';
import {
  DESCRIPCION_TIPO,
  INFO_RED,
  NOMBRE_TIPO,
  problemasParaRed,
  type Red,
  type TipoPublicacion,
} from '@/lib/redes';
import { IconoRed } from './IconoRed';
import { Simbolo } from './Simbolo';
import type { EstadoForm } from '@/app/(app)/publicaciones/acciones';

export type CuentaOpcion = { id: string; red: Red; nombre: string; usuario_red: string | null; modo: string };
export type ArchivoSubido = { id: string; url: string; mime: string; nombre: string; tamano: number };

type Inicial = {
  id?: string;
  titulo: string;
  texto: string;
  tipo: TipoPublicacion;
  enlace: string;
  programada: string;
  cuentas: string[];
  textosPropios: Record<string, string>;
  archivos: ArchivoSubido[];
};

const TIPOS: TipoPublicacion[] = ['publicacion', 'historia', 'reel', 'video'];

function Boton({ intencion, children, clase = 'boton' }: { intencion: string; children: React.ReactNode; clase?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={clase} type="submit" name="intencion" value={intencion} disabled={pending}>
      {children}
    </button>
  );
}

export function Compositor({
  cuentas,
  inicial,
  puedeAutoaprobar,
  conBlob,
  usuarioId,
  accion,
}: {
  cuentas: CuentaOpcion[];
  inicial: Inicial;
  puedeAutoaprobar: boolean;
  conBlob: boolean;
  usuarioId: string;
  accion: (e: EstadoForm, f: FormData) => Promise<EstadoForm>;
}) {
  const [estado, enviar] = useActionState(accion, undefined);
  const [titulo, setTitulo] = useState(inicial.titulo);
  const [texto, setTexto] = useState(inicial.texto);
  const [tipo, setTipo] = useState<TipoPublicacion>(inicial.tipo);
  const [enlace, setEnlace] = useState(inicial.enlace);
  const [elegidas, setElegidas] = useState<string[]>(inicial.cuentas);
  const [propios, setPropios] = useState<Record<string, string>>(inicial.textosPropios);
  const [conPropio, setConPropio] = useState<Record<string, boolean>>(
    Object.fromEntries(Object.entries(inicial.textosPropios).map(([k, v]) => [k, Boolean(v)])),
  );
  const [archivos, setArchivos] = useState<ArchivoSubido[]>(inicial.archivos);
  const [programar, setProgramar] = useState(Boolean(inicial.programada));
  const [programada, setProgramada] = useState(inicial.programada);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [errorSubida, setErrorSubida] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [vista, setVista] = useState<string | null>(inicial.cuentas[0] ?? null);
  const entrada = useRef<HTMLInputElement>(null);

  const seleccion = cuentas.filter((c) => elegidas.includes(c.id));
  const cuentaVista = seleccion.find((c) => c.id === vista) ?? seleccion[0];

  const problemas = useMemo(() => {
    const p: { cuenta: CuentaOpcion; lista: string[] }[] = [];
    for (const c of seleccion) {
      const t = conPropio[c.id] && propios[c.id]?.trim() ? propios[c.id] : texto;
      const lista = problemasParaRed(c.red, tipo, t, archivos);
      if (lista.length) p.push({ cuenta: c, lista });
    }
    return p;
  }, [seleccion, conPropio, propios, texto, tipo, archivos]);

  function alternar(id: string) {
    setElegidas((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));
    if (!vista) setVista(id);
  }

  async function subir(lista: FileList | File[]) {
    setErrorSubida(null);
    for (const f of Array.from(lista)) {
      if (archivos.length >= 10) break;
      setSubiendo(f.name);
      try {
        let nuevo: ArchivoSubido;
        if (conBlob) {
          const limpio = f.name.replace(/[^\w.\-]/g, '_').slice(-80);
          const b = await upload(`medios/${usuarioId}/${limpio}`, f, { access: 'public', handleUploadUrl: '/api/subir', contentType: f.type });
          const r = await fetch('/api/archivos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: b.url, nombre: f.name }),
          });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error ?? 'No se pudo registrar el archivo.');
          nuevo = j;
        } else {
          const fd = new FormData();
          fd.set('archivo', f);
          const r = await fetch('/api/subir', { method: 'POST', body: fd });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error ?? 'No se pudo subir el archivo.');
          nuevo = j;
        }
        setArchivos((a) => [...a, nuevo]);
      } catch (e) {
        setErrorSubida(`${f.name}: ${(e as Error).message}`);
      } finally {
        setSubiendo(null);
      }
    }
  }

  const tiposDisponibles = new Set(seleccion.flatMap((c) => INFO_RED[c.red].tipos));

  return (
    <form action={enviar} className="compositor">
      {inicial.id && <input type="hidden" name="id" value={inicial.id} />}
      {elegidas.map((id) => (
        <input key={id} type="hidden" name="cuentas" value={id} />
      ))}
      {archivos.map((a) => (
        <input key={a.id} type="hidden" name="archivos" value={a.id} />
      ))}
      {seleccion.map((c) =>
        conPropio[c.id] ? <input key={c.id} type="hidden" name={`texto_${c.id}`} value={propios[c.id] ?? ''} /> : null,
      )}
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="programada" value={programar ? programada : ''} />

      <div className="rejilla" style={{ alignContent: 'start' }}>
        {estado?.error && (
          <div className="aviso-caja error" role="alert">
            <TriangleAlert aria-hidden="true" />
            <div>
              <div>{estado.error}</div>
              {estado.problemas && (
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {estado.problemas.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <section className="panel" aria-labelledby="t-donde">
          <div className="panel-cabeza">
            <h2 id="t-donde">Dónde se publica</h2>
            <p>{seleccion.length ? `${seleccion.length} seleccionada(s)` : 'Elige una o varias'}</p>
          </div>
          {cuentas.length === 0 ? (
            <p className="ayuda">No hay cuentas conectadas todavía.</p>
          ) : (
            <div className="selector-redes">
              {cuentas.map((c) => (
                <label key={c.id} className="selector-red">
                  <input type="checkbox" checked={elegidas.includes(c.id)} onChange={() => alternar(c.id)} />
                  <IconoRed red={c.red} />
                  <span>
                    {INFO_RED[c.red].nombre}
                    <small>
                      {c.usuario_red || c.nombre}
                      {c.modo === 'demo' ? ' · demostración' : ''}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          )}

          <div style={{ marginTop: 18 }}>
            <label id="l-tipo">Formato</label>
            <div className="tipos" role="radiogroup" aria-labelledby="l-tipo">
              {TIPOS.map((t) => {
                const posible = seleccion.length === 0 || tiposDisponibles.has(t);
                return (
                  <label key={t} className="tipo" title={DESCRIPCION_TIPO[t]} style={posible ? undefined : { opacity: 0.45 }}>
                    <input type="radio" name="_tipo" checked={tipo === t} onChange={() => setTipo(t)} />
                    {NOMBRE_TIPO[t]}
                  </label>
                );
              })}
            </div>
            <p className="ayuda" style={{ marginTop: 6 }}>{DESCRIPCION_TIPO[tipo]}</p>
          </div>
        </section>

        <section className="panel" aria-labelledby="t-contenido">
          <div className="panel-cabeza">
            <h2 id="t-contenido">Contenido</h2>
          </div>
          <div className="campo">
            <label htmlFor="titulo">
              Título interno <span className="ayuda">· identifica la pieza en la app; en YouTube es el título del video</span>
            </label>
            <input id="titulo" name="titulo" type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={150} required />
          </div>
          <div className="campo">
            <label htmlFor="texto">Texto</label>
            <textarea id="texto" name="texto" value={texto} onChange={(e) => setTexto(e.target.value)} rows={8} />
            <div className="contador-caracteres" aria-live="polite">
              <span>{texto.length.toLocaleString('es-CO')} caracteres</span>
              {[...new Set(seleccion.map((c) => c.red))].map((r) => {
                const lim = INFO_RED[r].limiteTexto;
                return (
                  <span key={r} className={texto.length > lim ? 'excedido' : undefined}>
                    {INFO_RED[r].nombre}: {lim - texto.length < 0 ? `${texto.length - lim} de más` : `quedan ${(lim - texto.length).toLocaleString('es-CO')}`}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="campo">
            <label htmlFor="enlace">
              Enlace <span className="ayuda">· opcional, por ejemplo la página del evento</span>
            </label>
            <input id="enlace" name="enlace" type="url" placeholder="https://" value={enlace} onChange={(e) => setEnlace(e.target.value)} />
          </div>

          {seleccion.length > 1 && (
            <details className="desplegable">
              <summary>Usar un texto distinto en alguna red</summary>
              <div style={{ display: 'grid', gap: 14, marginTop: 12 }}>
                {seleccion.map((c) => (
                  <div key={c.id}>
                    <label className="casilla">
                      <input
                        type="checkbox"
                        checked={Boolean(conPropio[c.id])}
                        onChange={(e) => {
                          setConPropio((p) => ({ ...p, [c.id]: e.target.checked }));
                          if (e.target.checked && !propios[c.id]) setPropios((p) => ({ ...p, [c.id]: texto }));
                        }}
                      />
                      <span>
                        Texto propio para {INFO_RED[c.red].nombre} ({c.usuario_red || c.nombre})
                      </span>
                    </label>
                    {conPropio[c.id] && (
                      <>
                        <textarea
                          aria-label={`Texto para ${INFO_RED[c.red].nombre}`}
                          value={propios[c.id] ?? ''}
                          onChange={(e) => setPropios((p) => ({ ...p, [c.id]: e.target.value }))}
                          rows={4}
                          style={{ marginTop: 6, minHeight: 90 }}
                        />
                        <div className="contador-caracteres">
                          <span className={(propios[c.id] ?? '').length > INFO_RED[c.red].limiteTexto ? 'excedido' : undefined}>
                            {(propios[c.id] ?? '').length} / {INFO_RED[c.red].limiteTexto.toLocaleString('es-CO')}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>

        <section className="panel" aria-labelledby="t-archivos">
          <div className="panel-cabeza">
            <h2 id="t-archivos">Imágenes y video</h2>
            <p>{conBlob ? 'Hasta 8 MB por imagen y 500 MB por video' : 'Hasta 4 MB por archivo'}</p>
          </div>
          <div
            className={`zona-archivos${arrastrando ? ' activa' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => entrada.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && entrada.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setArrastrando(true);
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastrando(false);
              subir(e.dataTransfer.files);
            }}
          >
            <ImagePlus aria-hidden="true" style={{ width: 22, height: 22, marginBottom: 4 }} />
            <div>{subiendo ? `Subiendo ${subiendo}…` : 'Arrastra aquí las piezas gráficas o haz clic para elegirlas'}</div>
            <div className="ayuda">JPG, PNG, WEBP, GIF, MP4 o MOV</div>
          </div>
          <input
            ref={entrada}
            type="file"
            hidden
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime"
            onChange={(e) => {
              if (e.target.files) subir(e.target.files);
              e.target.value = '';
            }}
          />
          {errorSubida && (
            <div className="aviso-caja error" role="alert" style={{ marginTop: 10, marginBottom: 0 }}>
              <TriangleAlert aria-hidden="true" />
              <span>{errorSubida}</span>
            </div>
          )}
          {archivos.length > 0 && (
            <div className="miniaturas">
              {archivos.map((a) => (
                <div className="miniatura" key={a.id} title={a.nombre}>
                  {a.mime.startsWith('video/') ? (
                    <video src={a.url} muted playsInline preload="metadata" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.url} alt={a.nombre} />
                  )}
                  <button type="button" onClick={() => setArchivos((x) => x.filter((y) => y.id !== a.id))} aria-label={`Quitar ${a.nombre}`}>
                    <X aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel" aria-labelledby="t-cuando">
          <div className="panel-cabeza">
            <h2 id="t-cuando">Cuándo</h2>
          </div>
          <label className="casilla">
            <input type="checkbox" checked={programar} onChange={(e) => setProgramar(e.target.checked)} />
            <span>Programar para una fecha y hora (hora de Bogotá)</span>
          </label>
          {programar && (
            <input
              type="datetime-local"
              aria-label="Fecha y hora de publicación"
              value={programada}
              onChange={(e) => setProgramada(e.target.value)}
              style={{ marginTop: 10, maxWidth: 280 }}
              required
            />
          )}
          <p className="ayuda" style={{ marginTop: 8 }}>
            {programar
              ? 'Se publicará sola a esa hora, siempre que esté aprobada.'
              : 'Sin fecha, se publica en cuanto se apruebe.'}
          </p>
        </section>

        {problemas.length > 0 && (
          <div className="aviso-caja alerta" role="status">
            <TriangleAlert aria-hidden="true" />
            <div>
              Antes de enviar, ajusta esto:
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {problemas.flatMap((p) => p.lista.map((l) => <li key={p.cuenta.id + l}>{l}</li>))}
              </ul>
            </div>
          </div>
        )}

        <div className="acciones">
          {puedeAutoaprobar ? (
            <Boton intencion="publicar">
              {programar ? <CalendarClock aria-hidden="true" /> : <Send aria-hidden="true" />}
              {programar ? 'Aprobar y programar' : 'Aprobar y publicar ahora'}
            </Boton>
          ) : null}
          <Boton intencion="revision" clase={puedeAutoaprobar ? 'boton secundario' : 'boton'}>
            <Send aria-hidden="true" /> Enviar a revisión
          </Boton>
          <Boton intencion="borrador" clase="boton secundario">
            <Save aria-hidden="true" /> Guardar borrador
          </Boton>
        </div>
      </div>

      <aside className="vista-previa" aria-label="Vista previa">
        <section className="panel">
          <div className="panel-cabeza">
            <h2>Vista previa</h2>
            <p>Aproximada</p>
          </div>
          {seleccion.length === 0 ? (
            <p className="ayuda">Elige una red para ver cómo se verá.</p>
          ) : (
            <>
              <div className="vista-pestanas" role="group" aria-label="Red de la vista previa">
                {seleccion.map((c) => (
                  <button key={c.id} type="button" aria-pressed={cuentaVista?.id === c.id} onClick={() => setVista(c.id)}>
                    <IconoRed red={c.red} tam={13} /> {INFO_RED[c.red].nombre}
                  </button>
                ))}
              </div>
              {cuentaVista && (
                <Previa
                  cuenta={cuentaVista}
                  tipo={tipo}
                  titulo={titulo}
                  texto={conPropio[cuentaVista.id] && propios[cuentaVista.id]?.trim() ? propios[cuentaVista.id] : texto}
                  enlace={enlace}
                  archivos={archivos}
                />
              )}
              {cuentaVista && INFO_RED[cuentaVista.red].nota && (
                <p className="ayuda" style={{ marginTop: 10 }}>{INFO_RED[cuentaVista.red].nota}</p>
              )}
            </>
          )}
        </section>
      </aside>
    </form>
  );
}

function Medio({ a }: { a?: ArchivoSubido }) {
  if (!a) return null;
  return (
    <div className="medio">
      {a.mime.startsWith('video/') ? (
        <video src={a.url} muted playsInline controls preload="metadata" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.url} alt="" />
      )}
    </div>
  );
}

function Previa({
  cuenta,
  tipo,
  titulo,
  texto,
  enlace,
  archivos,
}: {
  cuenta: CuentaOpcion;
  tipo: TipoPublicacion;
  titulo: string;
  texto: string;
  enlace: string;
  archivos: ArchivoSubido[];
}) {
  const nombre = cuenta.nombre;
  const usuario = cuenta.usuario_red || cuenta.nombre;
  if (tipo === 'historia' || tipo === 'reel') {
    return (
      <div className="tarjeta-red historia">
        <div className="progreso" />
        <div className="cab">
          <div className="avatar">
            <Simbolo />
          </div>
          <div>
            <div className="nombre">{usuario}</div>
            <div className="meta">ahora · {NOMBRE_TIPO[tipo]}</div>
          </div>
        </div>
        {archivos[0] ? (
          <Medio a={archivos[0]} />
        ) : (
          <div className="medio" style={{ color: '#9fb19f' }}>
            <Film aria-hidden="true" />
          </div>
        )}
      </div>
    );
  }
  const corto = cuenta.red === 'x' ? texto.slice(0, 280) : texto;
  return (
    <div className="tarjeta-red">
      <div className="cab">
        <div className="avatar">
          <Simbolo />
        </div>
        <div>
          <div className="nombre">{cuenta.red === 'youtube' ? titulo || 'Título del video' : nombre}</div>
          <div className="meta">{cuenta.red === 'youtube' ? nombre : `${usuario} · ahora`}</div>
        </div>
      </div>
      {cuenta.red !== 'youtube' && (corto || enlace) && (
        <div className="cuerpo">
          {corto}
          {enlace && !corto.includes(enlace) && (
            <>
              {corto ? '\n\n' : ''}
              <span style={{ color: '#1d63c4' }}>{enlace}</span>
            </>
          )}
        </div>
      )}
      <Medio a={archivos[0]} />
      {archivos.length > 1 && <div className="pie">+{archivos.length - 1} archivo(s) más en carrusel</div>}
      {cuenta.red === 'youtube' && texto && <div className="cuerpo" style={{ paddingTop: 10, color: '#444' }}>{texto.slice(0, 280)}</div>}
      <div className="pie">
        <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
          <Heart size={14} aria-hidden="true" /> Me gusta
        </span>
        <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
          <MessageCircle size={14} aria-hidden="true" /> Comentar
        </span>
        <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
          <Repeat2 size={14} aria-hidden="true" /> Compartir
        </span>
      </div>
    </div>
  );
}
