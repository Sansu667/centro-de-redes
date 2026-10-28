import 'server-only';
import postgres from 'postgres';

declare global {
  // eslint-disable-next-line no-var
  var __sql: postgres.Sql | undefined;
}

function crear() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Falta DATABASE_URL');
  const local = /localhost|127\.0\.0\.1/.test(url);
  return postgres(url, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
    ssl: local ? false : 'require',
    // Los poolers tipo PgBouncer (Neon "-pooler") no siempre aceptan sentencias preparadas.
    prepare: !/-pooler\.|pgbouncer=true/.test(url),
    onnotice: () => {},
    transform: { undefined: null },
  });
}

export const sql: postgres.Sql = globalThis.__sql ?? (globalThis.__sql = crear());
