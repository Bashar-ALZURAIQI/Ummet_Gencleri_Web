import { Menu, X, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  closeSidebar,
  shouldCloseSidebarForKey,
  toggleSidebar,
  type SidebarDrawerState,
} from '../domain/sidebarNavigation';

export interface SidebarItem<TId extends string> {
  id: TId;
  label: string;
  icon: LucideIcon;
}

export interface SidebarLayoutProps<TId extends string> {
  items: SidebarItem<TId>[];
  activeId: TId;
  onSelect: (id: TId) => void;
  title?: string;
  direction?: 'rtl' | 'ltr';
  children: ReactNode;
}

const CLOSED_DRAWER: SidebarDrawerState = { open: false };
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function SidebarLayout<TId extends string>({
  items,
  activeId,
  onSelect,
  title = 'الأقسام',
  direction = 'rtl',
  children,
}: SidebarLayoutProps<TId>) {
  const [drawer, setDrawer] = useState<SidebarDrawerState>(CLOSED_DRAWER);
  const drawerId = useId();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  const closeDrawer = useCallback(() => {
    setDrawer(closeSidebar);
  }, []);

  useEffect(() => {
    if (!drawer.open) return;

    const previousOverflow = document.body.style.overflow;
    const getFocusableElements = () =>
      Array.from(drawerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldCloseSidebarForKey(event.key)) {
        setDrawer(closeSidebar);
        return;
      }

      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements();
      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];

      if (!firstFocusable || !lastFocusable) {
        event.preventDefault();
        drawerRef.current?.focus();
        return;
      }

      const focusIsInsideDrawer = drawerRef.current?.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === firstFocusable || !focusIsInsideDrawer)) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && (document.activeElement === lastFocusable || !focusIsInsideDrawer)) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    const firstFocusable = getFocusableElements()[0];
    if (firstFocusable) {
      firstFocusable.focus();
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      menuButtonRef.current?.focus();
    };
  }, [drawer.open]);

  const handleSelect = (item: SidebarItem<TId>) => {
    onSelect(item.id);
    closeDrawer();
  };

  const navigation = (mobile = false) => (
    <nav aria-label={title} className="space-y-2">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.id === activeId;

        return (
          <button
            key={item.id}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => (mobile ? handleSelect(item) : onSelect(item.id))}
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-right text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
              active
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-navy-800 hover:bg-emerald-50 hover:text-emerald-800'
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="flex h-full w-full overflow-hidden" dir={direction}>
      <aside
        className={`hidden h-full w-[17rem] shrink-0 overflow-y-auto bg-white p-4 shadow-sm lg:block ${
          direction === 'rtl' ? 'border-l border-gray-200' : 'border-r border-gray-200'
        }`}
      >
        <h2 className="mb-4 px-2 text-base font-bold text-navy-900">{title}</h2>
        {navigation()}
      </aside>

      <main className="h-full min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            ref={menuButtonRef}
            aria-expanded={drawer.open}
            aria-controls={drawerId}
            onClick={() => setDrawer(toggleSidebar)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
            القائمة
          </button>
        </div>
        {children}
      </main>

      {drawer.open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="إغلاق القائمة"
            className="absolute inset-0 bg-navy-950/55"
            onClick={() => setDrawer(closeSidebar)}
          />
          <aside
            id={drawerId}
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className={`fixed inset-y-0 h-full w-[17rem] max-w-[85vw] overflow-y-auto bg-white p-5 shadow-2xl ${
              direction === 'rtl' ? 'right-0' : 'left-0'
            }`}
          >
            <div className="mb-6 flex items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-navy-900">{title}</h2>
              <button
                type="button"
                aria-label="إغلاق القائمة"
                onClick={() => setDrawer(closeSidebar)}
                className="rounded-lg p-2 text-navy-700 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            {navigation(true)}
          </aside>
        </div>
      )}
    </div>
  );
}
