import type { TranslationSchema } from './ar.ts';

const en: TranslationSchema = {
  common: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    confirm: 'Confirm',
    loading: 'Loading...',
    language: 'Language',
    user: 'User',
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
    executiveBoard: 'Executive Board',
    executiveBoardOverview: 'Board Overview',
  },
  auth: {
    login: 'Login',
    logout: 'Logout',
    checkingSession: 'Checking account session...',
  },
  dashboard: {
    studentPortal: 'Student Portal',
  },
  admin: {
    adminDashboard: 'Admin Dashboard',
  },
  roles: {
    unionPresident: 'Union President',
    vicePresident: 'Vice President',
    student: 'Student',
    member: 'Member',
    committeeOfficer: '{{committee}} Officer',
  },
  footer: {
    quickLinks: 'Quick Links',
    contactUs: 'Contact Us',
    newsletter: 'Newsletter',
    newsletterSubtitle: 'Subscribe to receive the latest news and activities of the union.',
    emailLabel: 'Your Email',
    subscribeButton: 'Subscribe',
    subscribeSuccess: 'Subscribed successfully! Thank you.',
    enterEmail: 'Please enter your email before subscribing',
    enterValidEmail: 'Please enter a valid email',
    aboutText: 'A youth union aiming to build a conscious, responsible generation committed to their community through various educational, training, and volunteer programs.',
  },
  cms: {
    autoTranslate: 'Auto Translate',
  },
  errors: {
    generic: 'An unexpected error occurred. Please try again.',
  },
};

export default en;
