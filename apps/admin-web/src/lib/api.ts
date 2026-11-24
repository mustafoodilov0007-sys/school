import type { ApiErrorBody } from '@pep/shared';

export class ApiFail extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Cookie sessiya + CSRF sarlavhasi (server o'zgartiruvchi so'rovlarda talab qiladi). */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: {
        'x-requested-with': 'pep-admin',
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiFail(0, 'NETWORK', 'Server bilan aloqa yo\'q');
  }
  if (res.status === 204) return undefined as T;
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (json as ApiErrorBody | null)?.error;
    throw new ApiFail(res.status, e?.code ?? 'UNKNOWN', e?.message ?? 'Xatolik yuz berdi', e?.details);
  }
  return json as T;
}

export const errMsg = (e: unknown) => (e instanceof ApiFail ? e.message : 'Kutilmagan xatolik');

/** Rasm/PDF yuklash (xom bayt). Server turini baytlardan aniqlaydi. */
export async function uploadMedia(file: File, kind: 'image' | 'pdf'): Promise<{ id: string; kind: string; size: number }> {
  let res: Response;
  try {
    res = await fetch(`/api/admin/media?kind=${kind}`, {
      method: 'POST', credentials: 'same-origin', headers: { 'x-requested-with': 'pep-admin', 'content-type': 'application/octet-stream' }, body: file,
    });
  } catch {
    throw new ApiFail(0, 'NETWORK', 'Server bilan aloqa yo\'q');
  }
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (json as ApiErrorBody | null)?.error;
    throw new ApiFail(res.status, e?.code ?? 'UNKNOWN', e?.message ?? 'Yuklab bo\'lmadi', e?.details);
  }
  return json as { id: string; kind: string; size: number };
}

/** Xom bayt yuborish (Excel import). */
export async function uploadRaw<T>(path: string, file: File): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'x-requested-with': 'pep-admin', 'content-type': 'application/octet-stream' }, body: file });
  } catch {
    throw new ApiFail(0, 'NETWORK', 'Server bilan aloqa yo\'q');
  }
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (json as ApiErrorBody | null)?.error;
    throw new ApiFail(res.status, e?.code ?? 'UNKNOWN', e?.message ?? 'Yuborib bo\'lmadi', e?.details);
  }
  return json as T;
}
