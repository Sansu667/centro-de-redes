import 'server-only';
import { randomUUID } from 'node:crypto';
import { sql } from './db';
import { metricasDemo } from './conectores/demo';
import type { Red } from './redes';

// Contenido simulado para las cuentas de demostración. Se reconoce porque todos los
// identificadores externos empiezan por "demo_".

const PIEZAS = [
  'Conferencia inaugural: «El giro geológico de la filosofía. De la condición humana a la condición terrestre», con la profesora Diana M. Muñoz. Auditorio Margarita González, 4:00 p. m.',
  'Abrimos la convocatoria de admisión a los posgrados en Filosofía 2027-1. Maestría y doctorado: requisitos, fechas y documentos en la página del Departamento.',
  'Sendas no perdidas. Nuevas investigaciones en filosofía hermenéutica: presentación de libro este jueves, con transmisión en vivo y preguntas del público.',
  'Seminario permanente del grupo Peiras: lectura comentada de la Ética nicomaquea, libro VII, sobre la akrasía.',
  'Coloquio de estudiantes de pregrado: abiertas las inscripciones para presentar ponencias. Fecha límite: viernes.',
  'Reseña: nuevo libro del profesor Rodolfo Arango sobre emociones, democracia y anticolonialismo en Kant.',
  'Charla del grupo Filosofía y Cognición: contenido no conceptual y percepción. Entrada libre.',
  'Recordatorio: hoy a las 4:00 p. m. transmitimos por YouTube la conferencia inaugural del semestre.',
  'Lanzamiento del número más reciente de Ideas y Valores. Conoce los artículos y la convocatoria abierta.',
  'Encuentro sobre filosofía latinoamericana y filosofías indígenas de Colombia con el profesor Juan Alejandro Chindoy.',
  'Cátedra abierta de bioética: críticas feministas decoloniales al principialismo, con la profesora María Lucía Rivera.',
  'Taller de escritura académica para estudiantes de maestría. Cupos limitados, inscripción por formulario.',
];

const AUTORES = [
  'Laura Gómez', 'Andrés Rojas', 'María Camila Díaz', 'Felipe Martínez', 'Valentina Castro', 'Juan Sebastián León',
  'Natalia Pérez', 'Santiago Herrera', 'Daniela Ruiz', 'Camilo Vargas', 'Paula Andrea Ríos', 'Julián Moreno',
  'Isabella Torres', 'Sergio Quintero', 'Carolina Mejía', 'Óscar Patiño',
];

const COMENTARIOS = [
  '¿Quedará grabada la conferencia? No alcanzo a llegar a las 4.',
  '¿La entrada es libre o hay que inscribirse antes?',
  'Excelente iniciativa, ojalá hagan más eventos así.',
  '¿Dónde queda el auditorio Margarita González? ¿En el edificio de posgrados?',
  'Para la maestría, ¿el examen de inglés es requisito para la inscripción o para la admisión?',
  '¿Pueden compartir el enlace de la transmisión?',
  'Muy interesante el tema del giro geológico, ¿hay bibliografía recomendada?',
  'Felicitaciones al Departamento por la programación de este semestre.',
  '¿Los estudiantes de otras carreras pueden asistir al seminario?',
  '¿Hasta qué fecha reciben documentos para el doctorado?',
  'No se escucha bien el audio de la transmisión.',
  '¿Habrá certificado de asistencia?',
  'Qué buena charla, gracias por transmitirla.',
  '¿El taller de escritura tiene costo?',
  '¿Se puede presentar ponencia en coautoría?',
];

function aleatorio(semilla: number) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export async function sembrarDemo(cuentaId: string, red: Red) {
  const hasta = new Date();
  const desde = new Date(Date.now() - 119 * 86_400_000);
  const metricas = metricasDemo(red, desde, hasta);
  for (const m of metricas) {
    await sql`
      insert into metricas_diarias (cuenta_id, dia, seguidores, alcance, impresiones, interacciones, vistas, publicaciones)
      values (${cuentaId}, ${m.dia}, ${m.seguidores ?? 0}, ${m.alcance ?? 0}, ${m.impresiones ?? 0}, ${m.interacciones ?? 0}, ${m.vistas ?? 0}, ${m.publicaciones ?? 0})
      on conflict (cuenta_id, dia) do nothing
    `;
  }

  const r = aleatorio(red.length * 7919 + red.charCodeAt(0));
  const factor = { facebook: 1, instagram: 1.4, youtube: 0.6, linkedin: 0.5, x: 0.3 }[red];
  const publicaciones: { id: string; dias: number }[] = [];
  for (let i = 0; i < PIEZAS.length; i++) {
    const dias = Math.round(i * 7 + r() * 5);
    const id = `demo_${randomUUID().slice(0, 12)}`;
    publicaciones.push({ id, dias });
    const base = Math.round((40 + r() * 160) * factor);
    await sql`
      insert into publicaciones_externas (cuenta_id, id_externo, url, texto, tipo, publicada_en, me_gusta, comentarios, compartidos, guardados, vistas, alcance)
      values (${cuentaId}, ${id}, null, ${red === 'x' ? PIEZAS[i].slice(0, 270) : PIEZAS[i]}, ${red === 'youtube' ? 'video' : 'publicacion'},
        ${new Date(Date.now() - dias * 86_400_000 - r() * 8 * 3600_000)}, ${base}, ${Math.round(base * 0.08 + r() * 6)},
        ${Math.round(base * 0.15 * r())}, ${Math.round(base * 0.1 * r())}, ${Math.round(base * (10 + r() * 20))}, ${Math.round(base * (8 + r() * 12))})
    `;
  }

  const cuantos = { facebook: 14, instagram: 12, youtube: 9, linkedin: 5, x: 5 }[red];
  for (let i = 0; i < cuantos; i++) {
    const pub = publicaciones[Math.floor(r() * 5)];
    const horas = Math.round(r() * Math.min(pub.dias * 24 + 6, 24 * 10));
    const estado = i < cuantos * 0.6 ? 'nuevo' : r() > 0.3 ? 'respondido' : 'archivado';
    const autor = AUTORES[Math.floor(r() * AUTORES.length)];
    await sql`
      insert into comentarios (cuenta_id, id_externo, publicacion_externa_id, autor_nombre, autor_usuario, texto, escrito_en, estado,
        respondido_en)
      values (${cuentaId}, ${`demo_${randomUUID().slice(0, 12)}`}, ${pub.id}, ${autor},
        ${red === 'instagram' || red === 'x' ? '@' + autor.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').replace(/ /g, '.') : null},
        ${COMENTARIOS[Math.floor(r() * COMENTARIOS.length)]}, ${new Date(Date.now() - horas * 3600_000)}, ${estado},
        ${estado === 'respondido' ? new Date(Math.min(Date.now(), Date.now() - horas * 3600_000 + (1 + r() * 20) * 3600_000)) : null})
    `;
  }
  await sql`update cuentas_sociales set ultima_sincronizacion = now() where id = ${cuentaId}`;
}
