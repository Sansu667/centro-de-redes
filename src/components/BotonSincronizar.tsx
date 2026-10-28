'use client';

import { useTransition, useState } from 'react';
import { RefreshCw } from 'lucide-react';

export function BotonSincronizar({ accion }: { accion: () => Promise<void> }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="boton secundario"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            setError(null);
            try {
              await accion();
            } catch (e) {
              setError((e as Error).message);
            }
          })
        }
      >
        <RefreshCw aria-hidden="true" style={pendiente ? { animation: 'girar 1s linear infinite' } : undefined} />
        {pendiente ? 'Sincronizando…' : 'Sincronizar ahora'}
      </button>
      {error && <span className="ayuda" role="alert" style={{ color: 'var(--critico)' }}>{error}</span>}
    </>
  );
}
