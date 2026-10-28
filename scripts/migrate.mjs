// Aplica en orden las migraciones SQL de db/migrations que aún no se han aplicado.
import postgres from 'postgres';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error('Falta DATABASE_URL: conecta una base de datos Postgres antes de compilar.');
  process.exit(1);
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
