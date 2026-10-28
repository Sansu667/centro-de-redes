'use server';

import { revalidatePath } from 'next/cache';
import { usuarioParaAccion } from '@/lib/auth';
import { registrar } from '@/lib/bitacora';
import { sincronizarTodo } from '@/lib/sincronizador';

export async function sincronizarAhora(): Promise<void> {
  const u = await usuarioParaAccion('sincronizar');
  const r = await sincronizarTodo();
  await registrar(u.id, 'redes.sincronizadas', null, null, { resultados: r });
  revalidatePath('/', 'layout');
}
