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
  },
  auth: {
    login: 'تسجيل الدخول',
    logout: 'تسجيل الخروج',
  },
  dashboard: {
    studentPortal: 'بوابة الطالب',
  },
  admin: {
    adminDashboard: 'لوحة الإدارة',
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
