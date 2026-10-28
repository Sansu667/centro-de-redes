'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { randomInt } from 'node:crypto';
import { cifrar, descifrar, igualSeguro, sha256 } from '@/lib/crypto';
import { hashPassword, problemaPassword, verificarPassword, verificarSenuelo } from '@/lib/password';
import { verificarCodigo } from '@/lib/totp';
import { cerrarSesionActual, crearSesion, elevarSesion, obtenerSesion } from '@/lib/auth';
import { anotarIntento, fallarCuenta, ipBloqueada, reiniciarFallos } from '@/lib/limites';
import { ipCliente, registrar } from '@/lib/bitacora';

export type Estado = { error?: string; codigos?: string[]; valores?: Record<string, string> } | undefined;

const MSJ_CREDENCIALES = 'Correo o contraseña incorrectos. Tras 5 intentos fallidos la cuenta se bloquea 15 minutos.';

const esquemaIngreso = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

export async function ingresar(_: Estado, form: FormData): Promise<Estado> {
  const datos = esquemaIngreso.safeParse({ email: form.get('email'), password: form.get('password') });
  const valores = { email: String(form.get('email') ?? '').slice(0, 200) };
  if (!datos.success) return { error: 'Escribe tu correo y tu contraseña.', valores };
  const { email, password } = datos.data;
  const ip = await ipCliente();

  if (await ipBloqueada(ip)) {
    await anotarIntento(email, ip, false, 'ip_bloqueada');
    return { error: 'Hubo demasiados intentos fallidos desde tu conexión. Espera 15 minutos e intenta de nuevo.', valores };
  }

  const [u] = await sql`
    select id, password_hash, activo, bloqueado_hasta, totp_activo from usuarios where lower(email) = ${email}
  `;
  if (!u || !u.activo) {
    await verificarSenuelo(password);
    await anotarIntento(email, ip, false, u ? 'inactivo' : 'no_existe');
    return { error: MSJ_CREDENCIALES, valores };
  }
  if (u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date()) {
    await verificarSenuelo(password);
    await anotarIntento(email, ip, false, 'bloqueada');
    return { error: MSJ_CREDENCIALES, valores };
  }
  if (!(await verificarPassword(u.password_hash, password))) {
    await fallarCuenta(u.id);
    await anotarIntento(email, ip, false, 'clave');
    await registrar(u.id, 'ingreso.clave_incorrecta', 'usuario', u.id);
    return { error: MSJ_CREDENCIALES, valores };
  }

  await reiniciarFallos(u.id);
  await anotarIntento(email, ip, true, 'clave_ok');
  await crearSesion(u.id, false);
  redirect(u.totp_activo ? '/ingresar/verificacion' : '/ingresar/configurar-2fa');
}

export async function verificar(_: Estado, form: FormData): Promise<Estado> {
  const s = await obtenerSesion();
  if (!s) redirect('/ingresar');
  if (s.mfa_verificado) redirect('/panel');
  const codigo = String(form.get('codigo') ?? '').replace(/\s/g, '').toUpperCase().slice(0, 20);
  const ip = await ipCliente();

  const [u] = await sql`select id, totp_secret_cifrado, totp_ultimo_paso, bloqueado_hasta from usuarios where id = ${s.usuario.id}`;
  if (u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date()) {
    await cerrarSesionActual();
    redirect('/ingresar?bloqueada=1');
  }

  let valido = false;
  let viaRecuperacion = false;
  if (/^\d{6}$/.test(codigo) && u.totp_secret_cifrado) {
    const paso = verificarCodigo(descifrar(u.totp_secret_cifrado), codigo, Number(u.totp_ultimo_paso));
    if (paso !== null) {
      // Guardar el paso impide que el mismo código se use dos veces.
      const r = await sql`update usuarios set totp_ultimo_paso = ${paso} where id = ${u.id} and totp_ultimo_paso < ${paso} returning id`;
      valido = r.length === 1;
    }
  } else if (/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(codigo)) {
    const normal = codigo.replace('-', '');
    const r = await sql`
      update codigos_recuperacion set usado_en = now()
      where id = (select id from codigos_recuperacion where usuario_id = ${u.id} and usado_en is null
                  and codigo_hash = ${sha256(normal)} limit 1)
      returning id
    `;
    valido = r.length === 1;
    viaRecuperacion = valido;
  }

  if (!valido) {
    await fallarCuenta(u.id);
    await anotarIntento(s.usuario.email, ip, false, '2fa');
    await registrar(u.id, 'ingreso.2fa_incorrecto', 'usuario', u.id);
    const [b] = await sql`select bloqueado_hasta from usuarios where id = ${u.id}`;
    if (b.bloqueado_hasta && new Date(b.bloqueado_hasta) > new Date()) {
      await cerrarSesionActual();
      redirect('/ingresar?bloqueada=1');
    }
    return { error: 'El código no es válido o ya se usó. Revisa la hora de tu teléfono y escribe el código actual.' };
  }

  await reiniciarFallos(u.id);
  await elevarSesion(s.id);
  await sql`update usuarios set ultimo_ingreso = now() where id = ${u.id}`;
  await anotarIntento(s.usuario.email, ip, true, '2fa_ok');
  await registrar(u.id, viaRecuperacion ? 'ingreso.codigo_recuperacion' : 'ingreso.exitoso', 'usuario', u.id);
  redirect('/panel');
}

