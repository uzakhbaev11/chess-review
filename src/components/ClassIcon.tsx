import type { MoveClass } from '../lib/types.ts';
import { CLASS_INFO } from '../lib/classify.ts';

/** Круглый значок класса хода (как на chess.com). */
export function ClassIcon({ cls, size = 20 }: { cls: MoveClass; size?: number }) {
  const info = CLASS_INFO[cls];
  const glyph = (() => {
    switch (cls) {
      case 'best':
        return <path d="M12 5.2l2 4.3 4.6.5-3.4 3.1 1 4.6L12 15.4l-4.2 2.3 1-4.6L5.4 10l4.6-.5z" fill="#fff" />;
      case 'excellent':
        return (
          <path d="M7 11.5l3.2 3.2L17 8" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        );
      case 'good':
        return (
          <path d="M7.5 12l3 3 6-6" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        );
      case 'book':
        return (
          <path
            d="M5.5 7.5c2.2-.6 4.4-.3 6.5 1 2.1-1.3 4.3-1.6 6.5-1v9c-2.2-.6-4.4-.3-6.5 1-2.1-1.3-4.3-1.6-6.5-1z M12 8.5v9"
            stroke="#fff"
            strokeWidth="1.6"
            fill="none"
            strokeLinejoin="round"
          />
        );
      case 'forced':
        return (
          <path d="M6 12h10M12.5 8l4 4-4 4" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        );
      case 'miss':
        return <path d="M8 8l8 8M16 8l-8 8" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />;
      default:
        return (
          <text
            x="12"
            y="16.3"
            textAnchor="middle"
            fontSize={info.symbol.length > 1 ? 10.5 : 13}
            fontWeight="800"
            fill="#fff"
            fontFamily="system-ui, sans-serif"
          >
            {info.symbol}
          </text>
        );
    }
  })();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={info.label} className="class-icon">
      <title>{info.label}</title>
      <circle cx="12" cy="12" r="11" fill={info.color} stroke="rgba(0,0,0,.25)" strokeWidth="1" />
      {glyph}
    </svg>
  );
}
