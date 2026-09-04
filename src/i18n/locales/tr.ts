import type { TranslationSchema } from './ar.ts';

const tr: TranslationSchema = {
  common: {
    save: 'Kaydet',
    cancel: 'İptal',
    delete: 'Sil',
    confirm: 'Onayla',
    loading: 'Yükleniyor...',
    language: 'Dil',
    user: 'Kullanıcı',
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
    executiveBoard: 'Yönetim Kurulu',
    executiveBoardOverview: 'Kurula Genel Bakış',
  },
  auth: {
    login: 'Giriş Yap',
    logout: 'Çıkış Yap',
    checkingSession: 'Hesap oturumu doğrulanıyor...',
  },
  dashboard: {
    studentPortal: 'Öğrenci Portalı',
  },
  admin: {
    adminDashboard: 'Yönetim Paneli',
  },
  roles: {
    unionPresident: 'Birlik Başkanı',
    vicePresident: 'Başkan Yardımcısı',
    student: 'Öğrenci',
    member: 'Üye',
    committeeOfficer: '{{committee}} Sorumlusu',
  },
  footer: {
    quickLinks: 'Hızlı Bağlantılar',
    contactUs: 'Bize Ulaşın',
    newsletter: 'Bülten',
    newsletterSubtitle: 'Birliğin en son haberlerini ve etkinliklerini almak için abone olun.',
    emailLabel: 'E-posta Adresiniz',
    subscribeButton: 'Abone Ol',
    subscribeSuccess: 'Başarıyla abone olundu! Teşekkür ederiz.',
    enterEmail: 'Lütfen abone olmadan önce e-posta adresinizi girin',
    enterValidEmail: 'Lütfen geçerli bir e-posta adresi girin',
    aboutText: 'Çeşitli eğitici, öğretici ve gönüllü programlar aracılığıyla bilinçli, sorumluluk sahibi ve milletine bağlı bir nesil yetiştirmeyi amaçlayan bir gençlik birliği.',
  },
  cms: {
    autoTranslate: 'Otomatik Çevir',
  },
  errors: {
    generic: 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.',
  },
};

export default tr;
