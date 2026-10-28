-- Esquema inicial: Centro de Redes — Departamento de Filosofía UNAL
create extension if not exists pgcrypto;

do $$ begin
  create type rol_usuario as enum ('admin', 'aprobador', 'editor', 'lector');
exception when duplicate_object then null; end $$;

do $$ begin
  create type red_social as enum ('facebook', 'instagram', 'youtube', 'linkedin', 'x');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_publicacion as enum
    ('borrador', 'en_revision', 'aprobada', 'rechazada', 'programada', 'publicando', 'publicada', 'parcial', 'fallida');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_publicacion as enum ('publicacion', 'historia', 'reel', 'video');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_comentario as enum ('nuevo', 'respondido', 'oculto', 'archivado');
exception when duplicate_object then null; end $$;

-- Usuarios y autenticación ----------------------------------------------------
create table if not exists usuarios (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  nombre text not null,
  rol rol_usuario not null default 'editor',
  password_hash text not null,
  totp_secret_cifrado text,
  totp_activo boolean not null default false,
  totp_ultimo_paso bigint not null default 0,
  intentos_fallidos int not null default 0,
  bloqueado_hasta timestamptz,
  debe_cambiar_password boolean not null default false,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  ultimo_ingreso timestamptz,
  password_cambiada_en timestamptz not null default now()
);
create unique index if not exists usuarios_email_unico on usuarios (lower(email));

create table if not exists codigos_recuperacion (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  codigo_hash text not null,
  usado_en timestamptz
);
create index if not exists codigos_recuperacion_usuario on codigos_recuperacion (usuario_id);

create table if not exists sesiones (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  usuario_id uuid not null references usuarios(id) on delete cascade,
  mfa_verificado boolean not null default false,
  creada_en timestamptz not null default now(),
  ultima_actividad timestamptz not null default now(),
  expira_en timestamptz not null,
  ip text,
  agente text
);
create index if not exists sesiones_usuario on sesiones (usuario_id);

create table if not exists intentos_ingreso (
  id bigserial primary key,
  email text,
  ip text,
  exitoso boolean not null,
  motivo text,
  creado_en timestamptz not null default now()
);
create index if not exists intentos_ingreso_ip on intentos_ingreso (ip, creado_en);
create index if not exists intentos_ingreso_email on intentos_ingreso (lower(email), creado_en);

create table if not exists ajustes (
  clave text primary key,
  valor jsonb not null,
  actualizado_por uuid references usuarios(id) on delete set null,
  actualizado_en timestamptz not null default now()
);
insert into ajustes (clave, valor) values ('autoaprobacion', 'true'::jsonb) on conflict do nothing;

-- Cuentas de redes sociales ----------------------------------------------------
create table if not exists cuentas_sociales (
  id uuid primary key default gen_random_uuid(),
  red red_social not null,
  nombre text not null,
  usuario_red text,
  id_externo text,
  modo text not null default 'demo' check (modo in ('demo', 'real')),
  token_cifrado text,
  refresh_cifrado text,
  token_expira_en timestamptz,
  datos jsonb not null default '{}'::jsonb,
  estado text not null default 'activa' check (estado in ('activa', 'requiere_reconexion', 'error', 'desactivada')),
  ultimo_error text,
  conectada_por uuid references usuarios(id) on delete set null,
  conectada_en timestamptz not null default now(),
  ultima_sincronizacion timestamptz
);
create unique index if not exists cuentas_unicas on cuentas_sociales (red, coalesce(id_externo, nombre));

create table if not exists estados_oauth (
  estado text primary key,
  usuario_id uuid not null references usuarios(id) on delete cascade,
  red text not null,
  verificador text,
  creado_en timestamptz not null default now()
);

