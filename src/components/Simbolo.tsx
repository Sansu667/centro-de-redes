/** Símbolo de la app: un arco sobre estratos. */
export function Simbolo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#223325" />
      <path d="M10 40h44M10 47h44M10 54h44" stroke="#c9e7a6" strokeWidth="3" strokeLinecap="round" opacity=".55" />
      <path d="M14 33c6-14 14-21 18-21s12 7 18 21" fill="none" stroke="#c9e7a6" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
