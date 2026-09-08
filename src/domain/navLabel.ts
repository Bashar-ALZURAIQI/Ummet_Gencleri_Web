export const NAV_LABEL_LINES: Record<string, string[]> = {
  // Turkish
  'Ana Sayfa': ['Ana', 'Sayfa'],
  'Hakkımızda': ['Hakkımızda'],
  'Programlar': ['Programlar'],
  'Galeri': ['Galeri'],
  'Haberler': ['Haberler'],
  'Öğrenci Rehberi': ['Öğrenci', 'Rehberi'],
  'SSS': ['SSS'],
  'İletişim': ['İletişim'],
  'Yönetim Kurulu': ['Yönetim', 'Kurulu'],
  'Öğrenci Portalı': ['Öğrenci', 'Portalı'],
  'Programlar ve Etkinlikler': ['Programlar ve', 'Etkinlikler'],
  'Medya Galerisi': ['Medya', 'Galerisi'],
  'Son Haberler': ['Son', 'Haberler'],
  'Sıkça Sorulan Sorular': ['Sıkça Sorulan', 'Sorular'],
  'Kurula Genel Bakış': ['Kurula Genel', 'Bakış'],

  // English
  'Home': ['Home'],
  'About Us': ['About', 'Us'],
  'Programs': ['Programs'],
  'Gallery': ['Gallery'],
  'News': ['News'],
  'Student Guide': ['Student', 'Guide'],
  'FAQ': ['FAQ'],
  'Contact': ['Contact'],
  'Executive Board': ['Executive', 'Board'],
  'Student Portal': ['Student', 'Portal'],
  'Frequently Asked Questions': ['Frequently Asked', 'Questions'],
  'Board Overview': ['Board', 'Overview'],

  // Arabic
  'الرئيسية': ['الرئيسية'],
  'عن الاتحاد': ['عن', 'الاتحاد'],
  'البرامج': ['البرامج'],
  'المعرض': ['المعرض'],
  'الأخبار': ['الأخبار'],
  'دليل الطالب': ['دليل', 'الطالب'],
  'الأسئلة الشائعة': ['الأسئلة', 'الشائعة'],
  'اتصل بنا': ['اتصل', 'بنا'],
  'الهيئة التنفيذية': ['الهيئة', 'التنفيذية'],
  'بوابة الطالب': ['بوابة', 'الطالب'],
  'نظرة عامة على الهيئة': ['نظرة عامة', 'على الهيئة'],
};

export function splitNavLabel(label: string): string[] {
  const trimmed = label.trim();
  if (!trimmed) return [];
  if (NAV_LABEL_LINES[trimmed]) {
    return NAV_LABEL_LINES[trimmed];
  }
  const words = trimmed.split(/\s+/);
  if (words.length <= 1) {
    return [trimmed];
  }
  if (words.length === 2) {
    return [words[0], words[1]];
  }
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}
