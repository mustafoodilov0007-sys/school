/** API xato kodlari — frontend va bot shu kodlar bo'yicha tushunarli xabar ko'rsatadi. */
export const ErrorCode = {
  VALIDATION: 'VALIDATION',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  NOT_LINKED: 'NOT_LINKED',
  STUDENT_INACTIVE: 'STUDENT_INACTIVE',
  INIT_DATA_INVALID: 'INIT_DATA_INVALID',
  INIT_DATA_EXPIRED: 'INIT_DATA_EXPIRED',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}
