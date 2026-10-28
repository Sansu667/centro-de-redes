'use client';

import { useState, useTransition } from 'react';
import { RefreshCw, Power, Trash2, Plus } from 'lucide-react';

export function BotonAccion({
  accion,
  texto,
  icono,
  clase = 'boton secundario chico',
  confirmar,
}: {
  accion: () => Promise<void>;
  texto: string;
  icono?: 'sync' | 'power' | 'trash' | 'plus';
  clase?: string;
  confirmar?: string;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const I = icono === 'sync' ? RefreshCw : icono === 'power' ? Power : icono === 'trash' ? Trash2 : icono === 'plus' ? Plus : null;
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <button
        type="button"
        className={clase}
        disabled={pendiente}
        onClick={() => {
          if (confirmar && !confirm(confirmar)) return;
          iniciar(async () => {
            setError(null);
            try {
              await accion();
            } catch (e) {
              setError((e as Error).message);
            }
          });
        }}
      >
        {I && <I aria-hidden="true" />}
        {pendiente ? 'Un momento…' : texto}
      </button>
      {error && <span className="ayuda" role="alert" style={{ color: 'var(--critico)', maxWidth: 280 }}>{error}</span>}
    </span>
  );
}
