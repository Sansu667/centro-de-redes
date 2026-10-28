import 'server-only';
import postgres from 'postgres';

declare global {
  // eslint-disable-next-line no-var
  var __sql: postgres.Sql | undefined;
}

function sinBase(): postgres.Sql {
  // Sin base de datos configurada: la app compila, y cualquier consulta explica qué falta.
  const fallar = () => {
    throw new Error('Falta DATABASE_URL: conecta una base de datos Neon en la pestaña Storage de Vercel y vuelve a desplegar.');
  };
  return new Proxy(fallar, { apply: fallar, get: () => fallar }) as unknown as postgres.Sql;
}

function crear() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) return sinBase();
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

const conUrl = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
export const sql: postgres.Sql = globalThis.__sql ?? (conUrl ? (globalThis.__sql = crear()) : crear());
