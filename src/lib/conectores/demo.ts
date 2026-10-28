import { randomUUID } from 'node:crypto';
import type { Conector, CuentaConectada, MetricaDia } from './tipos';
import { dia } from './tipos';

// Conector de demostración: no toca ninguna red. Sirve para probar la app completa
// (flujo de aprobación, bandeja, estadísticas) mientras llegan las credenciales reales.

function semilla(texto: string) {
  let h = 2166136261;
  for (const c of texto) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const BASE: Record<string, { seg: number; crec: number; alc: number }> = {
  facebook: { seg: 18400, crec: 9, alc: 2600 },
  instagram: { seg: 9700, crec: 14, alc: 3100 },
  youtube: { seg: 6200, crec: 6, alc: 1500 },
  linkedin: { seg: 2100, crec: 11, alc: 900 },
  x: { seg: 4300, crec: 2, alc: 700 },
};

export function metricasDemo(red: string, desde: Date, hasta: Date): MetricaDia[] {
  const b = BASE[red] ?? BASE.facebook;
  const salida: MetricaDia[] = [];
  const total = Math.round((hasta.getTime() - desde.getTime()) / 86_400_000);
  // Los seguidores se calculan hacia atrás desde un valor fijo para que hoy sea estable.
  const r0 = semilla(red + 'seg');
  let seguidores = b.seg;
  const serie: number[] = [];
  for (let i = 0; i <= total + 400; i++) {
    serie.push(seguidores);
    seguidores -= Math.max(0, Math.round(b.crec * (0.4 + r0() * 1.3)));
  }
  const diasDesdeHoy = Math.round((Date.now() - hasta.getTime()) / 86_400_000);
  for (let i = 0; i <= total; i++) {
    const d = new Date(desde.getTime() + i * 86_400_000);
    const clave = dia(d);
    const r = semilla(red + clave);
    const semana = d.getUTCDay();
    const laboral = semana >= 1 && semana <= 5 ? 1.15 : 0.7;
    const evento = r() > 0.9 ? 2.4 : 1; // días de evento o transmisión
    const alcance = Math.round(b.alc * laboral * evento * (0.7 + r() * 0.6));
    const impresiones = Math.round(alcance * (1.4 + r() * 0.5));
    const interacciones = Math.round(alcance * (0.035 + r() * 0.04));
    const atras = Math.max(0, diasDesdeHoy + (total - i));
    salida.push({
      dia: clave,
      seguidores: serie[Math.min(atras, serie.length - 1)],
      alcance,
      impresiones,
      interacciones,
      vistas: red === 'youtube' ? Math.round(alcance * 1.8) : Math.round(impresiones * 0.3),
      publicaciones: r() > 0.62 ? 1 : 0,
    });
  }
  return salida;
}

export const conectorDemo: Conector = {
  async publicar(cuenta: CuentaConectada) {
    await new Promise((r) => setTimeout(r, 300));
    const id = `demo_${randomUUID().slice(0, 12)}`;
    return { idExterno: id, url: null };
  },
  async comentarios() {
    return [];
  },
  async responder() {
    return { idExterno: `demo_resp_${randomUUID().slice(0, 10)}` };
  },
  async ocultar() {},
  async metricas(cuenta, dias) {
    const hasta = new Date();
    const desde = new Date(Date.now() - (dias - 1) * 86_400_000);
    return metricasDemo(cuenta.red, desde, hasta);
  },
  async publicacionesRecientes() {
    return [];
  },
};
