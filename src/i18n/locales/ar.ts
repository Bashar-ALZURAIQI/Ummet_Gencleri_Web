type DeepStringify<T> = {
  [K in keyof T]: T[K] extends object ? DeepStringify<T[K]> : string;
};

const ar = {
  common: {
    save: 'حفظ',
    cancel: 'إلغاء',
    delete: 'حذف',
    confirm: 'تأكيد',
    loading: 'جارٍ التحميل...',
    language: 'اللغة',
    user: 'المستخدم',
  },
  navigation: {
    home: 'الرئيسية',
    about: 'عن الاتحاد',
    programs: 'البرامج والأنشطة',
    gallery: 'معرض الوسائط',
    news: 'آخر الأخبار',
    guide: 'دليل الطالب',
    faq: 'الأسئلة الشائعة',
    contact: 'اتصل بنا',
    executiveBoard: 'الهيئة التنفيذية',
    executiveBoardOverview: 'نظرة عامة على الهيئة',
  },
  auth: {
    login: 'تسجيل الدخول',
    logout: 'تسجيل الخروج',
    checkingSession: 'جارٍ التحقق من جلسة الحساب...',
  },
  dashboard: {
    studentPortal: 'بوابة الطالب',
  },
  admin: {
    adminDashboard: 'لوحة الإدارة',
  },
  roles: {
    unionPresident: 'رئيس الاتحاد',
    vicePresident: 'نائب الرئيس',
    student: 'طالب عادي',
    member: 'عضو',
    committeeOfficer: 'مسؤول {{committee}}',
  },
  footer: {
    quickLinks: 'روابط سريعة',
    contactUs: 'تواصل معنا',
    newsletter: 'النشرة البريدية',
    newsletterSubtitle: 'اشترك لتصلك آخر أخبار وأنشطة الاتحاد.',
    emailLabel: 'بريدك الإلكتروني',
    subscribeButton: 'اشترك',
    subscribeSuccess: 'تم الاشتراك بنجاح! شكرًا لك.',
    enterEmail: 'يرجى إدخال بريدك الإلكتروني قبل الاشتراك',
    enterValidEmail: 'يرجى إدخال بريد إلكتروني صالح',
    aboutText: 'اتحاد شبابي يهدف إلى بناء جيل واعٍ، مسؤول، ومنتمٍ لأمته، عبر برامج تثقيفية وتدريبية وتطوعية متنوعة.',
  },
  cms: {
    autoTranslate: 'ترجمة تلقائية',
  },
  errors: {
    generic: 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.',
  },
};

export type TranslationSchema = DeepStringify<typeof ar>;

export default ar;
