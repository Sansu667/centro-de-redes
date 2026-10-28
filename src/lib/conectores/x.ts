import { createHash } from 'node:crypto';
import type { ComentarioEntrante, Conector, CuentaConectada, MetricaDia, PublicacionExterna } from './tipos';
import { ErrorRed, dia, haceDias, pedir } from './tipos';

// X API v2 con OAuth 2.0 (PKCE). Leer menciones y respuestas requiere un plan de pago de la API de X.

const API = 'https://api.x.com/2';
export const ALCANCES_X = ['tweet.read', 'tweet.write', 'users.read', 'offline.access', 'media.write'];

function cab(c: CuentaConectada, extra: Record<string, string> = {}) {
  if (!c.token) throw new ErrorRed('La cuenta no tiene token. Vuelve a conectarla.', true);
  return { Authorization: `Bearer ${c.token}`, ...extra };
}

export function retoPkce(verificador: string) {
  return createHash('sha256').update(verificador).digest('base64url');
}

export function urlAutorizacionX(estado: string, redirect: string, verificador: string) {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.X_CLIENT_ID ?? '',
    redirect_uri: redirect,
    scope: ALCANCES_X.join(' '),
    state: estado,
    code_challenge: retoPkce(verificador),
    code_challenge_method: 'S256',
  });
  return `https://x.com/i/oauth2/authorize?${q}`;
}

