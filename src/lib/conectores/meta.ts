import type {
  ComentarioEntrante,
  Conector,
  ContenidoAPublicar,
  CuentaConectada,
  MetricaDia,
  PublicacionExterna,
} from './tipos';
import { ErrorRed, dia, haceDias, pedir } from './tipos';

// Facebook (páginas) e Instagram (cuentas profesionales) mediante la Graph API de Meta.

const V = () => process.env.META_GRAPH_VERSION || 'v24.0';
const G = (ruta: string) => `https://graph.facebook.com/${V()}/${ruta.replace(/^\//, '')}`;

function token(c: CuentaConectada) {
  if (!c.token) throw new ErrorRed('La cuenta no tiene token. Vuelve a conectarla.', true);
  return c.token;
}

async function get(c: CuentaConectada, ruta: string, params: Record<string, string> = {}) {
  const q = new URLSearchParams({ ...params, access_token: token(c) });
  return pedir(`${G(ruta)}?${q}`);
}

async function post(c: CuentaConectada, ruta: string, params: Record<string, unknown> = {}) {
  const cuerpo = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    cuerpo.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  cuerpo.set('access_token', token(c));
  return pedir(G(ruta), { method: 'POST', body: cuerpo, tiempo: 120_000 });
}

/** Une título, texto y enlace en el texto que verá la red. */
function textoCompleto(c: ContenidoAPublicar, conEnlace = true) {
  const partes = [c.texto.trim()];
  if (conEnlace && c.enlace && !c.texto.includes(c.enlace)) partes.push(c.enlace);
  return partes.filter(Boolean).join('\n\n');
}

// ---------- Facebook ----------

async function publicarFacebook(cuenta: CuentaConectada, c: ContenidoAPublicar) {
  const pagina = cuenta.id_externo!;
  const imagenes = c.medios.filter((m) => m.mime.startsWith('image/'));
  const video = c.medios.find((m) => m.mime.startsWith('video/'));

  if (c.tipo === 'historia') {
    if (!imagenes[0]) throw new ErrorRed('Las historias de Facebook se publican con una imagen.');
    const foto = await post(cuenta, `${pagina}/photos`, { url: imagenes[0].url, published: false });
    const r = await post(cuenta, `${pagina}/photo_stories`, { photo_id: foto.id });
    return { idExterno: r.post_id ?? foto.id, url: null };
  }

  if (video) {
    const r = await post(cuenta, `${pagina}/videos`, {
      file_url: video.url,
      title: c.titulo,
      description: textoCompleto(c),
    });
    return { idExterno: r.id, url: `https://www.facebook.com/${r.id}` };
  }

  if (imagenes.length === 1) {
    const r = await post(cuenta, `${pagina}/photos`, { url: imagenes[0].url, caption: textoCompleto(c) });
    const id = r.post_id ?? r.id;
    return { idExterno: id, url: `https://www.facebook.com/${id}` };
  }

  const adjuntos: { media_fbid: string }[] = [];
  for (const img of imagenes) {
    const f = await post(cuenta, `${pagina}/photos`, { url: img.url, published: false });
    adjuntos.push({ media_fbid: f.id });
  }
  const r = await post(cuenta, `${pagina}/feed`, {
    message: textoCompleto(c, adjuntos.length > 0),
    link: adjuntos.length === 0 ? c.enlace ?? undefined : undefined,
    attached_media: adjuntos.length ? adjuntos : undefined,
  });
  return { idExterno: r.id, url: `https://www.facebook.com/${r.id}` };
}

async function recientesFacebook(cuenta: CuentaConectada): Promise<PublicacionExterna[]> {
  const r = await get(cuenta, `${cuenta.id_externo}/published_posts`, {
    fields:
      'id,message,permalink_url,created_time,status_type,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)',
    limit: '25',
  });
  return (r.data ?? []).map((p: any) => ({
    idExterno: p.id,
    url: p.permalink_url ?? null,
    texto: p.message ?? null,
    tipo: p.status_type ?? 'publicacion',
    publicadaEn: p.created_time ? new Date(p.created_time) : null,
    meGusta: p.reactions?.summary?.total_count ?? 0,
    comentarios: p.comments?.summary?.total_count ?? 0,
    compartidos: p.shares?.count ?? 0,
  }));
}