function generarCodigosRecuperacion() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 10 }, () => {
    let c = '';
    while (c.length < 8) c += alfabeto[randomInt(alfabeto.length)];
    return `${c.slice(0, 4)}-${c.slice(4)}`;
  });
}

export async function confirmar2fa(_: Estado, form: FormData): Promise<Estado> {
  const s = await obtenerSesion();
  if (!s) redirect('/ingresar');
  if (s.usuario.totp_activo) redirect(s.mfa_verificado ? '/panel' : '/ingresar/verificacion');
  const codigo = String(form.get('codigo') ?? '').replace(/\s/g, '');
  const [u] = await sql`select totp_secret_cifrado from usuarios where id = ${s.usuario.id}`;
  if (!u.totp_secret_cifrado) return { error: 'Recarga la página para generar un nuevo código QR.' };
  const paso = verificarCodigo(descifrar(u.totp_secret_cifrado), codigo, 0);
  if (paso === null) {
    await fallarCuenta(s.usuario.id);
    return { error: 'El código no coincide. Asegúrate de escanear el QR de esta página y escribe el código que muestra tu app.' };
  }
  const codigos = generarCodigosRecuperacion();
  await sql.begin(async (tx) => {
    await tx`update usuarios set totp_activo = true, totp_ultimo_paso = ${paso}, intentos_fallidos = 0 where id = ${s.usuario.id}`;
    await tx`delete from codigos_recuperacion where usuario_id = ${s.usuario.id}`;
    for (const c of codigos) {
      await tx`insert into codigos_recuperacion (usuario_id, codigo_hash) values (${s.usuario.id}, ${sha256(c.replace('-', ''))})`;
    }
  });
  await elevarSesion(s.id);
  await sql`update usuarios set ultimo_ingreso = now() where id = ${s.usuario.id}`;
  await registrar(s.usuario.id, 'seguridad.2fa_activada', 'usuario', s.usuario.id);
  return { codigos };
}

export async function salir() {
  const s = await obtenerSesion();
  if (s) await registrar(s.usuario.id, 'sesion.cerrada', 'usuario', s.usuario.id);
  await cerrarSesionActual();
  redirect('/ingresar');
}

// ---------- Configuración inicial (solo cuando no hay usuarios) ----------

const esquemaInicial = z.object({
  token: z.string().min(1).max(300),
  nombre: z.string().trim().min(3).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().max(200),
  confirmacion: z.string().max(200),
});

export async function configurarInicial(_: Estado, form: FormData): Promise<Estado> {
  const ip = await ipCliente();
  const valores = { nombre: String(form.get('nombre') ?? '').slice(0, 120), email: String(form.get('email') ?? '').slice(0, 200) };
  if (await ipBloqueada(ip)) return { error: 'Demasiados intentos. Espera 15 minutos.', valores };
  const d = esquemaInicial.safeParse(Object.fromEntries(form));
  if (!d.success) return { error: 'Completa todos los campos con datos válidos.', valores };
  const esperado = process.env.SETUP_TOKEN;
  if (!esperado || esperado.length < 16 || !igualSeguro(sha256(d.data.token), sha256(esperado))) {
    await anotarIntento(d.data.email, ip, false, 'setup');
    return { error: 'El código de instalación no es correcto.', valores };
  }
  if (d.data.password !== d.data.confirmacion) return { error: 'Las contraseñas no coinciden.', valores };
  const problema = problemaPassword(d.data.password, d.data.email, d.data.nombre);
  if (problema) return { error: problema, valores };

  const hash = await hashPassword(d.data.password);
  const creado = await sql.begin(async (tx) => {
    await tx`lock table usuarios in exclusive mode`;
    const [{ n }] = await tx`select count(*)::int as n from usuarios`;
    if (n > 0) return null;
    const [u] = await tx`
      insert into usuarios (email, nombre, rol, password_hash) values (${d.data.email}, ${d.data.nombre}, 'admin', ${hash})
      returning id
    `;
    return u.id as string;
  });
  if (!creado) return { error: 'La aplicación ya tiene un administrador. Ingresa con tu cuenta.' };
  await registrar(creado, 'usuario.administrador_inicial', 'usuario', creado, { email: d.data.email });
  await crearSesion(creado, false);
  redirect('/ingresar/configurar-2fa');
}
