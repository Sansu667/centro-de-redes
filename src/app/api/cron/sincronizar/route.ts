import { NextResponse } from 'next/server';
import { igualSeguro } from '@/lib/crypto';
import { sincronizarTodo } from '@/lib/sincronizador';
import { publicarVencidas } from '@/lib/publicador';

export const runtime = 'nodejs';
export const maxDuration = 300;

function autorizado(req: Request) {
  const s = process.env.CRON_SECRET;
  const h = req.headers.get('authorization') ?? '';
  return Boolean(s && s.length >= 16 && igualSeguro(h, `Bearer ${s}`));
}

export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const publicadas = await publicarVencidas(10);
  const sincronizadas = await sincronizarTodo();
  return NextResponse.json({ publicadas, sincronizadas });
}