async function comentariosFacebook(cuenta: CuentaConectada, pubs: PublicacionExterna[]): Promise<ComentarioEntrante[]> {
  const salida: ComentarioEntrante[] = [];
  for (const p of pubs.filter((x) => (x.comentarios ?? 0) > 0).slice(0, 15)) {
    const r = await get(cuenta, `${p.idExterno}/comments`, {
      filter: 'stream',
      order: 'reverse_chronological',
      fields: 'id,from{id,name},message,created_time,parent{id}',
      limit: '100',
    });
    for (const k of r.data ?? []) {
      salida.push({
        idExterno: k.id,
        idPadreExterno: k.parent?.id ?? null,
        publicacionExternaId: p.idExterno,
        autorNombre: k.from?.name ?? 'Persona en Facebook',
        autorUsuario: null,
        autorAvatar: null,
        texto: k.message ?? '',
        escritoEn: new Date(k.created_time),
        esPropio: k.from?.id === cuenta.id_externo,
      });
    }
  }
  return salida;
}

async function insightsSerie(cuenta: CuentaConectada, objeto: string, candidatos: string[], desde: Date, hasta: Date, extra: Record<string, string> = {}) {
  for (const metrica of candidatos) {
    try {
      const r = await get(cuenta, `${objeto}/insights`, {
        metric: metrica,
        period: 'day',
        since: String(Math.floor(desde.getTime() / 1000)),
        until: String(Math.floor(hasta.getTime() / 1000)),
        ...extra,
      });
      const valores = r.data?.[0]?.values;
      if (Array.isArray(valores)) {
        const m = new Map<string, number>();
        for (const v of valores) m.set(String(v.end_time).slice(0, 10), Number(v.value) || 0);
        return m;
      }
    } catch {
      // Meta retira métricas con frecuencia: se prueba la siguiente de la lista.
    }
  }
  return new Map<string, number>();
}

async function metricasFacebook(cuenta: CuentaConectada, dias: number): Promise<MetricaDia[]> {
  const hasta = new Date();
  const desde = haceDias(Math.min(dias, 90));
  const pagina = cuenta.id_externo!;
  const info = await get(cuenta, pagina, { fields: 'followers_count,fan_count' });
  const [alcance, impresiones, interacciones, vistas] = await Promise.all([
    insightsSerie(cuenta, pagina, ['page_total_media_view_unique', 'page_impressions_unique'], desde, hasta),
    insightsSerie(cuenta, pagina, ['page_media_view', 'page_impressions'], desde, hasta),
    insightsSerie(cuenta, pagina, ['page_post_engagements'], desde, hasta),
    insightsSerie(cuenta, pagina, ['page_views_total'], desde, hasta),
  ]);
  const salida: MetricaDia[] = [];
  for (let d = new Date(desde); d <= hasta; d = new Date(d.getTime() + 86_400_000)) {
    const k = dia(d);
    salida.push({ dia: k, alcance: alcance.get(k), impresiones: impresiones.get(k), interacciones: interacciones.get(k), vistas: vistas.get(k) });
  }
  salida[salida.length - 1].seguidores = info.followers_count ?? info.fan_count ?? 0;
  return salida;
}

// ---------- Instagram ----------

async function esperarContenedor(cuenta: CuentaConectada, id: string) {
  for (let i = 0; i < 40; i++) {
    const r = await get(cuenta, id, { fields: 'status_code,status' });
    if (r.status_code === 'FINISHED') return;
    if (r.status_code === 'ERROR' || r.status_code === 'EXPIRED') {
      throw new ErrorRed(`Instagram no pudo procesar el archivo: ${r.status ?? r.status_code}`);
    }
    await new Promise((res) => setTimeout(res, 3000));
  }
  throw new ErrorRed('Instagram tardó demasiado procesando el video. Intenta de nuevo en unos minutos.');
}