-- Publicaciones ----------------------------------------------------------------
create table if not exists publicaciones (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  texto text not null default '',
  tipo tipo_publicacion not null default 'publicacion',
  enlace text,
  estado estado_publicacion not null default 'borrador',
  programada_para timestamptz,
  creada_por uuid references usuarios(id) on delete set null,
  enviada_en timestamptz,
  revisada_por uuid references usuarios(id) on delete set null,
  revisada_en timestamptz,
  motivo_rechazo text,
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now()
);
create index if not exists publicaciones_estado on publicaciones (estado, programada_para);

create table if not exists destinos_publicacion (
  id uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references publicaciones(id) on delete cascade,
  cuenta_id uuid not null references cuentas_sociales(id) on delete cascade,
  texto_propio text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'publicando', 'publicada', 'fallida')),
  id_externo text,
  url_externa text,
  publicada_en timestamptz,
  error text,
  unique (publicacion_id, cuenta_id)
);

create table if not exists archivos (
  id uuid primary key default gen_random_uuid(),
  publicacion_id uuid references publicaciones(id) on delete cascade,
  nombre text not null,
  mime text not null,
  tamano int not null,
  url text,
  datos bytea,
  almacen text not null check (almacen in ('blob', 'db')),
  posicion int not null default 0,
  subido_por uuid references usuarios(id) on delete set null,
  creado_en timestamptz not null default now()
);
create index if not exists archivos_publicacion on archivos (publicacion_id, posicion);

-- Contenido externo, comentarios y métricas --------------------------------------
create table if not exists publicaciones_externas (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references cuentas_sociales(id) on delete cascade,
  id_externo text not null,
  url text,
  texto text,
  tipo text,
  publicada_en timestamptz,
  me_gusta int not null default 0,
  comentarios int not null default 0,
  compartidos int not null default 0,
  guardados int not null default 0,
  vistas int not null default 0,
  alcance int not null default 0,
  actualizada_en timestamptz not null default now(),
  unique (cuenta_id, id_externo)
);
create index if not exists externas_fecha on publicaciones_externas (publicada_en desc);

create table if not exists comentarios (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references cuentas_sociales(id) on delete cascade,
  id_externo text not null,
  id_padre_externo text,
  publicacion_externa_id text,
  autor_nombre text not null,
  autor_usuario text,
  autor_avatar text,
  texto text not null,
  escrito_en timestamptz not null,
  estado estado_comentario not null default 'nuevo',
  es_propio boolean not null default false,
  respondido_por uuid references usuarios(id) on delete set null,
  respondido_en timestamptz,
  recibido_en timestamptz not null default now(),
  unique (cuenta_id, id_externo)
);
create index if not exists comentarios_bandeja on comentarios (estado, escrito_en desc);
create index if not exists comentarios_hilo on comentarios (cuenta_id, publicacion_externa_id);

create table if not exists metricas_diarias (
  cuenta_id uuid not null references cuentas_sociales(id) on delete cascade,
  dia date not null,
  seguidores int not null default 0,
  alcance int not null default 0,
  impresiones int not null default 0,
  interacciones int not null default 0,
  vistas int not null default 0,
  publicaciones int not null default 0,
  primary key (cuenta_id, dia)
);

-- Bitácora -------------------------------------------------------------------------
create table if not exists bitacora (
  id bigserial primary key,
  usuario_id uuid references usuarios(id) on delete restrict,
  accion text not null,
  entidad text,
  entidad_id text,
  detalles jsonb not null default '{}'::jsonb,
  ip text,
  creado_en timestamptz not null default now()
);
create index if not exists bitacora_fecha on bitacora (creado_en desc);
create index if not exists bitacora_entidad on bitacora (entidad, entidad_id);

-- La bitácora es de solo inserción: nadie puede editar ni borrar registros.
create or replace function bitacora_inmutable() returns trigger as $$
begin
  raise exception 'La bitácora no se puede modificar';
end; $$ language plpgsql;
drop trigger if exists bitacora_sin_cambios on bitacora;
create trigger bitacora_sin_cambios before update or delete on bitacora
  for each row execute function bitacora_inmutable();
