/** Client-side file checks (instant feedback; the API re-validates by content). */
export const MB = 1024 * 1024;
export const MAX_FILE_BYTES = 15 * MB;
export const MAX_TOTAL_BYTES = 40 * MB;
export const MAX_FILES = 3;
export const ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif';

const OK_EXT = /\.(pdf|jpe?g|png|webp|heic|heif)$/i;
const OK_MIME = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/;

export function fileProblem(file: { name: string; type: string; size: number }): string | null {
  if (!OK_EXT.test(file.name) && !OK_MIME.test(file.type)) {
    return `“${file.name}” no es un PDF ni una imagen (JPG, PNG, WebP o HEIC).`;
  }
  if (file.size > MAX_FILE_BYTES) return `“${file.name}” supera los 15 MB.`;
  if (file.size === 0) return `“${file.name}” está vacío.`;
  return null;
}

export function formatSize(bytes: number): string {
  return bytes >= MB
    ? `${(bytes / MB).toFixed(1).replace('.', ',')} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
