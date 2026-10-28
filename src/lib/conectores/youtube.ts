import type { ComentarioEntrante, Conector, CuentaConectada, MetricaDia, PublicacionExterna } from './tipos';
import { ErrorRed, dia, haceDias, pedir } from './tipos';

// YouTube Data API v3 + YouTube Analytics API v2, con OAuth de Google.

const API = 'https://www.googleapis.com/youtube/v3';

export const ALCANCES_GOOGLE = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];

function cab(c: CuentaConectada, extra: Record<string, string> = {}) {
  if (!c.token) throw new ErrorRed('La cuenta no tiene token. Vuelve a conectarla.', true);
  return { Authorization: `Bearer ${c.token}`, ...extra };
}

export function urlAutorizacionGoogle(estado: string, redirect: string) {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: redirect,
    response_type: 'code',
    scope: ALCANCES_GOOGLE.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: estado,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function intercambiar(params: Record<string, string>) {
  return pedir('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      ...params,
    }),
  });
}

export async function completarGoogle(code: string, redirect: string) {
  const t = await intercambiar({ code, redirect_uri: redirect, grant_type: 'authorization_code' });
  const canal = await pedir(`${API}/channels?part=snippet,contentDetails&mine=true`, {
    headers: { Authorization: `Bearer ${t.access_token}` },
  });
  const ch = canal.items?.[0];
  if (!ch) throw new ErrorRed('La cuenta de Google elegida no tiene un canal de YouTube.');
  return {
    red: 'youtube' as const,
    nombre: ch.snippet?.title ?? 'Canal de YouTube',
    usuario: ch.snippet?.customUrl ?? null,
    idExterno: ch.id as string,
    token: t.access_token as string,
    refresh: (t.refresh_token as string) ?? null,
    expira: new Date(Date.now() + (t.expires_in ?? 3600) * 1000),
    datos: { uploads: ch.contentDetails?.relatedPlaylists?.uploads ?? null },
  };
}

export async function refrescarGoogle(refresh: string) {
  const t = await intercambiar({ refresh_token: refresh, grant_type: 'refresh_token' });
  return { token: t.access_token as string, expira: new Date(Date.now() + (t.expires_in ?? 3600) * 1000), refresh: null };
}

async function recientes(cuenta: CuentaConectada): Promise<PublicacionExterna[]> {
  const uploads = (cuenta.datos.uploads as string) ?? 'UU' + String(cuenta.id_externo).slice(2);
  const lista = await pedir(`${API}/playlistItems?part=contentDetails&maxResults=25&playlistId=${uploads}`, { headers: cab(cuenta) });
  const ids = (lista.items ?? []).map((i: any) => i.contentDetails?.videoId).filter(Boolean);
  if (!ids.length) return [];
  const v = await pedir(`${API}/videos?part=snippet,statistics&id=${ids.join(',')}`, { headers: cab(cuenta) });
  return (v.items ?? []).map((x: any) => ({
    idExterno: x.id,
    url: `https://www.youtube.com/watch?v=${x.id}`,
    texto: x.snippet?.title ?? null,
    tipo: x.snippet?.liveBroadcastContent === 'none' ? 'video' : 'transmision',
    publicadaEn: x.snippet?.publishedAt ? new Date(x.snippet.publishedAt) : null,
    meGusta: Number(x.statistics?.likeCount ?? 0),
    comentarios: Number(x.statistics?.commentCount ?? 0),
    vistas: Number(x.statistics?.viewCount ?? 0),
  }));
}

