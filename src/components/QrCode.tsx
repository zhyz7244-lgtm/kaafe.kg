import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

export default function QrCode({ value, size = 180 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size * 2, margin: 1, color: { dark: '#2E1F16', light: '#FFFFFF' } })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!src) return <div style={{ width: size, height: size }} />;
  return <img src={src} alt={`QR-код ${value}`} width={size} height={size} className="rounded-lg bg-white" />;
}
