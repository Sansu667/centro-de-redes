'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { usuarioParaAccion, type Usuario } from '@/lib/auth';
import { puede } from '@/lib/roles';
import { registrar } from '@/lib/bitacora';
import { autoaprobacionPermitida } from '@/lib/ajustes';
import { problemasParaRed, INFO_RED, type Red, type TipoPublicacion } from '@/lib/redes';
import { desdeBogota } from '@/lib/formato';
import { publicarAhora } from '@/lib/publicador';

export type EstadoForm = { error?: string; problemas?: string[] } | undefined;

const uuid = z.string().uuid();

const esquema = z.object({
  id: uuid.optional().or(z.literal('')),
  titulo: z.string().trim().min(3, 'El título necesita al menos 3 caracteres.').max(150),
  texto: z.string().max(63206).default(''),
  tipo: z.enum(['publicacion', 'historia', 'reel', 'video']),
  enlace: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => v === '' || /^https:\/\/[^\s]+$/i.test(v), 'El enlace debe empezar por https://')
    .optional()
    .default(''),
  programada: z.string().optional().default(''),
  intencion: z.enum(['borrador', 'revision', 'publicar']),
});

const EDITABLES = ['borrador', 'rechazada', 'en_revision', 'aprobada', 'programada', 'fallida'];

async function puedeEditar(u: Usuario, pub: { creada_por: string | null; estado: string }) {
  if (!EDITABLES.includes(pub.estado)) return false;
  if (puede(u.rol, 'aprobar')) return true;
  return pub.creada_por === u.id && ['borrador', 'rechazada', 'en_revision'].includes(pub.estado);
}

async function puedeAutoaprobar(u: Usuario) {
  return puede(u.rol, 'aprobar') && (await autoaprobacionPermitida());
}

