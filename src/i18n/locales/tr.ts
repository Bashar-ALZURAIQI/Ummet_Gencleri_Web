import type { TranslationSchema } from './ar.ts';

const tr: TranslationSchema = {
  common: {
    save: 'Kaydet',
    cancel: 'İptal',
    delete: 'Sil',
    confirm: 'Onayla',
    loading: 'Yükleniyor...',
    language: 'Dil',
  },
  navigation: {
    home: 'Ana Sayfa',
    about: 'Hakkımızda',
    programs: 'Programlar ve Etkinlikler',
    gallery: 'Medya Galerisi',
    news: 'Son Haberler',
    guide: 'Öğrenci Rehberi',
    faq: 'Sıkça Sorulan Sorular',
    contact: 'İletişim',
  },
  auth: {
    login: 'Giriş Yap',
    logout: 'Çıkış Yap',
  },
  dashboard: {
    studentPortal: 'Öğrenci Portalı',
  },
  admin: {
    adminDashboard: 'Yönetim Paneli',
  },
  cms: {
    autoTranslate: 'Otomatik Çevir',
  },
  errors: {
    generic: 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.',
  },
};

export default tr;
