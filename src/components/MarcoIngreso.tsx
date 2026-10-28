import { Simbolo } from './Simbolo';

/** Pantalla dividida para ingreso: a la izquierda la identidad, a la derecha el formulario. */
export function MarcoIngreso({ children }: { children: React.ReactNode }) {
  return (
    <main className="ingreso">
      <section className="ingreso-lado" aria-hidden="false">
        <div style={{ position: 'relative' }}>
          <div className="marca" style={{ padding: 0 }}>
            <Simbolo className="marca-simbolo" />
            <span className="marca-texto">
              Centro de Redes
              <small>Departamento de Filosofía · UNAL Bogotá</small>
            </span>
          </div>
          <h1>Lo que el Departamento dice, en un solo lugar.</h1>
          <p>Prepara y aprueba publicaciones, responde comentarios y sigue cómo crecen Facebook, Instagram, YouTube, LinkedIn y X.</p>
        </div>
        <svg className="ingreso-estratos" viewBox="0 0 600 300" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 60 C120 40 220 80 330 62 S520 38 600 58 V300 H0Z" fill="#1e2d21" />
          <path d="M0 120 C140 98 250 140 360 118 S520 100 600 116 V300 H0Z" fill="#223325" />
          <path d="M0 176 C110 160 230 196 350 176 S510 154 600 172 V300 H0Z" fill="#283c2c" />
          <path d="M0 230 C130 214 260 244 380 228 S520 212 600 226 V300 H0Z" fill="#2e4532" />
          <path d="M0 60 C120 40 220 80 330 62 S520 38 600 58" fill="none" stroke="#c9e7a6" strokeOpacity=".35" strokeWidth="1.2" />
        </svg>
        <p className="ingreso-credito">Uso exclusivo del equipo de comunicaciones del Departamento. Toda acción queda registrada.</p>
      </section>
      <section className="ingreso-formulario">{children}</section>
    </main>
  );
}
