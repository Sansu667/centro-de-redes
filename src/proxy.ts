import { NextResponse, type NextRequest } from 'next/server';

const PUBLICAS = ['/ingresar', '/configuracion-inicial', '/privacidad', '/api/cron/', '/api/medios/'];
const COOKIES = ['__Host-redes_sesion', 'redes_sesion'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Primer filtro: sin cookie de sesión no se entra a ninguna página interna.
  // La validación real (sesión vigente, 2FA, rol) ocurre en el servidor en cada página y acción.
  const publica = PUBLICAS.some((p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : p + '/'));
  const tieneCookie = COOKIES.some((c) => request.cookies.has(c));
  if (!publica && !tieneCookie) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/ingresar';
    url.search = '';
    return NextResponse.redirect(url);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const dev = process.env.NODE_ENV === 'development';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "media-src 'self' blob: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    dev || process.env.COOKIE_INSEGURA === '1' ? '' : 'upgrade-insecure-requests',
  ]
    .filter(Boolean)
    .join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|icon.svg|fonts/).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