export async function guardarPublicacion(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const u = await usuarioParaAccion('crear_publicacion');
  const d = esquema.safeParse({
    id: form.get('id') ?? '',
    titulo: form.get('titulo'),
    texto: form.get('texto') ?? '',
    tipo: form.get('tipo'),
    enlace: form.get('enlace') ?? '',
    programada: form.get('programada') ?? '',
    intencion: form.get('intencion'),
  });
  if (!d.success) return { error: d.error.issues[0]?.message ?? 'Revisa los datos.' };
  const v = d.data;
  const cuentas = z.array(uuid).max(20).safeParse(form.getAll('cuentas'));
  const archivos = z.array(uuid).max(10).safeParse(form.getAll('archivos'));
  if (!cuentas.success || !archivos.success) return { error: 'La selección de redes o archivos no es válida.' };

  let programada: Date | null = null;
  if (v.programada) {
    programada = desdeBogota(v.programada);
    if (!programada) return { error: 'La fecha de programación no es válida.' };
    if (programada.getTime() < Date.now() + 2 * 60_000 && v.intencion !== 'borrador') {
      return { error: 'Programa la publicación al menos 2 minutos en el futuro, o quita la fecha para publicar al aprobar.' };
    }
  }

  if (v.intencion === 'publicar' && !(await puedeAutoaprobar(u))) {
    return { error: 'Tu cuenta no puede aprobar sus propias publicaciones. Envíala a revisión.' };
  }

  // Cuentas destino y archivos: deben existir y (los archivos) pertenecer a este usuario o a esta publicación.
  const filasCuentas = cuentas.data.length
    ? await sql`select id, red, nombre from cuentas_sociales where id in ${sql(cuentas.data)} and estado <> 'desactivada'`
    : [];
  if (filasCuentas.length !== cuentas.data.length) return { error: 'Alguna de las cuentas elegidas ya no está disponible.' };
  const filasArchivos = archivos.data.length
    ? await sql`select id, mime, publicacion_id, subido_por from archivos where id in ${sql(archivos.data)}`
    : [];
  if (filasArchivos.length !== archivos.data.length) return { error: 'Alguno de los archivos ya no existe. Vuelve a subirlo.' };

  let actual: { id: string; creada_por: string | null; estado: string } | null = null;
  if (v.id) {
    [actual] = (await sql`select id, creada_por, estado from publicaciones where id = ${v.id}`) as any;
    if (!actual) return { error: 'La publicación no existe.' };
    if (!(await puedeEditar(u, actual))) return { error: 'Esta publicación ya no se puede editar.' };
  }
  for (const a of filasArchivos) {
    const propio = a.subido_por === u.id && !a.publicacion_id;
    const deEsta = actual && a.publicacion_id === actual.id;
    if (!propio && !deEsta) return { error: 'Uno de los archivos no te pertenece.' };
  }

  // Textos por red y validación contra las reglas de cada red.
  const textos = new Map<string, string | null>();
  const problemas: string[] = [];
  const ordenArchivos = archivos.data.map((id) => ({ mime: String(filasArchivos.find((a) => a.id === id)!.mime) }));
  for (const c of filasCuentas) {
    const propio = form.get(`texto_${c.id}`);
    const texto = typeof propio === 'string' && propio.trim() ? propio : null;
    textos.set(c.id, texto);
    if (v.intencion !== 'borrador') {
      for (const p of problemasParaRed(c.red as Red, v.tipo as TipoPublicacion, texto ?? v.texto, ordenArchivos)) {
        problemas.push(`${c.nombre}: ${p}`);
      }
    }
  }
  if (v.intencion !== 'borrador' && filasCuentas.length === 0) problemas.push('Elige al menos una red donde publicar.');
  if (problemas.length) return { error: 'La publicación no cumple las reglas de alguna red.', problemas };

  const autoaprobada = v.intencion === 'publicar';
  const estado =
    v.intencion === 'borrador' ? 'borrador' : !autoaprobada ? 'en_revision' : programada ? 'programada' : 'aprobada';

  const id = await sql.begin(async (tx) => {
    let pid = actual?.id;
    if (pid) {
      await tx`
        update publicaciones set titulo = ${v.titulo}, texto = ${v.texto}, tipo = ${v.tipo}, enlace = ${v.enlace || null},
          programada_para = ${programada}, estado = ${estado}, actualizada_en = now(),
          enviada_en = case when ${estado} = 'en_revision' then now() else enviada_en end,
          revisada_por = ${autoaprobada ? u.id : null}, revisada_en = ${autoaprobada ? new Date() : null},
          motivo_rechazo = null
        where id = ${pid}
      `;
    } else {
      const [n] = await tx`
        insert into publicaciones (titulo, texto, tipo, enlace, programada_para, estado, creada_por, enviada_en, revisada_por, revisada_en)
        values (${v.titulo}, ${v.texto}, ${v.tipo}, ${v.enlace || null}, ${programada}, ${estado}, ${u.id},
          ${estado === 'en_revision' ? new Date() : null}, ${autoaprobada ? u.id : null}, ${autoaprobada ? new Date() : null})
        returning id
      `;
      pid = n.id as string;
    }
    await tx`delete from destinos_publicacion where publicacion_id = ${pid} and estado <> 'publicada'
             and cuenta_id not in ${tx(cuentas.data.length ? cuentas.data : ['00000000-0000-0000-0000-000000000000'])}`;
    for (const c of filasCuentas) {
      await tx`
        insert into destinos_publicacion (publicacion_id, cuenta_id, texto_propio)
        values (${pid}, ${c.id}, ${textos.get(c.id) ?? null})
        on conflict (publicacion_id, cuenta_id) do update set texto_propio = excluded.texto_propio
      `;
    }
    await tx`delete from archivos where publicacion_id = ${pid}
             and id not in ${tx(archivos.data.length ? archivos.data : ['00000000-0000-0000-0000-000000000000'])}`;
    for (const [i, aid] of archivos.data.entries()) {
      await tx`update archivos set publicacion_id = ${pid}, posicion = ${i} where id = ${aid}`;
    }
    return pid!;
  });

  const accion = actual ? 'publicacion.editada' : 'publicacion.creada';
  await registrar(u.id, accion, 'publicacion', id, {
    estado,
    redes: filasCuentas.map((c) => INFO_RED[c.red as Red].nombre),
    programada: programada?.toISOString() ?? null,
  });
  if (autoaprobada) await registrar(u.id, 'publicacion.aprobada', 'publicacion', id, { autoaprobada: true });
  if (estado === 'aprobada') {
    try {
      await publicarAhora(id, u.id);
    } catch {}
  }
  revalidatePath('/', 'layout');
  redirect(`/publicaciones/${id}`);
}

async function cargar(id: string) {
  if (!uuid.safeParse(id).success) throw new Error('Identificador no válido.');
  const [p] = await sql`select * from publicaciones where id = ${id}`;
  if (!p) throw new Error('La publicación no existe.');
  return p;
}

