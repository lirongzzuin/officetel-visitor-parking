'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/home', icon: 'home', label: '홈' },
  { href: '/register', icon: 'add_circle', label: '등록' },
  { href: '/notices', icon: 'newspaper', label: '소식' },
  { href: '/lookup', icon: 'manage_search', label: '조회' },
  { href: '/settings', icon: 'person', label: '내정보' },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[600px] z-50
      bg-[var(--color-surface)]/90 backdrop-blur-lg border-t border-[var(--color-outline-variant)]/40
      rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.04)] pb-safe">
      <div className="flex justify-around items-center px-2 py-2">
        {items.map((item) => {
          const active = pathname === item.href || (item.href === '/home' && pathname === '/home');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center min-w-[64px] py-2 relative transition-colors
                ${active ? 'text-[var(--color-primary)]' : 'text-[var(--color-on-surface-variant)]/60 hover:text-[var(--color-primary)]'}`}
            >
              {active && (
                <span className="absolute -top-3 w-8 h-1 bg-[var(--color-primary)] rounded-full" />
              )}
              <span
                className="material-symbols-outlined text-[26px]"
                style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
              >
                {item.icon}
              </span>
              <span className={`text-[11px] mt-0.5 ${active ? 'font-bold' : 'font-medium'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
