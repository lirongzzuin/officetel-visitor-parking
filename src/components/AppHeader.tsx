'use client';

import Link from 'next/link';

interface AppHeaderProps {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  showNotification?: boolean;
  rightAction?: React.ReactNode;
}

export function AppHeader({
  title,
  showBack = false,
  onBack,
  showNotification = true,
  rightAction,
}: AppHeaderProps) {
  return (
    <header className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[600px] z-50
      flex justify-between items-center px-5 h-14
      bg-[var(--color-surface)]/90 backdrop-blur-md border-b border-[var(--color-outline-variant)]/30">
      <div className="flex items-center gap-2">
        {showBack ? (
          <button
            onClick={onBack}
            className="w-10 h-10 flex items-center justify-center -ml-2 active:scale-90 transition-transform"
          >
            <span className="material-symbols-outlined text-[var(--color-on-surface)]">arrow_back</span>
          </button>
        ) : (
          <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-[var(--color-primary)]/10 bg-[var(--color-primary)]/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-[var(--color-primary)] text-[20px]"
              style={{ fontVariationSettings: "'FILL' 1" }}>
              local_parking
            </span>
          </div>
        )}
        {title ? (
          <h1 className="text-[20px] font-bold text-[var(--color-on-surface)] tracking-tight">{title}</h1>
        ) : (
          <Link href="/home">
            <span className="text-[20px] font-bold text-[var(--color-primary)] tracking-tight">
              OO오피스텔 주차
            </span>
          </Link>
        )}
      </div>

      <div className="flex items-center gap-1">
        {rightAction}
        {showNotification && (
          <button className="w-10 h-10 flex items-center justify-center rounded-full relative active:scale-90 transition-transform">
            <span className="material-symbols-outlined text-[var(--color-on-surface-variant)]">notifications</span>
            <span className="absolute top-2 right-2 w-2 h-2 bg-[var(--color-error)] rounded-full border-2 border-[var(--color-surface)]" />
          </button>
        )}
      </div>
    </header>
  );
}
