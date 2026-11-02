export function TacoMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="58" fill="#2d4036" />
      <path d="M22 68c8-28 22-40 38-40s30 12 38 40" fill="#f4efe6" />
      <path d="M28 66c10-8 20-12 32-12s22 4 32 12" fill="none" stroke="#c4452d" strokeWidth="3" />
      <path d="M34 70h52c-4 16-16 26-26 26S38 86 34 70z" fill="#b5813a" />
      <circle cx="48" cy="78" r="2.2" fill="#1d1915" />
      <circle cx="60" cy="82" r="2.2" fill="#1d1915" />
      <circle cx="72" cy="77" r="2.2" fill="#1d1915" />
    </svg>
  );
}
