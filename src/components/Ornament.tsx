export default function Ornament({ label }: { label?: string }) {
  return (
    <div className="ornament-divider text-xs font-semibold uppercase tracking-[0.3em] mb-3">
      <FlameGlyph />
      {label && <span>{label}</span>}
      <FlameGlyph />
    </div>
  );
}

export function FlameGlyph({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2C12 6 8 7.5 8 12.5C8 16.5 9.8 19 12 19C14.2 19 16 16.5 16 12.5C16 10.5 15 9.5 14.5 8C14.7 9.5 13.5 10.5 13 10C12.5 9.5 13 8 12 2Z"
        fill="#B8934F"
      />
    </svg>
  );
}