async function publicarInstagram(cuenta: CuentaConectada, c: ContenidoAPublicar) {
  const ig = cuenta.id_externo!;
  const leyenda = textoCompleto(c);
  const crear = async (m: ContenidoAPublicar['medios'][number], extra: Record<string, unknown>) => {
    const esVideo = m.mime.startsWith('video/');
    const r = await post(cuenta, `${ig}/media`, {
      ...(esVideo ? { video_url: m.url } : { image_url: m.url }),
      ...extra,
    });
    if (esVideo) await esperarContenedor(cuenta, r.id);
    return r.id as string;
  };

  let contenedor: string;
  if (c.tipo === 'historia') {
    contenedor = await crear(c.medios[0], { media_type: 'STORIES' });
  } else if (c.tipo === 'reel') {
    const v = c.medios.find((m) => m.mime.startsWith('video/'));
    if (!v) throw new ErrorRed('Los reels de Instagram necesitan un video.');
    contenedor = await crear(v, { media_type: 'REELS', caption: leyenda, share_to_feed: true });
  } else if (c.medios.length > 1) {
    const hijos: string[] = [];
    for (const m of c.medios) {
      hijos.push(await crear(m, { is_carousel_item: true, ...(m.mime.startsWith('video/') ? { media_type: 'VIDEO' } : {}) }));
    }
    const r = await post(cuenta, `${ig}/media`, { media_type: 'CAROUSEL', children: hijos.join(','), caption: leyenda });
    contenedor = r.id;
  } else {
    const m = c.medios[0];
    if (!m) throw new ErrorRed('Instagram necesita al menos una imagen o un video.');
    contenedor = await crear(m, { caption: leyenda, ...(m.mime.startsWith('video/') ? { media_type: 'REELS' } : {}) });
  }
  const pub = await post(cuenta, `${ig}/media_publish`, { creation_id: contenedor });
  let url: string | null = null;
  try {
    url = (await get(cuenta, pub.id, { fields: 'permalink' })).permalink ?? null;
  } catch {}
  return { idExterno: pub.id, url };
}

async function recientesInstagram(cuenta: CuentaConectada): Promise<PublicacionExterna[]> {
  const r = await get(cuenta, `${cuenta.id_externo}/media`, {
    fields: 'id,caption,permalink,timestamp,media_type,media_product_type,like_count,comments_count',
    limit: '25',
  });
  return (r.data ?? []).map((p: any) => ({
    idExterno: p.id,
    url: p.permalink ?? null,
    texto: p.caption ?? null,
    tipo: (p.media_product_type ?? p.media_type ?? '').toLowerCase(),
    publicadaEn: p.timestamp ? new Date(p.timestamp) : null,
    meGusta: p.like_count ?? 0,
    comentarios: p.comments_count ?? 0,
  }));
}

async function comentariosInstagram(cuenta: CuentaConectada, pubs: PublicacionExterna[]): Promise<ComentarioEntrante[]> {
  const salida: ComentarioEntrante[] = [];
  const propio = (cuenta.usuario_red ?? '').replace(/^@/, '');
  for (const p of pubs.filter((x) => (x.comentarios ?? 0) > 0).slice(0, 15)) {
    const r = await get(cuenta, `${p.idExterno}/comments`, {
      fields: 'id,text,timestamp,username,replies{id,text,timestamp,username}',
      limit: '50',
    });
    for (const k of r.data ?? []) {
      salida.push({
        idExterno: k.id,
        idPadreExterno: null,
        publicacionExternaId: p.idExterno,
        autorNombre: k.username ?? 'Persona en Instagram',
        autorUsuario: k.username ? `@${k.username}` : null,
        autorAvatar: null,
        texto: k.text ?? '',
        escritoEn: new Date(k.timestamp),
        esPropio: k.username === propio,
      });
      for (const rr of k.replies?.data ?? []) {
        salida.push({
          idExterno: rr.id,
          idPadreExterno: k.id,
          publicacionExternaId: p.idExterno,
          autorNombre: rr.username ?? 'Persona en Instagram',
          autorUsuario: rr.username ? `@${rr.username}` : null,
          autorAvatar: null,
          texto: rr.text ?? '',
          escritoEn: new Date(rr.timestamp),
          esPropio: rr.username === propio,
        });
      }
    }
  }
  return salida;
}

