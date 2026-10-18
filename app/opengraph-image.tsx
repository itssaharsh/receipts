import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt = 'Receipts: Fo says done. Receipts checks your own calendar before believing it.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#ffffff', color: '#141a16', padding: 64, fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <svg width="56" height="56" viewBox="0 0 48 48">
            <rect x="4" y="10" width="40" height="28" rx="3" fill="none" stroke="#141a16" strokeWidth="3" />
            <path d="M30 10v4M30 18v4M30 26v4M30 34v4" stroke="#141a16" strokeWidth="3" strokeLinecap="round" />
            <circle cx="37" cy="24" r="4" fill="#106b4f" />
          </svg>
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>Receipts</div>
        </div>
        <div style={{ marginTop: 56, fontSize: 60, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1.5, maxWidth: 1000 }}>Fo says done. Receipts checks your own calendar before believing it.</div>
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 24, fontSize: 26, color: '#566059' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 18, height: 18, borderRadius: 999, background: '#106b4f' }} />
            <span>verified from your calendar</span>
          </div>
          <span>·</span>
          <span>rules decide what Fo may do without asking</span>
        </div>
      </div>
    ),
    size,
  );
}