async function tokenX(params: Record<string, string>) {
  const basica = Buffer.from(`${process.env.X_CLIENT_ID ?? ''}:${process.env.X_CLIENT_SECRET ?? ''}`).toString('base64');
  return pedir(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basica}` },
    body: new URLSearchParams({ client_id: process.env.X_CLIENT_ID ?? '', ...params }),
  });
}

export async function completarX(code: string, redirect: string, verificador: string) {
  const t = await tokenX({ grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verificador });
  const yo = await pedir(`${API}/users/me?user.fields=username,name`, { headers: { Authorization: `Bearer ${t.access_token}` } });
  return {
    red: 'x' as const,
    nombre: yo.data?.name ?? 'Cuenta de X',
    usuario: yo.data?.username ? `@${yo.data.username}` : null,
    idExterno: yo.data?.id as string,
    token: t.access_token as string,
    refresh: (t.refresh_token as string) ?? null,
    expira: new Date(Date.now() + (t.expires_in ?? 7200) * 1000),
    datos: {},
  };
}

export async function refrescarX(refresh: string) {
  const t = await tokenX({ grant_type: 'refresh_token', refresh_token: refresh });
  return {
    token: t.access_token as string,
    expira: new Date(Date.now() + (t.expires_in ?? 7200) * 1000),
    refresh: (t.refresh_token as string) ?? null,
  };
}

async function subirMedio(c: CuentaConectada, m: { url: string; mime: string; tamano: number }) {
  const datos = Buffer.from(await (await fetch(m.url)).arrayBuffer());
  const esVideo = m.mime.startsWith('video/');
  if (!esVideo) {
    const form = new FormData();
    form.set('media', new Blob([datos], { type: m.mime }));
    form.set('media_category', 'tweet_image');
    const r = await pedir(`${API}/media/upload`, { method: 'POST', headers: cab(c), body: form });
    return r.data?.id as string;
  }
  const ini = await pedir(`${API}/media/upload/initialize`, {
    method: 'POST',
    headers: cab(c, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ media_type: m.mime, total_bytes: datos.length, media_category: 'tweet_video' }),
  });
  const id = ini.data?.id as string;
  const TROZO = 4 * 1024 * 1024;
  for (let i = 0, seg = 0; i < datos.length; i += TROZO, seg++) {
    const form = new FormData();
    form.set('media', new Blob([datos.subarray(i, i + TROZO)]));
    form.set('segment_index', String(seg));
    await pedir(`${API}/media/upload/${id}/append`, { method: 'POST', headers: cab(c), body: form, tiempo: 120_000 });
  }
  let fin = await pedir(`${API}/media/upload/${id}/finalize`, { method: 'POST', headers: cab(c) });
  for (let i = 0; i < 40 && fin.data?.processing_info && fin.data.processing_info.state !== 'succeeded'; i++) {
    if (fin.data.processing_info.state === 'failed') throw new ErrorRed('X no pudo procesar el video.');
    await new Promise((r) => setTimeout(r, (fin.data.processing_info.check_after_secs ?? 3) * 1000));
    fin = await pedir(`${API}/media/upload?command=STATUS&media_id=${id}`, { headers: cab(c) });
  }
  return id;
}

export const conectorX: Conector = {
  async publicar(cuenta, c) {
    const texto = [c.texto.trim(), c.enlace && !c.texto.includes(c.enlace) ? c.enlace : ''].filter(Boolean).join(' ');
    const ids: string[] = [];
    for (const m of c.medios.slice(0, 4)) ids.push(await subirMedio(cuenta, m));
    const r = await pedir(`${API}/tweets`, {
      method: 'POST',
      headers: cab(cuenta, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ text: texto, ...(ids.length ? { media: { media_ids: ids } } : {}) }),
    });
    const usuario = (cuenta.usuario_red ?? '').replace('@', '') || 'i';
    return { idExterno: r.data.id, url: `https://x.com/${usuario}/status/${r.data.id}` };
  },

  async publicacionesRecientes(cuenta) {
    const r = await pedir(
      `${API}/users/${cuenta.id_externo}/tweets?max_results=25&exclude=replies,retweets&tweet.fields=created_at,public_metrics`,
      { headers: cab(cuenta) },
    );
    const usuario = (cuenta.usuario_red ?? '').replace('@', '') || 'i';
    return (r.data ?? []).map(
      (t: any): PublicacionExterna => ({
        idExterno: t.id,
        url: `https://x.com/${usuario}/status/${t.id}`,
        texto: t.text,
        tipo: 'publicacion',
        publicadaEn: t.created_at ? new Date(t.created_at) : null,
        meGusta: t.public_metrics?.like_count ?? 0,
        comentarios: t.public_metrics?.reply_count ?? 0,
        compartidos: (t.public_metrics?.retweet_count ?? 0) + (t.public_metrics?.quote_count ?? 0),
        guardados: t.public_metrics?.bookmark_count ?? 0,
        vistas: t.public_metrics?.impression_count ?? 0,
      }),
    );
  },

  async comentarios(cuenta) {
    const r = await pedir(
      `${API}/users/${cuenta.id_externo}/mentions?max_results=100&tweet.fields=created_at,conversation_id,in_reply_to_user_id,referenced_tweets,author_id&expansions=author_id&user.fields=username,name,profile_image_url`,
      { headers: cab(cuenta) },
    );
    const usuarios = new Map<string, any>((r.includes?.users ?? []).map((u: any) => [u.id, u]));
    return (r.data ?? []).map((t: any): ComentarioEntrante => {
      const u = usuarios.get(t.author_id);
      const padre = (t.referenced_tweets ?? []).find((x: any) => x.type === 'replied_to')?.id ?? null;
      return {
        idExterno: t.id,
        idPadreExterno: padre,
        publicacionExternaId: t.conversation_id ?? padre,
        autorNombre: u?.name ?? 'Persona en X',
        autorUsuario: u?.username ? `@${u.username}` : null,
        autorAvatar: u?.profile_image_url ?? null,
        texto: t.text,
        escritoEn: new Date(t.created_at),
        esPropio: t.author_id === cuenta.id_externo,
      };
    });
  },

  async responder(cuenta, comentario, texto) {
    const r = await pedir(`${API}/tweets`, {
      method: 'POST',
      headers: cab(cuenta, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ text: texto, reply: { in_reply_to_tweet_id: comentario.idExterno } }),
    });
    return { idExterno: r.data.id };
  },

  async ocultar(cuenta, id, ocultar) {
    await pedir(`${API}/tweets/${id}/hidden`, {
      method: 'PUT',
      headers: cab(cuenta, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ hidden: ocultar }),
    });
  },

  async metricas(cuenta, dias) {
    const yo = await pedir(`${API}/users/${cuenta.id_externo}?user.fields=public_metrics`, { headers: cab(cuenta) });
    const pubs = await conectorX.publicacionesRecientes(cuenta);
    const porDia = new Map<string, MetricaDia>();
    for (const p of pubs) {
      if (!p.publicadaEn) continue;
      const k = dia(p.publicadaEn);
      const m = porDia.get(k) ?? { dia: k, impresiones: 0, interacciones: 0, publicaciones: 0 };
      m.impresiones! += p.vistas ?? 0;
      m.interacciones! += (p.meGusta ?? 0) + (p.comentarios ?? 0) + (p.compartidos ?? 0);
      m.publicaciones! += 1;
      porDia.set(k, m);
    }
    const desde = haceDias(Math.min(dias, 30));
    const salida: MetricaDia[] = [];
    for (let d = new Date(desde); d <= new Date(); d = new Date(d.getTime() + 86_400_000)) {
      const k = dia(d);
      salida.push(porDia.get(k) ?? { dia: k });
    }
    // X no da historial de seguidores: se guarda el valor de hoy y la serie se forma día a día.
    salida[salida.length - 1].seguidores = yo.data?.public_metrics?.followers_count ?? 0;
    return salida;
  },
};
