import type { ReactNode } from 'react';
import { t } from '@pep/shared';

export function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-16 text-mute">
      <svg className="spin h-8 w-8" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span>{t('app_loading')}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: (() => void) | undefined }) {
  return (
    <div role="alert" className="mx-4 mt-10 card text-center">
      <p className="text-danger">{message}</p>
      {onRetry && (
        <button className="btn mt-4 w-full" onClick={onRetry}>
          {t('app_retry')}
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 py-8 text-center text-mute">
      <span className="text-3xl" aria-hidden="true">{icon}</span>
      <p>{children}</p>
    </div>
  );
}