export const conectorYouTube: Conector = {
  async publicar(cuenta, c) {
    const video = c.medios.find((m) => m.mime.startsWith('video/'));
    if (!video) throw new ErrorRed('YouTube necesita un archivo de video.');
    const descripcion = [c.texto.trim(), c.enlace ?? ''].filter(Boolean).join('\n\n').slice(0, 5000);
    const inicio = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: cab(cuenta, {
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': video.mime,
          'X-Upload-Content-Length': String(video.tamano),
        }),
        body: JSON.stringify({
          snippet: { title: c.titulo.slice(0, 100), description: descripcion, categoryId: '27', defaultLanguage: 'es' },
          status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
        }),
      },
    );
    const destino = inicio.headers.get('location');
    if (!inicio.ok || !destino) throw new ErrorRed(`YouTube rechazó la subida: ${await inicio.text()}`, inicio.status === 401);
    const origen = await fetch(video.url);
    if (!origen.ok || !origen.body) throw new ErrorRed('No se pudo leer el video guardado para enviarlo a YouTube.');
    const subida = await fetch(destino, {
      method: 'PUT',
      headers: { 'Content-Type': video.mime, 'Content-Length': String(video.tamano) },
      body: origen.body,
      // @ts-expect-error: necesario en Node para enviar un cuerpo en streaming
      duplex: 'half',
    });
    const r = await subida.json().catch(() => ({}));
    if (!subida.ok) throw new ErrorRed(`YouTube no terminó la subida: ${r?.error?.message ?? subida.status}`);
    return { idExterno: r.id, url: `https://www.youtube.com/watch?v=${r.id}` };
  },

  publicacionesRecientes: recientes,

  async comentarios(cuenta) {
    const r = await pedir(
      `${API}/commentThreads?part=snippet,replies&allThreadsRelatedToChannelId=${cuenta.id_externo}&maxResults=100&order=time&textFormat=plainText`,
      { headers: cab(cuenta) },
    );
    const salida: ComentarioEntrante[] = [];
    for (const hilo of r.items ?? []) {
      const s = hilo.snippet?.topLevelComment?.snippet ?? {};
      salida.push({
        idExterno: hilo.snippet?.topLevelComment?.id ?? hilo.id,
        idPadreExterno: null,
        publicacionExternaId: s.videoId ?? hilo.snippet?.videoId ?? null,
        autorNombre: s.authorDisplayName ?? 'Persona en YouTube',
        autorUsuario: s.authorDisplayName ?? null,
        autorAvatar: s.authorProfileImageUrl ?? null,
        texto: s.textOriginal ?? s.textDisplay ?? '',
        escritoEn: new Date(s.publishedAt),
        esPropio: s.authorChannelId?.value === cuenta.id_externo,
      });
      for (const rr of hilo.replies?.comments ?? []) {
        const q = rr.snippet ?? {};
        salida.push({
          idExterno: rr.id,
          idPadreExterno: q.parentId ?? hilo.id,
          publicacionExternaId: s.videoId ?? null,
          autorNombre: q.authorDisplayName ?? 'Persona en YouTube',
          autorUsuario: q.authorDisplayName ?? null,
          autorAvatar: q.authorProfileImageUrl ?? null,
          texto: q.textOriginal ?? q.textDisplay ?? '',
          escritoEn: new Date(q.publishedAt),
          esPropio: q.authorChannelId?.value === cuenta.id_externo,
        });
      }
    }
    return salida;
  },

  async responder(cuenta, comentario, texto) {
    const r = await pedir(`${API}/comments?part=snippet`, {
      method: 'POST',
      headers: cab(cuenta, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ snippet: { parentId: comentario.idExterno, textOriginal: texto } }),
    });
    return { idExterno: r.id };
  },

  async ocultar(cuenta, id, ocultar) {
    await pedir(`${API}/comments/setModerationStatus?id=${encodeURIComponent(id)}&moderationStatus=${ocultar ? 'heldForReview' : 'published'}`, {
      method: 'POST',
      headers: cab(cuenta),
    });
  },

  async metricas(cuenta, dias) {
    const desde = haceDias(Math.min(dias, 365));
    const hasta = new Date();
    const q = new URLSearchParams({
      ids: 'channel==MINE',
      startDate: dia(desde),
      endDate: dia(hasta),
      metrics: 'views,likes,comments,shares,subscribersGained,subscribersLost',
      dimensions: 'day',
      sort: 'day',
    });
    const [rep, canal] = await Promise.all([
      pedir(`https://youtubeanalytics.googleapis.com/v2/reports?${q}`, { headers: cab(cuenta) }),
      pedir(`${API}/channels?part=statistics&id=${cuenta.id_externo}`, { headers: cab(cuenta) }),
    ]);
    const filas: any[][] = rep.rows ?? [];
    const porDia = new Map(filas.map((f) => [String(f[0]), f]));
    let seguidores = Number(canal.items?.[0]?.statistics?.subscriberCount ?? 0);
    const salida: MetricaDia[] = [];
    for (let d = new Date(hasta); d >= desde; d = new Date(d.getTime() - 86_400_000)) {
      const k = dia(d);
      const f = porDia.get(k);
      salida.unshift({
        dia: k,
        seguidores,
        vistas: f ? Number(f[1]) : undefined,
        alcance: f ? Number(f[1]) : undefined,
        interacciones: f ? Number(f[2]) + Number(f[3]) + Number(f[4]) : undefined,
      });
      if (f) seguidores -= Number(f[5]) - Number(f[6]);
    }
    return salida;
  },
};
