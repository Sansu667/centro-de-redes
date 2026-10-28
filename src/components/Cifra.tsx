import { variacionTexto } from '@/lib/formato';

export function Cifra({ etiqueta, valor, cambio, nota }: { etiqueta: string; valor: string; cambio?: number | null; nota?: React.ReactNode }) {
  const v = cambio === undefined ? null : variacionTexto(cambio);
  return (
    <div>
      <div className="cifra-etiqueta">{etiqueta}</div>
      <div className="cifra">{valor}</div>
      <div className="variacion">
        {v && (
          <>
            <span className={v.clase}>{v.texto}</span> {cambio !== null && 'frente al periodo anterior'}
          </>
        )}
        {nota}
      </div>
    </div>
  );
}
