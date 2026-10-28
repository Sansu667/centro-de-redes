-- Cuentas "manuales": la app prepara la publicación y una persona la publica en la red (X sin API de pago).
alter table cuentas_sociales drop constraint if exists cuentas_sociales_modo_check;
alter table cuentas_sociales add constraint cuentas_sociales_modo_check check (modo in ('demo', 'real', 'manual'));

-- "manual": lista para que alguien la publique a mano y pegue el enlace.
alter table destinos_publicacion drop constraint if exists destinos_publicacion_estado_check;
alter table destinos_publicacion add constraint destinos_publicacion_estado_check
  check (estado in ('pendiente', 'publicando', 'publicada', 'fallida', 'manual'));
