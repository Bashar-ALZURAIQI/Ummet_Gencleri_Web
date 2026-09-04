import type { TranslationSchema } from './ar.ts';

const en: TranslationSchema = {
  common: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    confirm: 'Confirm',
    loading: 'Loading...',
  },
  navigation: {
    home: 'Home',
    about: 'About Us',
    programs: 'Programs & Activities',
    gallery: 'Media Gallery',
    news: 'Latest News',
    guide: 'Student Guide',
    faq: 'Frequently Asked Questions',
    contact: 'Contact Us',
  },
  auth: {
    login: 'Login',
    logout: 'Logout',
  },
  dashboard: {
    studentPortal: 'Student Portal',
  },
  admin: {
    adminDashboard: 'Admin Dashboard',
  },
  cms: {
    autoTranslate: 'Auto Translate',
  },
  errors: {
    generic: 'An unexpected error occurred. Please try again.',
  },
};

export default en;