export async function aprobar(id: string): Promise<void> {
  const u = await usuarioParaAccion('aprobar');
  const p = await cargar(id);
  if (p.estado !== 'en_revision') throw new Error('Solo se aprueban publicaciones que están en revisión.');
  if (p.creada_por === u.id && !(await autoaprobacionPermitida())) {
    throw new Error('Otra persona con rol de aprobador debe revisar esta publicación.');
  }
  const programada = p.programada_para && new Date(p.programada_para).getTime() > Date.now();
  await sql`
    update publicaciones set estado = ${programada ? 'programada' : 'aprobada'}, revisada_por = ${u.id},
      revisada_en = now(), actualizada_en = now()
    where id = ${id} and estado = 'en_revision'
  `;
  await registrar(u.id, 'publicacion.aprobada', 'publicacion', id, { programada: Boolean(programada) });
  if (!programada) await publicarAhora(id, u.id);
  revalidatePath('/', 'layout');
}

export async function rechazar(id: string, motivo: string): Promise<void> {
  const u = await usuarioParaAccion('aprobar');
  const p = await cargar(id);
  const m = z.string().trim().min(5, 'Explica en una frase qué hay que cambiar.').max(1000).parse(motivo);
  if (!['en_revision', 'aprobada', 'programada'].includes(p.estado)) throw new Error('Esta publicación ya no se puede rechazar.');
  await sql`
    update publicaciones set estado = 'rechazada', motivo_rechazo = ${m}, revisada_por = ${u.id}, revisada_en = now(), actualizada_en = now()
    where id = ${id}
  `;
  await registrar(u.id, 'publicacion.rechazada', 'publicacion', id, { motivo: m });
  revalidatePath('/', 'layout');
}

export async function enviarARevision(id: string): Promise<void> {
  const u = await usuarioParaAccion('crear_publicacion');
  const p = await cargar(id);
  if (!['borrador', 'rechazada'].includes(p.estado)) throw new Error('La publicación ya fue enviada.');
  if (p.creada_por !== u.id && !puede(u.rol, 'aprobar')) throw new Error('Solo quien la creó puede enviarla.');
  const destinos = await sql`select count(*)::int as n from destinos_publicacion where publicacion_id = ${id}`;
  if (!destinos[0].n) throw new Error('Edita la publicación y elige al menos una red antes de enviarla.');
  await sql`update publicaciones set estado = 'en_revision', enviada_en = now(), motivo_rechazo = null, actualizada_en = now() where id = ${id}`;
  await registrar(u.id, 'publicacion.enviada_revision', 'publicacion', id);
  revalidatePath('/', 'layout');
}

export async function reintentar(id: string): Promise<void> {
  const u = await usuarioParaAccion('aprobar');
  const p = await cargar(id);
  if (!['aprobada', 'fallida', 'parcial', 'programada'].includes(p.estado)) throw new Error('No hay nada pendiente por publicar.');
  await registrar(u.id, 'publicacion.publicar_ahora', 'publicacion', id);
  await publicarAhora(id, u.id);
  revalidatePath('/', 'layout');
}

export async function cancelarProgramacion(id: string): Promise<void> {
  const u = await usuarioParaAccion('aprobar');
  const r = await sql`update publicaciones set estado = 'borrador', programada_para = null, actualizada_en = now()
                      where id = ${id} and estado = 'programada' returning id`;
  if (!r.length) throw new Error('La publicación ya no está programada.');
  await registrar(u.id, 'publicacion.programacion_cancelada', 'publicacion', id);
  revalidatePath('/', 'layout');
}

export async function eliminar(id: string): Promise<void> {
  const u = await usuarioParaAccion('crear_publicacion');
  const p = await cargar(id);
  if (!['borrador', 'rechazada'].includes(p.estado)) throw new Error('Solo se eliminan borradores o publicaciones rechazadas.');
  if (p.creada_por !== u.id && u.rol !== 'admin') throw new Error('Solo quien la creó o un administrador puede eliminarla.');
  await sql`delete from publicaciones where id = ${id}`;
  await registrar(u.id, 'publicacion.eliminada', 'publicacion', id, { titulo: p.titulo });
  revalidatePath('/', 'layout');
  redirect('/publicaciones');
}
