import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 4 * 1024 * 1024;

// Accepts a data URL (the browser downsizes photos before sending), stores it
// on disk and returns the public URL. Returns null when nothing was sent;
// throws on an invalid / too large image.
export function saveImage(dataUrl) {
  if (!dataUrl) return null;
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new Error('Неверный формат фото (нужен JPG, PNG или WebP)');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_BYTES) throw new Error('Фото слишком большое');
  const name = `${crypto.randomUUID()}.${EXT[m[1]]}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, name), buf);
  return `/uploads/${name}`;
}

export function deleteImage(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  const file = path.join(UPLOADS_DIR, path.basename(url));
  fs.rm(file, { force: true }, () => {});
}
