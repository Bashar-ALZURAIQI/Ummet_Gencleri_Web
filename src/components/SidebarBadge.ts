import { createElement } from 'react';

export interface SidebarBadgeProps {
  count?: number;
  surface: 'desktop' | 'mobile';
}

export function SidebarBadge({ count, surface }: SidebarBadgeProps) {
  if (!count || count < 1) return null;

  return createElement(
    'span',
    {
      'aria-label': String(count),
      'data-sidebar-surface': surface,
      className: 'ms-auto inline-flex min-w-6 items-center justify-center rounded-full bg-amber-400 px-1.5 py-0.5 text-xs font-extrabold leading-none text-navy-950',
    },
    count,
  );
}