async function metricasInstagram(cuenta: CuentaConectada, dias: number): Promise<MetricaDia[]> {
  const ig = cuenta.id_externo!;
  const hasta = new Date();
  const desde = haceDias(Math.min(dias, 29));
  const info = await get(cuenta, ig, { fields: 'followers_count,media_count' });
  const alcance = await insightsSerie(cuenta, ig, ['reach'], desde, hasta);
  const nuevos = await insightsSerie(cuenta, ig, ['follower_count'], desde, hasta);
  // Las interacciones diarias se arman con lo que tienen las publicaciones recientes.
  const pubs = await recientesInstagram(cuenta);
  const porDia = new Map<string, { i: number; n: number }>();
  for (const p of pubs) {
    if (!p.publicadaEn) continue;
    const k = dia(p.publicadaEn);
    const v = porDia.get(k) ?? { i: 0, n: 0 };
    v.i += (p.meGusta ?? 0) + (p.comentarios ?? 0);
    v.n += 1;
    porDia.set(k, v);
  }
  const salida: MetricaDia[] = [];
  let seguidores = info.followers_count ?? 0;
  const lista: string[] = [];
  for (let d = new Date(desde); d <= hasta; d = new Date(d.getTime() + 86_400_000)) lista.push(dia(d));
  for (const k of lista.reverse()) {
    salida.unshift({
      dia: k,
      seguidores,
      alcance: alcance.get(k),
      interacciones: porDia.get(k)?.i,
      publicaciones: porDia.get(k)?.n ?? 0,
    });
    seguidores -= nuevos.get(k) ?? 0;
  }
  return salida;
}

export const conectorFacebook: Conector = {
  publicar: publicarFacebook,
  publicacionesRecientes: recientesFacebook,
  comentarios: comentariosFacebook,
  async responder(cuenta, comentario, texto) {
    const r = await post(cuenta, `${comentario.idExterno}/comments`, { message: texto });
    return { idExterno: r.id };
  },
  async ocultar(cuenta, id, ocultar) {
    await post(cuenta, id, { is_hidden: ocultar });
  },
  metricas: metricasFacebook,
};

export const conectorInstagram: Conector = {
  publicar: publicarInstagram,
  publicacionesRecientes: recientesInstagram,
  comentarios: comentariosInstagram,
  async responder(cuenta, comentario, texto) {
    const r = await post(cuenta, `${comentario.idExterno}/replies`, { message: texto });
    return { idExterno: r.id };
  },
  async ocultar(cuenta, id, ocultar) {
    await post(cuenta, id, { hide: ocultar });
  },
  metricas: metricasInstagram,
};

// ---------- Conexión (OAuth) ----------

export const ALCANCES_META = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_read_user_content',
  'pages_manage_posts',
  'pages_manage_engagement',
  'read_insights',
  'business_management',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_comments',
  'instagram_manage_insights',
];

export function urlAutorizacionMeta(estado: string, redirect: string) {
  const q = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? '',
    redirect_uri: redirect,
    state: estado,
    response_type: 'code',
  });
  // Las apps con "Inicio de sesión con Facebook para empresas" piden los permisos con una configuración (config_id).
  if (process.env.META_CONFIG_ID) {
    q.set('config_id', process.env.META_CONFIG_ID);
    q.set('override_default_response_type', 'true');
  } else {
    q.set('scope', ALCANCES_META.join(','));
  }
  return `https://www.facebook.com/${V()}/dialog/oauth?${q}`;
}

/** Cambia el código por tokens de página (no vencen) y devuelve las cuentas a guardar. */
export async function completarMeta(code: string, redirect: string) {
  const corto = await pedir(
    `${G('oauth/access_token')}?${new URLSearchParams({
      client_id: process.env.META_APP_ID ?? '',
      client_secret: process.env.META_APP_SECRET ?? '',
      redirect_uri: redirect,
      code,
    })}`,
  );
  const largo = await pedir(
    `${G('oauth/access_token')}?${new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: process.env.META_APP_ID ?? '',
      client_secret: process.env.META_APP_SECRET ?? '',
      fb_exchange_token: corto.access_token,
    })}`,
  );
  const paginas = await pedir(
    `${G('me/accounts')}?${new URLSearchParams({
      fields: 'id,name,username,access_token,instagram_business_account{id,username,name}',
      limit: '50',
      access_token: largo.access_token,
    })}`,
  );
  const cuentas: { red: 'facebook' | 'instagram'; nombre: string; usuario: string | null; idExterno: string; token: string }[] = [];
  for (const p of paginas.data ?? []) {
    cuentas.push({ red: 'facebook', nombre: p.name, usuario: p.username ?? null, idExterno: p.id, token: p.access_token });
    const ig = p.instagram_business_account;
    if (ig?.id) {
      cuentas.push({
        red: 'instagram',
        nombre: ig.name ?? ig.username ?? p.name,
        usuario: ig.username ? `@${ig.username}` : null,
        idExterno: ig.id,
        token: p.access_token,
      });
    }
  }
  if (!cuentas.length) throw new ErrorRed('Meta no devolvió ninguna página. Revisa que tu usuario sea administrador de la página del Departamento.');
  return cuentas;
}
