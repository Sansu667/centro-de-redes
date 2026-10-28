// Aplica en orden las migraciones SQL de db/migrations que aún no se han aplicado.
import postgres from 'postgres';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_POSTGRES_URL;
if (!url) {
  // Primer despliegue sin base de datos: se compila igual y las tablas se crean en el siguiente despliegue.
  console.warn('Aviso: falta DATABASE_URL. Conecta Neon en la pestaña Storage de Vercel y vuelve a desplegar.');
  process.exit(0);
}
const local = /localhost|127\.0\.0\.1/.test(url);
const sql = postgres(url, { max: 1, onnotice: () => {}, ssl: local ? false : 'require', prepare: false });
const dir = path.join(process.cwd(), 'db', 'migrations');
try {
  await sql`create table if not exists _migraciones (nombre text primary key, aplicada_en timestamptz not null default now())`;
  const aplicadas = new Set((await sql`select nombre from _migraciones`).map((r) => r.nombre));
  const archivos = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of archivos) {
    if (aplicadas.has(f)) continue;
    const texto = await readFile(path.join(dir, f), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(texto);
      await tx`insert into _migraciones (nombre) values (${f})`;
    });
    console.log(`Migración aplicada: ${f}`);
  }
  console.log('Base de datos al día.');
} finally {
  await sql.end();
}
