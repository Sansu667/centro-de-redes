import Link from 'next/link';
import { after } from 'next/server';
import {
  ChartColumn,
  SquarePen,
  FileText,
  CheckCheck,
  MessageSquare,
  Plug,
  Users,
  ScrollText,
  Settings,
  KeyRound,
} from 'lucide-react';
import { requerirUsuario } from '@/lib/auth';
import { sql } from '@/lib/db';
import { puede, NOMBRE_ROL } from '@/lib/roles';
import { INFO_RED, type Red } from '@/lib/redes';
import { publicarVencidas } from '@/lib/publicador';
import { NavEnlace } from '@/components/NavEnlace';
import { IconoRed } from '@/components/IconoRed';
import { Simbolo } from '@/components/Simbolo';
import { salir } from '../ingresar/acciones';

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const u = await requerirUsuario('ver', { permitirCambioClave: true });
  const [conteos] = await sql`
    select
      (select count(*)::int from publicaciones where estado = 'en_revision') as revision,
      (select count(*)::int from comentarios where estado = 'nuevo' and not es_propio) as comentarios,
      (select count(*)::int from publicaciones where estado = 'programada' and programada_para <= now()) as vencidas
  `;
  const redes = await sql`select distinct red from cuentas_sociales where estado <> 'desactivada'`;
  const conectadas = new Set(redes.map((r) => r.red as Red));

  // Respaldo del cron: si hay publicaciones programadas vencidas, se publican tras responder.
  if (conteos.vencidas > 0) after(() => publicarVencidas().catch(() => {}));

  return (
    <div className="app">
      <nav className="barra" aria-label="Navegación principal">
        <Link href="/panel" className="marca">
          <Simbolo className="marca-simbolo" />
          <span className="marca-texto">
            Centro de Redes
            <small>Filosofía · UNAL</small>
          </span>
        </Link>

        <div className="nav-grupo">
          <div className="nav-titulo">Estadísticas</div>
          <NavEnlace href="/panel">
            <ChartColumn aria-hidden="true" /> Panorama
          </NavEnlace>
          {(Object.keys(INFO_RED) as Red[])
            .filter((r) => conectadas.has(r))
            .map((r) => (
              <NavEnlace key={r} href={`/redes/${r}`}>
                <IconoRed red={r} tam={17} /> {INFO_RED[r].nombre}
              </NavEnlace>
            ))}
        </div>

        <div className="nav-grupo">
          <div className="nav-titulo">Trabajo</div>
          {puede(u.rol, 'crear_publicacion') && (
            <NavEnlace href="/publicar">
              <SquarePen aria-hidden="true" /> Nueva publicación
            </NavEnlace>
          )}
          <NavEnlace href="/publicaciones">
            <FileText aria-hidden="true" /> Publicaciones
          </NavEnlace>
          {puede(u.rol, 'aprobar') && (
            <NavEnlace href="/aprobaciones">
              <CheckCheck aria-hidden="true" /> Aprobaciones
              {conteos.revision > 0 && <span className="nav-contador">{conteos.revision}</span>}
            </NavEnlace>
          )}
          <NavEnlace href="/comentarios">
            <MessageSquare aria-hidden="true" /> Comentarios
            {conteos.comentarios > 0 && <span className="nav-contador">{conteos.comentarios > 99 ? '99+' : conteos.comentarios}</span>}
          </NavEnlace>
        </div>

        {(puede(u.rol, 'gestionar_cuentas') || puede(u.rol, 'ver_bitacora')) && (
          <div className="nav-grupo">
            <div className="nav-titulo">Administración</div>
            {puede(u.rol, 'gestionar_cuentas') && (
              <NavEnlace href="/cuentas">
                <Plug aria-hidden="true" /> Cuentas de redes
              </NavEnlace>
            )}
            {puede(u.rol, 'gestionar_usuarios') && (
              <NavEnlace href="/usuarios">
                <Users aria-hidden="true" /> Usuarios
              </NavEnlace>
            )}
            {puede(u.rol, 'gestionar_ajustes') && (
              <NavEnlace href="/ajustes">
                <Settings aria-hidden="true" /> Ajustes
              </NavEnlace>
            )}
            {puede(u.rol, 'ver_bitacora') && (
              <NavEnlace href="/bitacora">
                <ScrollText aria-hidden="true" /> Bitácora
              </NavEnlace>
            )}
          </div>
        )}

        <div className="barra-pie">
          <div className="quien">{u.nombre}</div>
          <div className="rol">{NOMBRE_ROL[u.rol]}</div>
          <div style={{ marginTop: 8 }}>
            <NavEnlace href="/cuenta">
              <KeyRound aria-hidden="true" /> Mi cuenta y seguridad
            </NavEnlace>
          </div>
          <form action={salir}>
            <button type="submit">Cerrar sesión</button>
          </form>
        </div>
      </nav>
      <main className="contenido" id="contenido">
        {children}
      </main>
    </div>
  );
}
