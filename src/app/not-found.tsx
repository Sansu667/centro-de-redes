import Link from 'next/link';

export default function NoEncontrado() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="panel vacio" style={{ maxWidth: 440 }}>
        <h3>Esta página no existe</h3>
        <p>Puede que el enlace esté mal escrito o que el contenido se haya eliminado.</p>
        <Link href="/panel" className="boton">Ir al panorama</Link>
      </div>
    </main>
  );
}
