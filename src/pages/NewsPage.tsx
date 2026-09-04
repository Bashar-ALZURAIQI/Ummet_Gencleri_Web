import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Newspaper, CalendarDays, ChevronLeft, ExternalLink } from 'lucide-react';
import { useApp } from '../context/AppContext';
import Modal from '../components/Modal';
import type { NewsItem } from '../data/mockData';

export default function NewsPage() {
  const { news } = useApp();
  const { t } = useTranslation();
  const [active, setActive] = useState<NewsItem | null>(null);

  const sorted = [...news].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="min-h-screen bg-gradient-to-b from-navy-50 to-gray-50 pt-20 lg:pt-24">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-l from-navy-900 to-navy-950 py-16">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />
        <div className="container-app relative">
          <div className="flex items-center gap-3 text-gold-400">
            <Newspaper className="h-6 w-6" />
            <span className="text-sm font-bold tracking-wide">{t('news.badge')}</span>
          </div>
          <h1 className="mt-3 text-3xl font-extrabold text-white sm:text-4xl">{t('news.title')}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-300">
            {t('news.description')}
          </p>
        </div>
      </div>

      <div className="container-app py-10">
        {sorted.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">{t('news.noNews')}</div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {sorted.map((n) => (
              <article
                key={n.id}
                className="card group flex flex-col overflow-hidden transition-all hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="relative h-44 overflow-hidden">
                  <img src={n.image} alt={n.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  <span className="absolute top-3 right-3 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-navy-800 backdrop-blur-sm">{n.category}</span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {new Date(n.date).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                  <h3 className="mt-2 text-lg font-bold leading-snug text-navy-900 transition-colors group-hover:text-navy-700">{n.title}</h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-gray-500">{n.excerpt}</p>
                  <div className="mt-4 flex-1" />
                  <div className="mt-4 flex items-center gap-2">
                    <button onClick={() => setActive(n)} className="inline-flex items-center gap-1.5 text-sm font-bold text-navy-700 hover:text-navy-900">
                      {t('common.readMore')}
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    {n.externalUrl && (
                      <a
                        href={n.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mr-auto inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-l from-fuchsia-600 to-pink-500 px-3 py-1.5 text-xs font-bold text-white shadow-md transition-transform hover:scale-105"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {t('news.viewSource')}
                      </a>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* News detail modal */}
      <Modal open={!!active} onClose={() => setActive(null)} title={active?.title ?? ''} maxWidth="max-w-2xl">
        {active && (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl">
              <img src={active.image} alt={active.title} className="aspect-video w-full object-cover" />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className="rounded-full bg-navy-50 px-3 py-1 font-bold text-navy-700">{active.category}</span>
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                {new Date(active.date).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </div>
            <h3 className="text-xl font-extrabold text-navy-900">{active.title}</h3>
            <p className="text-sm leading-loose text-gray-600">{active.excerpt}</p>
            {active.fullContent && (
              <p className="text-sm leading-loose text-gray-700">{active.fullContent}</p>
            )}
            {active.externalUrl && (
              <a
                href={active.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-l from-fuchsia-600 to-pink-500 px-4 py-2.5 text-sm font-bold text-white shadow-md transition-transform hover:scale-105"
              >
                <ExternalLink className="h-4 w-4" />
                {t('news.viewSource')}
              </a>
            )}
            <button onClick={() => setActive(null)} className="btn-ghost">{t('common.close')}</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
