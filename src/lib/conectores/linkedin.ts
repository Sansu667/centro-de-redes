import type { ComentarioEntrante, Conector, CuentaConectada, MetricaDia, PublicacionExterna } from './tipos';
import { ErrorRed, dia, haceDias, pedir } from './tipos';

// LinkedIn Community Management API para páginas de organización.
// Requiere que LinkedIn apruebe la app para el producto "Community Management API".

const API = 'https://api.linkedin.com/rest';
const VERSION = () => process.env.LINKEDIN_API_VERSION || '202509';

export const ALCANCES_LINKEDIN = ['r_organization_social', 'w_organization_social', 'rw_organization_admin', 'r_organization_followers'];

function cab(c: CuentaConectada | string, extra: Record<string, string> = {}) {
  const t = typeof c === 'string' ? c : c.token;
  if (!t) throw new ErrorRed('La cuenta no tiene token. Vuelve a conectarla.', true);
  return {
    Authorization: `Bearer ${t}`,
    'LinkedIn-Version': VERSION(),
    'X-Restli-Protocol-Version': '2.0.0',
    ...extra,
  };
}

const urnOrg = (c: CuentaConectada) => `urn:li:organization:${c.id_externo}`;
const enc = encodeURIComponent;

export function urlAutorizacionLinkedIn(estado: string, redirect: string) {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
    redirect_uri: redirect,
    state: estado,
    scope: ALCANCES_LINKEDIN.join(' '),
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${q}`;
}

async function tokenLinkedIn(params: Record<string, string>) {
  return pedir('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
      client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? '',
      ...params,
    }),
  });
}

export async function completarLinkedIn(code: string, redirect: string) {
  const t = await tokenLinkedIn({ grant_type: 'authorization_code', code, redirect_uri: redirect });
  const acl = await pedir(`${API}/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED`, {
    headers: cab(t.access_token),
  });
  const cuentas = [];
  for (const e of acl.elements ?? []) {
    const id = String(e.organization ?? e.organizationTarget ?? '').split(':').pop();
    if (!id) continue;
    let nombre = `Organización ${id}`;
    let usuario: string | null = null;
    try {
      const o = await pedir(`${API}/organizations/${id}`, { headers: cab(t.access_token) });
      nombre = o.localizedName ?? nombre;
      usuario = o.vanityName ?? null;
    } catch {}
    cuentas.push({
      red: 'linkedin' as const,
      nombre,
      usuario,
      idExterno: id,
      token: t.access_token as string,
      refresh: (t.refresh_token as string) ?? null,
      expira: new Date(Date.now() + (t.expires_in ?? 5_184_000) * 1000),
      datos: {},
    });
  }
  if (!cuentas.length) throw new ErrorRed('Tu usuario de LinkedIn no administra ninguna página de organización.');
  return cuentas;
}

export async function refrescarLinkedIn(refresh: string) {
  const t = await tokenLinkedIn({ grant_type: 'refresh_token', refresh_token: refresh });
  return {
    token: t.access_token as string,
    expira: new Date(Date.now() + (t.expires_in ?? 5_184_000) * 1000),
    refresh: (t.refresh_token as string) ?? null,
  };
}

async function subirImagen(c: CuentaConectada, url: string) {
  const ini = await pedir(`${API}/images?action=initializeUpload`, {
    method: 'POST',
    headers: cab(c, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ initializeUploadRequest: { owner: urnOrg(c) } }),
  });
  const { uploadUrl, image } = ini.value;
  const datos = await fetch(url);
  if (!datos.ok) throw new ErrorRed('No se pudo leer la imagen guardada para enviarla a LinkedIn.');
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${c.token}` }, body: await datos.arrayBuffer() });
  if (!put.ok) throw new ErrorRed(`LinkedIn rechazó la imagen (${put.status}).`);
  return image as string;
}

async function subirVideo(c: CuentaConectada, url: string, tamano: number) {
  const ini = await pedir(`${API}/videos?action=initializeUpload`, {
    method: 'POST',
    headers: cab(c, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      initializeUploadRequest: { owner: urnOrg(c), fileSizeBytes: tamano, uploadCaptions: false, uploadThumbnail: false },
    }),
  });
  const { video, uploadInstructions, uploadToken } = ini.value;
  const etags: string[] = [];
  for (const ins of uploadInstructions) {
    const parte = await fetch(url, { headers: { Range: `bytes=${ins.firstByte}-${ins.lastByte}` } });
    const put = await fetch(ins.uploadUrl, { method: 'PUT', body: await parte.arrayBuffer() });
    if (!put.ok) throw new ErrorRed(`LinkedIn rechazó una parte del video (${put.status}).`);
    etags.push(put.headers.get('etag') ?? '');
  }
  await pedir(`${API}/videos?action=finalizeUpload`, {
    method: 'POST',
    headers: cab(c, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ finalizeUploadRequest: { video, uploadToken: uploadToken ?? '', uploadedPartIds: etags } }),
  });
  return video as string;
}

