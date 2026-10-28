const ZONA = 'America/Bogota';

export function numero(n: number): string {
  return new Intl.NumberFormat('es-CO').format(Math.round(n));
}

export function compacto(n: number): string {
  if (Math.abs(n) < 10_000) return numero(n);
  return new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function porcentaje(x: number, decimales = 1): string {
  return new Intl.NumberFormat('es-CO', { style: 'percent', maximumFractionDigits: decimales, minimumFractionDigits: decimales }).format(x);
}

export function variacionTexto(x: number | null): { texto: string; clase: 'sube' | 'baja' | '' } {
  if (x === null || !Number.isFinite(x)) return { texto: 'sin periodo previo', clase: '' };
  const signo = x > 0 ? '+' : x < 0 ? '−' : '';
  return { texto: `${signo}${porcentaje(Math.abs(x))}`, clase: x > 0.005 ? 'sube' : x < -0.005 ? 'baja' : '' };
}

export function fechaHora(d: Date | string | null): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d));
}

export function fechaCorta(d: Date | string | null): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, day: 'numeric', month: 'short' }).format(new Date(d));
}

export function hace(d: Date | string | null): string {
  if (!d) return '—';
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  if (s < 60) return 'ahora';
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  if (s < 86400 * 7) return rtf.format(-Math.round(s / 86400), 'day');
  return fechaCorta(d);
}

/** Convierte "2026-10-28T15:30" (hora de Bogotá, de un input datetime-local) a Date. */
export function desdeBogota(valor: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) return null;
  return new Date(`${valor}:00-05:00`);
}

export function aBogotaInput(d: Date | string | null): string {
  if (!d) return '';
  const x = new Date(new Date(d).getTime() - 5 * 3600_000);
  return x.toISOString().slice(0, 16);
}

export function iniciales(nombre: string): string {
  return nombre
    .replace(/^@/, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
