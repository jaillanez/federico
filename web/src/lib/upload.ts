/** POST multipart with upload progress (fetch has no upload progress, XHR does). */
export interface ApiErrorBody {
  error: { code: string; message: string; fields: Record<string, string> };
}

export type UploadResult =
  { ok: true; data: { id: string; message: string } } | { ok: false; status: number; error: ApiErrorBody['error'] };

const NETWORK_ERROR = {
  code: 'network',
  message: 'No pudimos conectarnos. Revisá tu conexión y probá de nuevo.',
  fields: {},
};

export function postForm(url: string, body: FormData, onProgress?: (fraction: number) => void): Promise<UploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      const json = xhr.response as unknown;
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ ok: true, data: json as { id: string; message: string } });
      } else {
        const err = (json as ApiErrorBody | null)?.error;
        resolve({
          ok: false,
          status: xhr.status,
          error: err ?? { code: 'http', message: 'Ocurrió un error. Probá de nuevo en unos minutos.', fields: {} },
        });
      }
    };
    xhr.onerror = () => resolve({ ok: false, status: 0, error: NETWORK_ERROR });
    xhr.ontimeout = () => resolve({ ok: false, status: 0, error: NETWORK_ERROR });
    xhr.timeout = 5 * 60 * 1000;
    xhr.send(body);
  });
}
