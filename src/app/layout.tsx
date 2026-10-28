import type { Metadata, Viewport } from 'next';
import '@fontsource/source-sans-3/400.css';
import '@fontsource/source-sans-3/600.css';
import '@fontsource/source-sans-3/700.css';
import '@fontsource/source-serif-4/600.css';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Centro de Redes · Filosofía UNAL', template: '%s · Centro de Redes' },
  description: 'Publicación, comentarios y estadísticas de las redes del Departamento de Filosofía.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#18241b' };

// Todas las páginas se generan por petición: la política CSP usa un nonce distinto en cada respuesta.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO">
      <body>{children}</body>
    </html>
  );
}