export const conectorLinkedIn: Conector = {
  async publicar(cuenta, c) {
    const texto = c.texto.replace(/([\\(){}[\]@#*_~<>|])/g, '\\$1'); // LinkedIn usa "little text format"
    const cuerpo: Record<string, unknown> = {
      author: urnOrg(cuenta),
      commentary: texto,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };
    const video = c.medios.find((m) => m.mime.startsWith('video/'));
    const imagenes = c.medios.filter((m) => m.mime.startsWith('image/'));
    if (video) {
      cuerpo.content = { media: { title: c.titulo, id: await subirVideo(cuenta, video.url, video.tamano) } };
    } else if (imagenes.length === 1) {
      cuerpo.content = { media: { id: await subirImagen(cuenta, imagenes[0].url), altText: c.titulo } };
    } else if (imagenes.length > 1) {
      const ids = [];
      for (const i of imagenes) ids.push({ id: await subirImagen(cuenta, i.url), altText: c.titulo });
      cuerpo.content = { multiImage: { images: ids } };
    } else if (c.enlace) {
      cuerpo.content = { article: { source: c.enlace, title: c.titulo } };
    }
    const r = await pedir<any>(`${API}/posts`, {
      method: 'POST',
      headers: cab(cuenta, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(cuerpo),
    });
    const urn = r.__cabeceras?.['x-restli-id'] ?? r.id;
    return { idExterno: urn, url: urn ? `https://www.linkedin.com/feed/update/${urn}` : null };
  },

  async publicacionesRecientes(cuenta) {
    const r = await pedir(`${API}/posts?author=${enc(urnOrg(cuenta))}&q=author&count=20&sortBy=CREATED`, { headers: cab(cuenta) });
    const pubs: PublicacionExterna[] = (r.elements ?? []).map((p: any) => ({
      idExterno: p.id,
      url: `https://www.linkedin.com/feed/update/${p.id}`,
      texto: p.commentary ?? null,
      tipo: p.content?.media ? 'medio' : 'publicacion',
      publicadaEn: p.publishedAt ? new Date(p.publishedAt) : p.createdAt ? new Date(p.createdAt) : null,
    }));
    if (pubs.length) {
      try {
        const ids = pubs.map((p) => enc(p.idExterno)).join(',');
        const s = await pedir(`${API}/socialMetadata?ids=List(${ids})`, { headers: cab(cuenta) });
        for (const p of pubs) {
          const m = s.results?.[p.idExterno];
          if (!m) continue;
          p.meGusta = Object.values(m.reactionSummaries ?? {}).reduce((a: number, x: any) => a + (x.count ?? 0), 0);
          p.comentarios = m.commentSummary?.count ?? 0;
        }
      } catch {}
    }
    return pubs;
  },

  async comentarios(cuenta, pubs) {
    const salida: ComentarioEntrante[] = [];
    for (const p of pubs.slice(0, 15)) {
      if (p.comentarios === 0) continue;
      const r = await pedir(`${API}/socialActions/${enc(p.idExterno)}/comments?count=50`, { headers: cab(cuenta) });
      for (const k of r.elements ?? []) {
        const actor = String(k.actor ?? '');
        salida.push({
          idExterno: k.commentUrn ?? k.$URN ?? `urn:li:comment:(${p.idExterno},${k.id})`,
          idPadreExterno: k.parentComment ?? null,
          publicacionExternaId: p.idExterno,
          autorNombre: actor === urnOrg(cuenta) ? cuenta.nombre : 'Miembro de LinkedIn',
          autorUsuario: null,
          autorAvatar: null,
          texto: k.message?.text ?? '',
          escritoEn: new Date(k.created?.time ?? Date.now()),
          esPropio: actor === urnOrg(cuenta),
        });
      }
    }
    return salida;
  },

  async responder(cuenta, comentario, texto) {
    if (!comentario.publicacionExternaId) throw new ErrorRed('Falta la publicación de origen del comentario.');
    const r = await pedir<any>(`${API}/socialActions/${enc(comentario.publicacionExternaId)}/comments`, {
      method: 'POST',
      headers: cab(cuenta, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        actor: urnOrg(cuenta),
        object: comentario.publicacionExternaId,
        parentComment: comentario.idExterno,
        message: { text: texto },
      }),
    });
    return { idExterno: r.commentUrn ?? r.__cabeceras?.['x-restli-id'] ?? `li_${Date.now()}` };
  },

  async metricas(cuenta, dias) {
    const desde = haceDias(Math.min(dias, 365));
    const hasta = new Date();
    const intervalo = `(timeRange:(start:${desde.getTime()},end:${hasta.getTime()}),timeGranularityType:DAY)`;
    const org = enc(urnOrg(cuenta));
    const [comp, seg, red] = await Promise.all([
      pedir(`${API}/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${org}&timeIntervals=${intervalo}`, { headers: cab(cuenta) }),
      pedir(`${API}/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${org}&timeIntervals=${intervalo}`, { headers: cab(cuenta) }).catch(() => ({ elements: [] })),
      pedir(`${API}/networkSizes/${org}?edgeType=COMPANY_FOLLOWED_BY_COMPANY`, { headers: cab(cuenta) }).catch(() => ({ firstDegreeSize: 0 })),
    ]);
    const porDia = new Map<string, MetricaDia>();
    for (const e of comp.elements ?? []) {
      const k = dia(new Date(e.timeRange?.start));
      const s = e.totalShareStatistics ?? {};
      porDia.set(k, {
        dia: k,
        alcance: s.uniqueImpressionsCount,
        impresiones: s.impressionCount,
        interacciones: (s.likeCount ?? 0) + (s.commentCount ?? 0) + (s.shareCount ?? 0) + (s.clickCount ?? 0),
      });
    }
    const ganados = new Map<string, number>();
    for (const e of seg.elements ?? []) {
      const g = e.followerGains ?? {};
      ganados.set(dia(new Date(e.timeRange?.start)), (g.organicFollowerGain ?? 0) + (g.paidFollowerGain ?? 0));
    }
    let seguidores = Number(red.firstDegreeSize ?? 0);
    const salida: MetricaDia[] = [];
    for (let d = new Date(hasta); d >= desde; d = new Date(d.getTime() - 86_400_000)) {
      const k = dia(d);
      salida.unshift({ ...(porDia.get(k) ?? { dia: k }), seguidores });
      seguidores -= ganados.get(k) ?? 0;
    }
    return salida;
  },
};
