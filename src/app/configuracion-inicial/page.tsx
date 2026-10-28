import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { MarcoIngreso } from '@/components/MarcoIngreso';
import { FormInicial } from '@/components/Formularios';
import { configurarInicial } from '../ingresar/acciones';

export const metadata = { title: 'Configuración inicial' };

export default async function ConfiguracionInicial() {
  const [{ n }] = await sql`select count(*)::int as n from usuarios`;
  if (n > 0 || !process.env.SETUP_TOKEN) notFound();
  return (
    <MarcoIngreso>
      <h2>Configuración inicial</h2>
      <p>Crea la primera cuenta, que tendrá rol de administrador. Esta página desaparece en cuanto exista un usuario.</p>
      <FormInicial accion={configurarInicial} />
    </MarcoIngreso>
  );
}
