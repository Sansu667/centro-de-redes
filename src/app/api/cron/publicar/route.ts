import { NextResponse } from 'next/server';
import { igualSeguro } from '@/lib/crypto';
import { publicarVencidas } from '@/lib/publicador';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Publica lo programado. Vercel la llama a diario; un servicio externo puede llamarla cada 5 minutos. */
export async function GET(req: Request) {
  const s = process.env.CRON_SECRET;
  const h = req.headers.get('authorization') ?? '';
  if (!s || s.length < 16 || !igualSeguro(h, `Bearer ${s}`)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  return NextResponse.json({ publicadas: await publicarVencidas(10) });
}
