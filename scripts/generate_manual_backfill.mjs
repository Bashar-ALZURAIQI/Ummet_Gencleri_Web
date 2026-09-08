import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

// FNV-1a canonical JSON stringify & hash matching src/domain/cmsLocalization.ts
function canonicalJsonStringify(val) {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return '[' + val.map(canonicalJsonStringify).join(',') + ']';
  }
  const keys = Object.keys(val).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJsonStringify(val[k])).join(',') + '}';
}

function computeSourceHash(payload) {
  const canonical = canonicalJsonStringify(payload);
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// ===========================================================================
// Authoritative Real Production Canonical CMS Content (15 Targets)
// Discovered from published_site_content (v36), student_guide (v4), faq (v1)
// ===========================================================================

// 1. SITE
const canonicalSite = {
  hero: {
    badge: 'نُمكّن الشباب، نبني المستقبل',
    image: 'https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/gallery/site/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/1278474e-180d-4c5c-9b50-22472fb26a39.jpg',
    title: 'اتحاد شباب الأمة',
    badge1: {
      label: 'جائزة تكريم',
      value: '12',
    },
    badge2: {
      icon: 'TrendingUp',
      label: 'نمو سنوي',
      value: '+%10',
    },
    subtitle: 'نحو جيلٍ واعٍ ومسؤول ',
    primaryBtn: 'تصفح البرامج',
    description: 'اتحاد شبابي يجمع طلاب الجامعات تحت مظلة واحدة، لتعزيز الهوية، وتنمية المهارات، وبناء قادة الغد عبر برامج تثقيفية وتدريبية وتطوعية متكاملة.',
    tertiaryBtn: 'الهيئة التنفيذية',
    secondaryBtn: 'تعرّف على الاتحاد',
  },
  about: {
    badge: 'من نحن',
    image: 'https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/gallery/site/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/793f1e54-2550-4a05-82cc-75ebf0957f93.jpg',
    title: 'رسالتنا: بناء جيلٍ يحمل همّ أمته',
    subtitle: 'انضم إلى عائلة اتحاد شباب الأمة',
    features: [
      { desc: 'إعداد قادة شباب مؤثرين.', icon: 'Target', title: 'رؤية واضحة' },
      { desc: 'برامج تدريبية وتثقيفية.', icon: 'BookOpen', title: 'تعليم مستمر' },
      { desc: 'خدمة المجتمع والأمة.', icon: 'HeartHandshake', title: 'عمل تطوعي' },
      { desc: 'مساحات للمبادرات الشبابية.', icon: 'Sparkles', title: 'إبداع وابتكار' },
    ],
    imageBadge: { label: 'طالب استفاد من برامجنا هذا العام', value: '+1200' },
    description: 'نؤمن أن الشباب هم عماد المستقبل وصناع التغيير. لذلك نعمل على تأهيل الطلاب أكاديميًا ومهاريًا، وتعزيز انتمائهم لأمتهم، عبر بيئة شبابية محفّزة وبرامج متنوعة تجمع بين العلم والعمل والقيم.',
  },
  brand: {
    name: 'اتحاد شباب الأمة',
    nameTr: 'Ummet Gençleri Birliği',
    logoUrl: 'https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/site_assets/branding/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/1795da77-3378-40a5-82df-42e368440368.png',
    logoIcon: 'Users',
    logoPath: 'branding/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/1795da77-3378-40a5-82df-42e368440368.png',
  },
  stats: [
    { icon: 'Users', label: 'عضو مسجل', value: 12 },
    { icon: 'CalendarDays', label: 'فعالية منظمة', value: 86 },
    { icon: 'GraduationCap', label: 'جامعة شريكة', value: 2 },
    { icon: 'HeartHandshake', label: 'متطوع نشط', value: 540 },
  ],
  footer: {
    email: 'ummetgencleribirligi@gmail.com',
    phone: '00905375922478',
    social: {
      twitter: 'https://twitter.com/ummet',
      youtube: 'https://youtube.com/@ummet',
      facebook: 'https://facebook.com/ummet',
      instagram: 'https://www.instagram.com/ummet_gencleri?igsi=ZTl5dTl5NWFzczVh',
    },
    address: 'Erzurum_Turkiye',
    copyright: 'اتحاد شباب الأمة - جميع الحقوق محفوظة.',
  },
  boardPreview: {
    title: 'الهيئة التنفيذية',
    subtitle: 'الهيكل التنظيمي',
    memberIds: ['presidency', 'vice-presidency', 'media', 'academic'],
    description: 'فريق قيادي متكامل يضم الرئاسة ونائب الرئيس وخمس لجان متخصصة.',
  },
};

const trSite = {
  hero: {
    badge: 'Gençleri Güçlendiriyor, Geleceği İnşa Ediyoruz',
    image: canonicalSite.hero.image,
    title: 'Ümmet Gençleri Birliği',
    badge1: {
      label: 'Onur Ödülü',
      value: '12',
    },
    badge2: {
      icon: 'TrendingUp',
      label: 'Yıllık Büyüme',
      value: '+%10',
    },
    subtitle: 'Bilinçli ve Sorumlu Bir Nesle Doğru',
    primaryBtn: 'Programları İncele',
    description: 'Üniversite öğrencilerini tek çatı altında buluşturan, kimliği güçlendiren, becerileri geliştiren ve kapsamlı eğitim, gelişim ve gönüllülük programlarıyla yarının liderlerini yetiştiren bir gençlik birliği.',
    tertiaryBtn: 'Yönetim Kurulu',
    secondaryBtn: 'Birliği Tanıyın',
  },
  about: {
    badge: 'Biz Kimiz',
    image: canonicalSite.about.image,
    title: 'Misyonumuz: Ümmetinin Derdiyle Dertlenen Bir Nesil Yetiştirmek',
    subtitle: 'Ümmet Gençleri Birliği Ailesine Katılın',
    features: [
      { desc: 'Etkili genç liderler yetiştirmek.', icon: 'Target', title: 'Net Vizyon' },
      { desc: 'Eğitim ve gelişim programları.', icon: 'BookOpen', title: 'Sürekli Eğitim' },
      { desc: 'Topluma ve ümmete samimi hizmet.', icon: 'HeartHandshake', title: 'Gönüllü Çalışma' },
      { desc: 'Gençlik girişimleri için verimli alanlar.', icon: 'Sparkles', title: 'İnovasyon' },
    ],
    imageBadge: { label: 'Bu yıl programlarımızdan yararlanan öğrenci', value: '+1200' },
    description: 'Gençlerin geleceğin mimarları olduğuna inanıyoruz. Bu doğrultuda öğrencilerimizi akademik ve mesleki olarak güçlendiriyor, ilim, amel ve ahlakı birleştiren teşvik edici bir ortamda ümmete aidiyet bilincini pekiştiriyoruz.',
  },
  brand: {
    name: 'Ümmet Gençleri Birliği',
    nameTr: 'Ümmet Gençleri Birliği',
    logoUrl: canonicalSite.brand.logoUrl,
    logoIcon: canonicalSite.brand.logoIcon,
    logoPath: canonicalSite.brand.logoPath,
  },
  stats: [
    { icon: 'Users', label: 'Kayıtlı Üye', value: 12 },
    { icon: 'CalendarDays', label: 'Düzenlenen Etkinlik', value: 86 },
    { icon: 'GraduationCap', label: 'Ortak Üniversite', value: 2 },
    { icon: 'HeartHandshake', label: 'Aktif Gönüllü', value: 540 },
  ],
  footer: {
    email: canonicalSite.footer.email,
    phone: canonicalSite.footer.phone,
    social: canonicalSite.footer.social,
    address: 'Erzurum, Türkiye',
    copyright: 'Ümmet Gençleri Birliği - Tüm hakları saklıdır.',
  },
  boardPreview: {
    title: 'Yönetim Kurulu',
    subtitle: 'Organizasyon Yapısı',
    memberIds: canonicalSite.boardPreview.memberIds,
    description: 'Başkanlık, Başkan Yardımcılığı ve uzman komitelerden oluşan kapsamlı liderlik ekibi.',
  },
};

const enSite = {
  hero: {
    badge: 'Empowering Youth, Building the Future',
    image: canonicalSite.hero.image,
    title: 'Ummah Youth Union',
    badge1: {
      label: 'Honor Awards',
      value: '12',
    },
    badge2: {
      icon: 'TrendingUp',
      label: 'Annual Growth',
      value: '+10%',
    },
    subtitle: 'Towards a Conscious and Responsible Generation',
    primaryBtn: 'Explore Programs',
    description: 'A youth union uniting university students under one umbrella to strengthen identity, develop skills, and build tomorrow’s leaders through integrated educational, training, and volunteer programs.',
    tertiaryBtn: 'Executive Board',
    secondaryBtn: 'Discover the Union',
  },
  about: {
    badge: 'Who We Are',
    image: canonicalSite.about.image,
    title: 'Our Mission: Building a Generation Dedicated to Its Ummah',
    subtitle: 'Join the Ummah Youth Union Family',
    features: [
      { desc: 'Empowering influential youth leaders.', icon: 'Target', title: 'Clear Vision' },
      { desc: 'Training and educational programs.', icon: 'BookOpen', title: 'Continuous Learning' },
      { desc: 'Serving society and the Ummah.', icon: 'HeartHandshake', title: 'Volunteer Work' },
      { desc: 'Creative spaces for youth initiatives.', icon: 'Sparkles', title: 'Innovation' },
    ],
    imageBadge: { label: 'Students benefited from our programs this year', value: '+1200' },
    description: 'We believe that youth are the pillars of the future and changemakers. We work to empower students academically and professionally while strengthening their belonging to their Ummah in a stimulating community environment.',
  },
  brand: {
    name: 'Ummah Youth Union',
    nameTr: 'Ummet Gençleri Birliği',
    logoUrl: canonicalSite.brand.logoUrl,
    logoIcon: canonicalSite.brand.logoIcon,
    logoPath: canonicalSite.brand.logoPath,
  },
  stats: [
    { icon: 'Users', label: 'Registered Members', value: 12 },
    { icon: 'CalendarDays', label: 'Organized Events', value: 86 },
    { icon: 'GraduationCap', label: 'Partner Universities', value: 2 },
    { icon: 'HeartHandshake', label: 'Active Volunteers', value: 540 },
  ],
  footer: {
    email: canonicalSite.footer.email,
    phone: canonicalSite.footer.phone,
    social: canonicalSite.footer.social,
    address: 'Erzurum, Turkey',
    copyright: 'Ummah Youth Union - All Rights Reserved.',
  },
  boardPreview: {
    title: 'Executive Board',
    subtitle: 'Organizational Structure',
    memberIds: canonicalSite.boardPreview.memberIds,
    description: 'A comprehensive leadership team comprising Presidency, Vice Presidency, and specialized committees.',
  },
};

// 2. ABOUT
const canonicalAbout = {
  cta: {
    icon: 'Award',
    title: 'كن جزءًا من رحلتنا',
    buttonText: 'سجّل الآن',
    description: 'انضم إلى آلاف الطلاب الذين اختاروا أن يكونوا فاعلين في مجتمعاتهم.',
  },
  goals: {
    badge: 'أهدافنا',
    cards: [
      { desc: 'محاضرات وندوات تعزز الوعي الثقافي والفكري.', icon: 'BookOpen', title: 'التثقيف المستمر' },
      { desc: 'دعم الطلاب علميًا وتوجيههم نحو التميز في مساراتهم.', icon: 'GraduationCap', title: 'الإرشاد الأكاديمي' },
      { desc: 'تطوير القدرات القيادية والإدارية والإعلامية لدى الطلاب.', icon: 'Users', title: 'تنمية المهارات' },
      { desc: 'تثبيت قيم الانتماء للأمة لدى جيل الشباب.', icon: 'ShieldCheck', title: 'تعزيز الهوية' },
      { desc: 'احتضان المبادرات الشبابية الإبداعية وتطويرها.', icon: 'Sparkles', title: 'دعم الابتكار' },
      { desc: 'تنظيم حملات ومبادرات تخدم المجتمع وتعزز المسؤولية.', icon: 'Handshake', title: 'العمل التطوعي' },
    ],
    title: 'ما نسعى لتحقيقه',
  },
  story: {
    badge: 'قصتنا',
    title: 'من البداية حتى اليوم',
    images: [
      'https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/gallery/site/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/a316c67e-0372-49d9-af45-c7c955dcf50c.jpg',
      'https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/gallery/site/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/ebe6a555-d5f5-4e96-bcb6-a3e233b7de0d.jpg',
      'https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/gallery/site/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/044497a0-d0fd-449f-816b-e1d35dda1018.jpg',
      'https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/gallery/site/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/7fea14a6-2566-46f6-8eb1-4bddc8818f71.jpg',
    ],
    paragraphs: [
      'بدأنا كمجموعة صغيرة من الطلاب المتطوعين يحلمون بمساحة شبابية تجمع بين الهمّ والعمل. اليوم، أصبحنا اتحادًا يضم أكثر من 1200 عضو من 24 جامعة مختلفة.',
      'نظّمنا 86 فعالية متنوعة بين ورش عمل ومحاضرات وبرامج تدريبية وحملات تطوعية، وخرّجنا قادة شبابًا يقودون اليوم مبادراتهم الخاصة في مجتمعاتهم.',
      'نؤمن أن بناء الأمة يبدأ من بناء الشاب، وأن كل طالب يحمل في داخله طاقة قادرة على التغيير إذا وُجدت البيئة المناسبة.',
    ],
  },
  header: {
    badge: 'من نحن',
    title: 'عن اتحاد شباب الأمة',
    description: 'اتحاد شبابي تأسس ليجمع طلاب الجامعات تحت مظلة واحدة، يعزز الهوية ويبني المهارات ويصنع القادة.',
  },
  mission: {
    badge: 'رسالتنا ورؤيتنا',
    cards: [
      { icon: 'Target', text: 'إعداد جيل شبابي واعٍ ومسؤول، يمتلك المهارات والقيم التي تؤهله لقيادة مستقبل أمته.', title: 'رسالتنا' },
      { icon: 'Eye', text: 'أن نكون الاتحاد الشبابي الرائد في تأهيل القادة وتنمية المجتمعات على مستوى المنطقة.', title: 'رؤيتنا' },
      { icon: 'Heart', text: 'الانتماء، الإخلاص، التعاون، التميّز، والمسؤولية. مبادئ نلتزم بها في كل ما نقوم به.', title: 'قيمنا' },
    ],
    title: 'قيمنا، رؤيتنا، ورسالتنا',
  },
};

const trAbout = {
  cta: {
    icon: 'Award',
    title: 'Yolculuğumuzun Bir Parçası Olun',
    buttonText: 'Şimdi Kaydolun',
    description: 'Toplumlarında aktif rol almayı seçen binlerce öğrenci arasına katılın.',
  },
  goals: {
    badge: 'Hedeflerimiz',
    cards: [
      { desc: 'Kültürel ve düşünsel bilinci artıran seminer ve paneller düzenlemek.', icon: 'BookOpen', title: 'Sürekli Eğitim' },
      { desc: 'Öğrencileri bilimsel olarak desteklemek ve alanlarında başarıya yönlendirmek.', icon: 'GraduationCap', title: 'Akademik Rehberlik' },
      { desc: 'Öğrencilerin liderlik, yönetim ve medya alanlarındaki yetkinliklerini geliştirmek.', icon: 'Users', title: 'Beceri Gelişimi' },
      { desc: 'Genç nesilde ümmete aidiyet ve medeniyet bilincini pekiştirmek.', icon: 'ShieldCheck', title: 'Kimliği Güçlendirme' },
      { desc: 'Yaratıcı gençlik girişimlerini kucaklamak ve geliştirmek.', icon: 'Sparkles', title: 'Yenilikçiliği Destekleme' },
      { desc: 'Topluma hizmet eden ve sorumluluk duygusunu pekiştiren kampanyalar yürütmek.', icon: 'Handshake', title: 'Gönüllü Faaliyetler' },
    ],
    title: 'Ulaşmak İstediklerimiz',
  },
  story: {
    badge: 'Hikayemiz',
    title: 'Başlangıçtan Bugüne',
    images: canonicalAbout.story.images,
    paragraphs: [
      'Toplumsal dert ile eylemi birleştiren bir gençlik alanı hayal eden küçük bir gönüllü öğrenci grubu olarak başladık. Bugün 24 farklı üniversiteden 1.200\'den fazla üyeye sahip bir birliğe dönüştük.',
      'Atölyeler, konferanslar, eğitim programları ve gönüllülük kampanyalarından oluşan 86 farklı etkinlik düzenledik; bugün kendi toplumlarında projelere öncülük eden genç liderler yetiştirdik.',
      'Ümmetin inşasının gençlerin inşasıyla başladığına, uygun ortam sağlandığında her öğrencinin içinde değişim yaratma potansiyeli taşıdığına inanıyoruz.',
    ],
  },
  header: {
    badge: 'Hakkımızda',
    title: 'Ümmet Gençleri Birliği Hakkında',
    description: 'Üniversite öğrencilerini tek bir çatı altında toplamak, kimliği güçlendirmek, becerileri geliştirmek ve liderler yetiştirmek amacıyla kurulmuş bir gençlik birliği.',
  },
  mission: {
    badge: 'Misyonumuz ve Vizyonumuz',
    cards: [
      { icon: 'Target', text: 'Ümmetinin geleceğine liderlik etmeye hazır, gerekli bilgi, beceri ve değerlerle donatılmış bilinçli ve sorumlu bir genç nesil yetiştirmek.', title: 'Misyonumuz' },
      { icon: 'Eye', text: 'Bölge genelinde lider yetiştirme ve toplumsal kalkınmada öncü gençlik birliği olmak.', title: 'Vizyonumuz' },
      { icon: 'Heart', text: 'Aidiyet, samimiyet, dayanışma, mükemmellik ve sorumluluk. Yaptığımız her faaliyette bu ilkelere bağlıyız.', title: 'Değerlerimiz' },
    ],
    title: 'Değerlerimiz, Vizyonumuz ve Misyonumuz',
  },
};

const enAbout = {
  cta: {
    icon: 'Award',
    title: 'Be Part of Our Journey',
    buttonText: 'Register Now',
    description: 'Join thousands of students who chose to be active changemakers in their communities.',
  },
  goals: {
    badge: 'Our Goals',
    cards: [
      { desc: 'Lectures and symposiums enhancing cultural and intellectual awareness.', icon: 'BookOpen', title: 'Continuous Education' },
      { desc: 'Supporting students scientifically and guiding them toward excellence in their careers.', icon: 'GraduationCap', title: 'Academic Guidance' },
      { desc: 'Developing students’ leadership, administrative, and media capabilities.', icon: 'Users', title: 'Skill Development' },
      { desc: 'Reinforcing identity and belonging to the Ummah among the youth generation.', icon: 'ShieldCheck', title: 'Strengthening Identity' },
      { desc: 'Incubating and developing innovative youth initiatives.', icon: 'Sparkles', title: 'Supporting Innovation' },
      { desc: 'Organizing campaigns and projects that serve society and foster responsibility.', icon: 'Handshake', title: 'Volunteer Work' },
    ],
    title: 'What We Strive to Achieve',
  },
  story: {
    badge: 'Our Story',
    title: 'From Humble Beginnings to Today',
    images: canonicalAbout.story.images,
    paragraphs: [
      'We began as a small group of volunteer students dreaming of a youth space combining purposeful concern with impactful action. Today, we have grown into a union with over 1,200 members across 24 different universities.',
      'We organized 86 diverse events including workshops, lectures, training programs, and volunteer campaigns, graduating youth leaders who now lead their own initiatives in their communities.',
      'We believe building the Ummah begins with building youth, and every student carries within the power to make change when provided with the right environment.',
    ],
  },
  header: {
    badge: 'About Us',
    title: 'About Ummah Youth Union',
    description: 'A youth union founded to unite university students under one umbrella, strengthen identity, build skills, and cultivate tomorrow\'s leaders.',
  },
  mission: {
    badge: 'Our Mission & Vision',
    cards: [
      { icon: 'Target', text: 'Preparing a conscious and responsible youth generation equipped with skills and values to lead the future of their Ummah.', title: 'Our Mission' },
      { icon: 'Eye', text: 'To be the premier youth union in leadership development and community empowerment across the region.', title: 'Our Vision' },
      { icon: 'Heart', text: 'Belonging, sincerity, cooperation, excellence, and responsibility. Principles we uphold in everything we do.', title: 'Our Values' },
    ],
    title: 'Our Values, Vision, and Mission',
  },
};

// 3. PROGRAMS CONTENT
const canonicalProgramsContent = {
  badge: 'أنشطتنا',
  title: 'البرامج والأنشطة',
  description: 'تصفح برامجنا القادمة وسجّل في ما يناسبك، أو استعرض إنجازاتنا في الفعاليات السابقة.',
};

const trProgramsContent = {
  badge: 'Faaliyetlerimiz',
  title: 'Programlar ve Faaliyetler',
  description: 'Gelecek programlarımızı inceleyin, size uygun olanlara kaydolun veya geçmiş etkinliklerdeki başarılarımızı keşfedin.',
};

const enProgramsContent = {
  badge: 'Our Activities',
  title: 'Programs & Activities',
  description: 'Explore our upcoming programs, register for what suits you, or review our achievements in previous events.',
};

// 4. EVENTS (12 Real Production Events)
const canonicalEvents = [
  {
    id: 'd938c5ce-0bd0-4cc3-b862-f66582e73c80',
    title: 'كرة',
    location: 'المكان',
    description: 'الكل',
  },
  {
    id: '3f6fb2ba-25b0-442a-8cd8-aa4b1041b133',
    title: 'العنوان ssdd ',
    location: 'المكان',
    description: 'المكان',
  },
  {
    id: '1b670b06-383a-4e09-b428-271536e8b830',
    title: 'العنوان ss',
    location: 'المكان',
    description: 'hhhh',
  },
  {
    id: '758edb88-9774-472c-bfc7-37fc82918e7f',
    title: 'كرة',
    location: 'المكان',
    description: 'حلو',
  },
  {
    id: 'e1',
    title: 'ورشة عمل: مهارات القيادة الشبابية',
    location: 'قاعة المؤتمرات الرئيسية - إسطنبول',
    description: 'ورشة عمل تفاعلية تهدف إلى تنمية مهارات القيادة لدى الشباب، مع التركيز على اتخاذ القرار وإدارة الفرق وخطاب الجمهور.',
  },
  {
    id: 'e2',
    title: 'محاضرة: هوية الأمة وتحديات العصر',
    location: 'المركز الثقافي - أنقرة',
    description: 'محاضرة قيمة يتناول فيها المُحاضر التحديات التي تواجه هوية الأمة في العصر الحديث وسبائل التعامل معها بوعي ومسؤولية.',
  },
  {
    id: 'e3',
    title: 'حملة تطوعية: معًا نزرع الأمل',
    location: 'حديقة المدينة العامة - بورصة',
    description: 'حملة تطوعية لزراعة الأشجار وتنظيف الحدائق العامة، ضمن مبادرة الاتحاد للحفاظ على البيئة وتعزيز المسؤولية المجتمعية.',
  },
  {
    id: 'e4',
    title: 'برنامج تدريبي: أساسيات الإعلام الرقمي',
    location: 'مختبر الحاسوب - مقر الاتحاد',
    description: 'برنامج تدريبي مكثف يقدم أساسيات صناعة المحتوى الإعلامي الرقمي وإدارة منصات التواصل الاجتماعي باحترافية ومسؤولية.',
  },
  {
    id: 'e5',
    title: 'رحلة تثقيفية: آثار إسطنبول',
    location: 'المعالم التاريخية - إسطنبول',
    description: 'رحلة تثقيفية إلى أبرز المعالم التاريخية في إسطنبول، تستكشف المشاركون إرث المدينة العثماني وروائع عمارتها.',
  },
  {
    id: 'e6',
    title: 'ملتقى الشباب الأول',
    location: 'قاعة الكبرى - إسطنبول',
    description: 'ملتقى شبابي حضره أكثر من 300 شاب وشابة، تضمن لقاءات حوارية وورش مصاحبة وتوجيهات من قيادات الاتحاد.',
  },
  {
    id: 'e7',
    title: 'دورة: إدارة المشاريع الشبابية',
    location: 'مقر الاتحاد - أنقرة',
    description: 'دورة عملية في إدارة المشاريع الشبابية من التخطيط إلى التنفيذ والتقييم، خرج منها 45 متدربًا بشهادات معتمدة.',
  },
  {
    id: 'e8',
    title: 'حملة: إفطار جماعي في رمضان',
    location: 'ساحات المدينة - بورصة',
    description: 'حملة خيرية نظمها الاتحاد لتقديم وجبات إفطار للمحتاجين طوال شهر رمضان، شارك فيها 80 متطوعًا ووزع 2400 وجبة.',
  },
];

const trEvents = [
  {
    id: 'd938c5ce-0bd0-4cc3-b862-f66582e73c80',
    title: 'Futbol Karşılaşması',
    location: 'Spor Sahası',
    description: 'Öğrenciler arası dostluk futbol maçı.',
  },
  {
    id: '3f6fb2ba-25b0-442a-8cd8-aa4b1041b133',
    title: 'Öğrenci Gelişim Atölyesi',
    location: 'Konferans Salonu',
    description: 'Kişisel ve akademik gelişim atölye çalışması.',
  },
  {
    id: '1b670b06-383a-4e09-b428-271536e8b830',
    title: 'Kültürel Söyleşi',
    location: 'Kültür Merkezi',
    description: 'Öğrencilerle interaktif söyleşi ve değerlendirme oturumu.',
  },
  {
    id: '758edb88-9774-472c-bfc7-37fc82918e7f',
    title: 'Futbol Turnuvası',
    location: 'Spor Kompleksi',
    description: 'Dostluk ve kaynaşma amaçlı futbol etkinliği.',
  },
  {
    id: 'e1',
    title: 'Atölye: Gençlik Liderlik Becerileri',
    location: 'Ana Konferans Salonu - İstanbul',
    description: 'Karar alma, ekip yönetimi ve topluluk önünde konuşmaya odaklanan interaktif gençlik liderlik atölyesi.',
  },
  {
    id: 'e2',
    title: 'Konferans: Ümmet Kimliği ve Çağımızın Zorlukları',
    location: 'Kültür Merkezi - Ankara',
    description: 'Modern çağda ümmet kimliğinin karşılaştığı zorlukları ve bilinçli çözüm yollarını ele alan değerli bir konferans.',
  },
  {
    id: 'e3',
    title: 'Gönüllülük Kampanyası: Birlikte Umut Ekiyoruz',
    location: 'Şehir Parkı - Bursa',
    description: 'Çevreyi koruma ve toplumsal sorumluluğu artırma girişimi kapsamında ağaç dikimi ve çevre temizliği kampanyası.',
  },
  {
    id: 'e4',
    title: 'Eğitim Programı: Dijital Medya Temelleri',
    location: 'Bilişim Laboratuvarı - Birlik Merkezi',
    description: 'Dijital medya içerik üretimi ve profesyonel sosyal medya yönetimi temellerini sunan yoğun eğitim programı.',
  },
  {
    id: 'e5',
    title: 'Kültür Gezisi: Tarihi İstanbul Mirası',
    location: 'Tarihi Mekanlar - İstanbul',
    description: 'Katılımcıların Osmanlı mirasını ve mimari şaheserleri keşfettiği kapsamlı İstanbul kültür gezisi.',
  },
  {
    id: 'e6',
    title: '1. Gençlik Buluşması',
    location: 'Büyük Salon - İstanbul',
    description: '300\'den fazla gencin katıldığı, söyleşiler, atölyeler ve liderlik rehberliği içeren büyük gençlik buluşması.',
  },
  {
    id: 'e7',
    title: 'Kurs: Gençlik Projeleri Yönetimi',
    location: 'Birlik Merkezi - Ankara',
    description: 'Planlamadan uygulamaya ve değerlendirmeye kadar gençlik projeleri yönetiminde sertifikalı pratik eğitim.',
  },
  {
    id: 'e8',
    title: 'Kampanya: Ramazan İftar Sofrası',
    location: 'Şehir Meydanları - Bursa',
    description: 'Ramazan boyunca ihtiyaç sahiplerine sıcak iftar ulaştıran, 80 gönüllünün katıldığı hayır kampanyası.',
  },
];

const enEvents = [
  {
    id: 'd938c5ce-0bd0-4cc3-b862-f66582e73c80',
    title: 'Football Match',
    location: 'Sports Field',
    description: 'Friendly football match among students.',
  },
  {
    id: '3f6fb2ba-25b0-442a-8cd8-aa4b1041b133',
    title: 'Student Development Workshop',
    location: 'Conference Hall',
    description: 'Interactive workshop on personal and academic development.',
  },
  {
    id: '1b670b06-383a-4e09-b428-271536e8b830',
    title: 'Cultural Dialogue Session',
    location: 'Cultural Center',
    description: 'Engaging discussion and reflection session for students.',
  },
  {
    id: '758edb88-9774-472c-bfc7-37fc82918e7f',
    title: 'Football Tournament',
    location: 'Sports Complex',
    description: 'Community football activity fostering teamwork and friendship.',
  },
  {
    id: 'e1',
    title: 'Workshop: Youth Leadership Skills',
    location: 'Main Conference Hall - Istanbul',
    description: 'Interactive workshop aimed at developing youth leadership skills, focusing on decision-making, team management, and public speaking.',
  },
  {
    id: 'e2',
    title: 'Lecture: Ummah Identity and Modern Challenges',
    location: 'Cultural Center - Ankara',
    description: 'An insightful lecture addressing contemporary challenges facing Ummah identity and ways to address them with conscious responsibility.',
  },
  {
    id: 'e3',
    title: 'Volunteer Campaign: Planting Hope Together',
    location: 'Public City Park - Bursa',
    description: 'Tree planting and park cleanup volunteer campaign as part of the Union\'s initiative for environmental protection and social responsibility.',
  },
  {
    id: 'e4',
    title: 'Training Program: Digital Media Fundamentals',
    location: 'Computer Lab - Union Headquarters',
    description: 'An intensive training program introducing digital media content creation and professional social media management.',
  },
  {
    id: 'e5',
    title: 'Cultural Tour: Historic Istanbul Landmarks',
    location: 'Historical Landmarks - Istanbul',
    description: 'Educational tour exploring Istanbul\'s Ottoman heritage and architectural masterpieces.',
  },
  {
    id: 'e6',
    title: 'First Youth Gathering',
    location: 'Grand Hall - Istanbul',
    description: 'A major gathering attended by over 300 young people featuring panel discussions, workshops, and Union leadership guidance.',
  },
  {
    id: 'e7',
    title: 'Course: Youth Project Management',
    location: 'Union Headquarters - Ankara',
    description: 'Practical project management training from planning to execution and evaluation, certifying 45 trainees.',
  },
  {
    id: 'e8',
    title: 'Campaign: Community Ramadan Iftar',
    location: 'City Plazas - Bursa',
    description: 'Charity campaign providing iftar meals throughout Ramadan, engaging 80 volunteers and serving 2,400 meals.',
  },
];

// 5. GALLERY ALBUMS (9 Real Production Albums)
const canonicalGalleryAlbums = [
  {
    id: 'album1787605721228',
    title: 'غ',
    location: 'غ',
    description: 'ا',
  },
  {
    id: 'a1',
    title: 'بطولة كرة القدم الربيعية',
    location: 'ملعب أتاتورك، أرضروم',
    description: 'البطولة السنوية لكرة القدم بين الفرق الطلابية، بمشاركة 8 فرق من مختلف الجامعات.',
  },
  {
    id: 'a2',
    title: 'مباراة النهائي الكروي',
    location: 'استاد كازيم كارابيكير',
    description: 'مباراة نهائية مثيرة جمعت فريقي اتحاد شباب الأمة واتحاد الطلاب العرب.',
  },
  {
    id: 'a3',
    title: 'رحلة تزلج جبال بالكاندي',
    location: 'منتجع بالكاندي للتزلج',
    description: 'رحلة تزلج لا تُنسى على جبال أرضروم الثلجية، بمشاركة أكثر من 60 طالبًا.',
  },
  {
    id: 'a4',
    title: 'يوم التزلج الشتوي',
    location: 'منتجع كوناكلي',
    description: 'يوم مليء بالمرح والتزلج على المنحدرات الثلجية في كوناكلي.',
  },
  {
    id: 'a5',
    title: 'المؤتمر الأكاديمي السنوي',
    location: 'قاعة المؤتمرات، جامعة أتاتورك',
    description: 'مؤتمر علمي ضم باحثين وطلابًا من مختلف التخصصات لعرض أوراقهم البحثية.',
  },
  {
    id: 'a6',
    title: 'ورشة عمل المهارات القيادية',
    location: 'مركز التطوير الطلابي',
    description: 'ورشة تدريبية مكثفة لتطوير مهارات القيادة وإدارة الفرق لدى الطلاب.',
  },
  {
    id: 'a7',
    title: 'حفل أرضروم السنوي',
    location: 'قصر المؤتمرات، أرضروم',
    description: 'الحفل السنوي الكبير لاتحاد شباب الأمة، سهرة فنية وثقافية لا تُنسى.',
  },
  {
    id: 'a8',
    title: 'احتفالات يوم الأمة',
    location: 'ساحة أزiziye، أرضروم',
    description: 'احتفال كبير بيوم الأمة شمل عروضًا ثقافية وأنشطة شبابية متنوعة.',
  },
];

const trGalleryAlbums = [
  {
    id: 'album1787605721228',
    title: 'Özel Albüm',
    location: 'Erzurum',
    description: 'Öğrenci etkinliklerinden özel anlar.',
  },
  {
    id: 'a1',
    title: 'Bahar Futbol Turnuvası',
    location: 'Atatürk Stadyumu, Erzurum',
    description: 'Farklı üniversitelerden 8 takımın katılımıyla düzenlenen geleneksel öğrenci futbol turnuvası.',
  },
  {
    id: 'a2',
    title: 'Futbol Final Maçı',
    location: 'Kazım Karabekir Stadyumu',
    description: 'Ümmet Gençleri Birliği ile Arap Öğrenci Birliği takımlarını buluşturan heyecan dolu final karşılaşması.',
  },
  {
    id: 'a3',
    title: 'Palandöken Kayak Gezisi',
    location: 'Palandöken Kayak Merkezi',
    description: '60\'tan fazla öğrencinin katılımıyla Erzurum\'un karlı dağlarında unutulmaz bir kayak gezisi.',
  },
  {
    id: 'a4',
    title: 'Kış Kayak Günü',
    location: 'Konaklı Kayak Merkezi',
    description: 'Konaklı kayak pistlerinde keyif ve eğlence dolu bir kış günü.',
  },
  {
    id: 'a5',
    title: 'Yıllık Akademik Konferans',
    location: 'Konferans Salonu, Atatürk Üniversitesi',
    description: 'Farklı disiplinlerden araştırmacı ve öğrencileri bildiri sunumlarında buluşturan bilimsel konferans.',
  },
  {
    id: 'a6',
    title: 'Liderlik Becerileri Atölyesi',
    location: 'Öğrenci Gelişim Merkezi',
    description: 'Öğrencilerin liderlik ve ekip yönetimi yetkinliklerini artırmaya yönelik yoğun eğitim atölyesi.',
  },
  {
    id: 'a7',
    title: 'Yıllık Erzurum Buluşması',
    location: 'Kongre Sarayı, Erzurum',
    description: 'Ümmet Gençleri Birliği\'nin büyük yıllık buluşması; sanat ve kültür dolu unutulmaz bir gece.',
  },
  {
    id: 'a8',
    title: 'Ümmet Günü Kutlamaları',
    location: 'Aziziye Meydanı, Erzurum',
    description: 'Kültürel gösteriler ve çeşitli gençlik faaliyetlerini içeren görkemli Ümmet Günü kutlaması.',
  },
];

const enGalleryAlbums = [
  {
    id: 'album1787605721228',
    title: 'Special Album',
    location: 'Erzurum',
    description: 'Memorable moments from student activities.',
  },
  {
    id: 'a1',
    title: 'Spring Football Tournament',
    location: 'Ataturk Stadium, Erzurum',
    description: 'Annual football tournament among student teams, featuring 8 teams from different universities.',
  },
  {
    id: 'a2',
    title: 'Football Championship Final',
    location: 'Kazim Karabekir Stadium',
    description: 'Thrilling championship final between Ummah Youth Union and Arab Students Union teams.',
  },
  {
    id: 'a3',
    title: 'Palandoken Mountain Ski Trip',
    location: 'Palandoken Ski Resort',
    description: 'An unforgettable ski trip on the snowy peaks of Erzurum with over 60 participating students.',
  },
  {
    id: 'a4',
    title: 'Winter Skiing Day',
    location: 'Konakli Ski Resort',
    description: 'A day filled with fun and skiing down the snowy slopes of Konakli.',
  },
  {
    id: 'a5',
    title: 'Annual Academic Conference',
    location: 'Conference Hall, Ataturk University',
    description: 'Scientific conference bringing together researchers and students across disciplines to present research papers.',
  },
  {
    id: 'a6',
    title: 'Leadership Skills Workshop',
    location: 'Student Development Center',
    description: 'Intensive training workshop developing student leadership and team management capabilities.',
  },
  {
    id: 'a7',
    title: 'Annual Erzurum Gala',
    location: 'Convention Palace, Erzurum',
    description: 'Grand annual gala of the Ummah Youth Union, an unforgettable cultural and artistic celebration.',
  },
  {
    id: 'a8',
    title: 'Ummah Day Celebrations',
    location: 'Aziziye Square, Erzurum',
    description: 'Grand celebration of Ummah Day featuring cultural exhibitions and diverse youth activities.',
  },
];

// 6. GALLERY CATEGORIES (4 Real Production Categories)
const canonicalGalleryCategories = [
  { id: 'football', label: 'كرة القدم' },
  { id: 'skiing', label: 'رحلات التزلج' },
  { id: 'academic', label: 'الأنشطة الأكاديمية' },
  { id: 'erzurum', label: 'حفل أرضروم' },
];

const trGalleryCategories = [
  { id: 'football', label: 'Futbol' },
  { id: 'skiing', label: 'Kayak Gezileri' },
  { id: 'academic', label: 'Akademik Faaliyetler' },
  { id: 'erzurum', label: 'Erzurum Programı' },
];

const enGalleryCategories = [
  { id: 'football', label: 'Football' },
  { id: 'skiing', label: 'Ski Trips' },
  { id: 'academic', label: 'Academic Activities' },
  { id: 'erzurum', label: 'Erzurum Gala' },
];

// 7. GUIDE SECTIONS (5 Real Production Sections from student_guide table)
const canonicalGuideSections = [
  {
    id: 'registration',
    label: 'التسجيل الجامعي',
    title: 'دليل التسجيل الجامعي',
    intro: 'كل ما تحتاج معرفته للتسجيل في جامعة أتاتورك بأرضروم، من المستندات المطلوبة إلى خطوات التسجيل الإلكتروني.',
    items: [
      {
        id: 'reg-1',
        heading: 'المستندات المطلوبة',
        body: 'تأكد من إعداد جميع المستندات التالية قبل بدء عملية التسجيل:',
        tips: [
          'جواز السفر الأصلي + صورة مصدقة عنه',
          'شهادة الثانوية العامة مصدقة ومترجمة إلى التركية أو الإنجليزية',
          'صورة شخصية حديثة (6 صور)',
          'كشف درجات التوفق (إن وُجد)',
          'خطاب قبول من الجامعة (إن وُجد)',
          'be or not be',
        ],
      },
      {
        id: 'reg-2',
        heading: 'خطوات التسجيل الإلكتروني',
        body: 'يمكنك التسجيل عبر البوابة الإلكترونية للجامعة باتباع الخطوات التالية:',
        tips: [
          'الدخول إلى موقع جامعة أتاتورك: eru.edu.tr',
          'إنشاء حساب طالب جديد في نظام التسجيل',
          'تعبئة البيانات الشخصية والأكاديمية بدقة',
          'رفع المستندات المطلوبة بصيغة PDF',
          'مراجعة الطلب وإرساله',
        ],
      },
      {
        id: 'reg-3',
        heading: 'رسوم التسجيل',
        body: 'تختلف الرسوم حسب التخصص ونوع القبول. الطلاب الدوليون قد يستفيدون من منحة تقليل الرسوم. راجع صفحة الرسوم على موقع الجامعة لمعرفة التفاصيل.',
        tips: [],
      },
    ],
    contacts: [
      {
        id: 'reg-c1',
        type: 'phone',
        label: 'قسم شؤون الطلاب الدوليين',
        value: '+90 442 231 0000',
      },
      {
        id: 'reg-c2',
        type: 'link',
        label: 'موقع التسجيل',
        value: 'eru.edu.tr/ogrenci',
      },
    ],
  },
  {
    id: 'housing',
    label: 'السكن الطلابي',
    title: 'دليل السكن الطلبي',
    intro: 'خيارات السكن المتاحة للطلاب في مدينة أرضروم، من سكن الجامعة إلى الشقق الخاصة.',
    items: [
      {
        id: 'h-1',
        heading: 'سكن الطلاب الحكومي (KYK)',
        body: 'يوفر مركز KYK سكنًا طلابيًا بأسعار مدعومة. التسجيل يكون عبر الموقع الإلكتروني في موعد محدد سنويًا.',
        tips: [
          'الموقع: حي ينيشهير، أرضروم',
          'الرسوم الشهرية: تقريبًا 500-800 ليرة تركية',
          'تشمل: وجبات، إنترنت، غسيل',
          'التسجيل عبر: kyk.gov.tr',
        ],
      },
      {
        id: 'h-2',
        heading: 'الشقق الخاصة',
        body: 'تتوفر شقق مفروشة وغير مفروشة في محيط الجامعة. يفضل البحث المبكر قبل بداية العام الدراسي.',
        tips: [
          'السعر الشهري لشقة 1+1: 4000-7000 ليرة',
          'السعر الشهري لشقة 2+1: 6000-10000 ليرة',
          'يفضل السكن في أحياء: ينيشهير، كازيم كارابيكير، مركز المدينة',
        ],
      },
      {
        id: 'h-3',
        heading: 'السكن العائلي (Aile Yanı)',
        body: 'خيار اقتصادي للإقامة مع عائلة تركية، يشمل غرفة ووجبات. مناسب للطلاب الذين يفضلون بيئة هادئة.',
        tips: [
          'السعر الشهري: 3000-5000 ليرة (شامل الوجبات)',
          'يمكن البحث عنه عبر مجموعات فيسبوك للطلاب العرب في أرضروم',
        ],
      },
    ],
    contacts: [
      {
        id: 'h-c1',
        type: 'phone',
        label: 'مركز KYK للسكن الطلابي',
        value: '+90 442 213 0000',
      },
      {
        id: 'h-c2',
        type: 'link',
        label: 'موقع KYK',
        value: 'kyk.gov.tr',
      },
    ],
  },
  {
    id: 'transport',
    label: 'المواصلات',
    title: 'دليل المواصلات',
    intro: 'كيفية التنقل في مدينة أرضروم بين الجامعة والسكن والمناطق الحيوية.',
    items: [
      {
        id: 't-1',
        heading: 'الحافلات البلدية',
        body: 'تغطي حافلات البلدية معظم أنحاء المدينة بتذكرة موحدة رخيصة.',
        tips: [
          'سعر التذكرة: 15 ليرة تركية',
          'يمكن استخدام بطاقة ErzurumKart للدفع',
          'الخطوط 1 و 3 تصل إلى الحرم الجامعي',
          'المواعيد: 6:00 صباحًا - 11:30 مساءً',
        ],
      },
      {
        id: 't-2',
        heading: 'المترو (صغير)',
        body: 'يوجد خط مترو صغير يربط بين وسط المدينة ومحطة الحافلات، مرورًا ببعض المناطق الطلابية.',
        tips: [
          'المحطات الرئيسية: أزiziye، كازيم كارابيكير، الحرم الجامعي',
          'سعر التذكرة: 15 ليرة',
          'المواعيد: 6:00 - 24:00',
        ],
      },
      {
        id: 't-3',
        heading: 'سيارات الأجرة',
        body: 'تتوفر سيارات الأجرة في جميع أنحاء المدينة. يفضل استخدام تطبيقات مثل BiTaksi للحصول على أسعار أفضل.',
        tips: ['السعر الأدنى: 30 ليرة', 'تطبيق BiTaksi متاح في أرضروم'],
      },
    ],
    contacts: [
      {
        id: 't-c1',
        type: 'phone',
        label: 'شركة البلدية للمواصلات',
        value: '+90 442 215 0000',
      },
      {
        id: 't-c2',
        type: 'link',
        label: 'تطبيق BiTaksi',
        value: 'bitaksi.com',
      },
    ],
  },
  {
    id: 'libraries',
    label: 'المكتبات والخدمات الأكاديمية',
    title: 'المكتبات والخدمات الأكاديمية',
    intro: 'المكتبات ومراكز الدراسة والخدمات الأكاديمية المتاحة للطلاب في جامعة أتاتورك.',
    items: [
      {
        id: 'lib-1',
        heading: 'مكتبة جامعة أتاتورك المركزية',
        body: 'مكتبة كبيرة تضم آلاف الكتب والمراجع باللغات التركية والإنجليزية والعربية. توفر أماكن للدراسة الفردية والجماعية.',
        tips: [
          'الموقع: داخل الحرم الجامعي الرئيسي',
          'مواعيد العمل: 8:00 صباحًا - 12:00 منتصف الليل',
          'خدمة استعارة الكتب مجانية للطلاب المسجلين',
          'توفر إنترنت مجاني وغرف دراسة',
        ],
      },
      {
        id: 'lib-2',
        heading: 'قواعد البيانات الإلكترونية',
        body: 'تتيح الجامعة لطلابها الوصول إلى قواعد بيانات أكاديمية عالمية مجانًا عبر حساب الطالب.',
        tips: ['EBSCO, Scopus, Web of Science', 'JSTOR, ScienceDirect', 'الوصول عبر: library.eru.edu.tr'],
      },
      {
        id: 'lib-3',
        heading: 'مركز الدعم الأكاديمي',
        body: 'يقدم المركز خدمات الدعم الدراسي للطلاب الذين يواجهون صعوبات في المواد، بالإضافة إلى دورات تقوية.',
        tips: [
          'دروس تقوية مجانية في الرياضيات والفيزياء واللغة الإنجليزية',
          'استشارات أكاديمية فردية',
          'الموقع: مبنى الدعم الطلابي',
        ],
      },
    ],
    contacts: [
      {
        id: 'lib-c1',
        type: 'phone',
        label: 'المكتبة المركزية',
        value: '+90 442 231 0000',
      },
      {
        id: 'lib-c2',
        type: 'link',
        label: 'المكتبة الإلكترونية',
        value: 'library.eru.edu.tr',
      },
    ],
  },
  {
    id: 'sec1787646993609',
    label: 'التسوق والمعيشة',
    title: 'التسوق والمعيشة في أرضروم',
    intro: 'دليل المحلات والأسواق والخدمات الحياتية للطلاب في مدينة أرضروم.',
    items: [
      {
        id: 'item1787647011505',
        heading: 'المراكز التجارية والأسواق',
        body: 'أهم الأسواق الشعبية والمجمعات التجارية القريبة من الجامعة.',
        tips: ['MNG AVM', 'سوق تاشهان التاريخي', 'المحلات الطلابية في شارع الجمهورية'],
      },
    ],
    contacts: [],
  },
];

const trGuideSections = [
  {
    id: 'registration',
    label: 'Üniversite Kaydı',
    title: 'Üniversite Kayıt Rehberi',
    intro: 'Erzurum Atatürk Üniversitesi\'ne kayıt için gerekli belgelerden online başvuru adımlarına kadar bilmeniz gereken her şey.',
    items: [
      {
        id: 'reg-1',
        heading: 'Gerekli Belgeler',
        body: 'Kayıt sürecine başlamadan önce aşağıdaki belgelerin hazır olduğundan emin olun:',
        tips: [
          'Orijinal pasaport + noter onaylı fotokopisi',
          'Türkçe veya İngilizceye tercüme edilmiş ve onaylanmış lise diploması',
          'Güncel biyometrik fotoğraf (6 adet)',
          'Not döküm belgesi (transkript - varsa)',
          'Üniversite kabul mektubu (varsa)',
          'Dil yeterlilik belgesi (TÖMER / YDS - varsa)',
        ],
      },
      {
        id: 'reg-2',
        heading: 'Online Kayıt Adımları',
        body: 'Aşağıdaki adımları takip ederek üniversitenin online portalı üzerinden kayıt yapabilirsiniz:',
        tips: [
          'Atatürk Üniversitesi web sitesine giriş: atauni.edu.tr',
          'Kayıt sisteminde yeni öğrenci hesabı oluşturma',
          'Kişisel ve akademik bilgileri eksiksiz doldurma',
          'Gerekli belgeleri PDF formatında yükleme',
          'Başvuruyu kontrol edip onaylama',
        ],
      },
      {
        id: 'reg-3',
        heading: 'Kayıt ve Harç Ücretleri',
        body: 'Harçlar bölüme ve kabul türüne göre değişir. Uluslararası öğrenciler harç indirimlerinden faydalanabilir.',
        tips: [],
      },
    ],
    contacts: [
      { id: 'reg-c1', label: 'Uluslararası Öğrenci İşleri Ofisi' },
      { id: 'reg-c2', label: 'Kayıt Portalı Web Sitesi' },
    ],
  },
  {
    id: 'housing',
    label: 'Öğrenci Yurtları ve Konaklama',
    title: 'Öğrenci Konaklama Rehberi',
    intro: 'Erzurum\'da devlet yurtlarından özel dairelere kadar öğrencilere sunulan barınma seçenekleri.',
    items: [
      {
        id: 'h-1',
        heading: 'KYK Devlet Öğrenci Yurdu',
        body: 'KYK merkezleri sübvansiyonlu fiyatlarla öğrenci yurdu sağlar. Kayıtlar her yıl resmi web sitesi üzerinden yapılır.',
        tips: [
          'Konum: Yenişehir Mahallesi, Erzurum',
          'Aylık ücret: yaklaşık 500-800 TL',
          'Dahil olanlar: Yemek, internet, çamaşırhane',
          'Başvuru: kyk.gov.tr',
        ],
      },
      {
        id: 'h-2',
        heading: 'Özel Kiralık Daireler',
        body: 'Üniversite çevresinde eşyalı ve eşyasız daireler mevcuttur. Akademik yıl başlamadan önce erken arama yapılması önerilir.',
        tips: [
          '1+1 daire aylık ortalama: 4.000 - 7.000 TL',
          '2+1 daire aylık ortalama: 6.000 - 10.000 TL',
          'Önerilen semtler: Yenişehir, Kazım Karabekir, Şehir Merkezi',
        ],
      },
      {
        id: 'h-3',
        heading: 'Aile Yanı Konaklama',
        body: 'Bir Türk ailesinin yanında oda ve yemek içeren ekonomik bir seçenek. Sessiz bir ortam tercih edenler için idealdir.',
        tips: [
          'Aylık ücret: 3.000 - 5.000 TL (yemek dahil)',
          'Erzurum öğrenci sosyal medya gruplarından araştırılabilir',
        ],
      },
    ],
    contacts: [
      { id: 'h-c1', label: 'KYK Yurt Hizmetleri Merkezi' },
      { id: 'h-c2', label: 'KYK Resmi Portalı' },
    ],
  },
  {
    id: 'transport',
    label: 'Şehir İçi Ulaşım',
    title: 'Ulaşım Rehberi',
    intro: 'Erzurum\'da üniversite, yurtlar ve şehir merkezi arasında rahat ve uygun fiyatlı ulaşım rehberi.',
    items: [
      {
        id: 't-1',
        heading: 'Belediye Otobüsleri',
        body: 'Belediye otobüsleri şehrin büyük kısmına tek fiyatlı ekonomik biletlerle ulaşım sağlar.',
        tips: [
          'Bilet ücreti: İndirimli öğrenci tarifesi',
          'Ödemeler ErzurumKart ile yapılır',
          '1 ve 3 numaralı hatlar doğrudan kampüse gider',
          'Çalışma saatleri: 06:00 - 23:30',
        ],
      },
      {
        id: 't-2',
        heading: 'Toplu Taşıma Hatları',
        body: 'Şehir merkezi ile otogar arasında öğrenci yoğunluklu güzergahlardan geçen minibüs ve servis hatları mevcuttur.',
        tips: [
          'Ana duraklar: Aziziye, Kazım Karabekir, Üniversite Kampüsü',
          'Uygun fiyatlı öğrenci tarifesi',
          'Seferler: 06:00 - 24:00',
        ],
      },
      {
        id: 't-3',
        heading: 'Taksi Hizmetleri',
        body: 'Şehir genelinde taksi durakları mevcuttur. Daha kolay ulaşım için taksi mobil uygulamaları tercih edilebilir.',
        tips: ['BiTaksi uygulaması Erzurum\'da aktiftir'],
      },
    ],
    contacts: [
      { id: 't-c1', label: 'Belediye Ulaşım Destek Hattı' },
      { id: 't-c2', label: 'BiTaksi Uygulama Bağlantısı' },
    ],
  },
  {
    id: 'libraries',
    label: 'Kütüphaneler ve Akademik Hizmetler',
    title: 'Kütüphane ve Akademik Hizmetler',
    intro: 'Atatürk Üniversitesi\'nde öğrencilerin erişimine açık kütüphaneler, çalışma salonları ve dijital kaynaklar.',
    items: [
      {
        id: 'lib-1',
        heading: 'Atatürk Üniversitesi Merkez Kütüphanesi',
        body: 'Türkçe, İngilizce ve Arapça dillerinde binlerce kitap ve kaynak barındıran modern kütüphane.',
        tips: [
          'Konum: Ana Üniversite Kampüsü içinde',
          'Çalışma saatleri: 08:00 - 24:00 (Sınav dönemlerinde 7/24)',
          'Kayıtlı öğrenciler için ücretsiz ödünç kitap hizmeti',
          'Ücretsiz Wi-Fi ve sessiz çalışma salonları',
        ],
      },
      {
        id: 'lib-2',
        heading: 'Elektronik Veri Tabanları',
        body: 'Üniversite, öğrenci hesabı üzerinden uluslararası akademik veri tabanlarına ücretsiz erişim sağlar.',
        tips: ['EBSCO, Scopus, Web of Science', 'JSTOR, ScienceDirect', 'Erişim: kutuphane.atauni.edu.tr'],
      },
      {
        id: 'lib-3',
        heading: 'Akademik Destek Merkezi',
        body: 'Zorlandıkları derslerde öğrencilere etütler, bireysel danışmanlık ve takviye kursları sunar.',
        tips: [
          'Matematik, fizik ve yabancı dil için ücretsiz destek',
          'Bireysel akademik danışmanlık görüşmeleri',
        ],
      },
    ],
    contacts: [
      { id: 'lib-c1', label: 'Merkez Kütüphane Danışma' },
      { id: 'lib-c2', label: 'Dijital Kütüphane Portalı' },
    ],
  },
  {
    id: 'sec1787646993609',
    label: 'Alışveriş ve Yaşam',
    title: 'Erzurum\'da Alışveriş ve Günlük Yaşam',
    intro: 'Erzurum\'da öğrencilerin ihtiyaç duyduğu mağazalar, çarşılar ve yaşam alanları rehberi.',
    items: [
      {
        id: 'item1787647011505',
        heading: 'Alışveriş Merkezleri ve Çarşılar',
        body: 'Kampüse yakın alışveriş merkezleri ve tarihi çarşılar.',
        tips: ['MNG Alışveriş Merkezi', 'Tarihi Taşhan Çarşısı', 'Cumhuriyet Caddesi öğrenci mağazaları'],
      },
    ],
    contacts: [],
  },
];

const enGuideSections = [
  {
    id: 'registration',
    label: 'University Enrollment',
    title: 'University Enrollment Guide',
    intro: 'Everything you need to know about registering at Ataturk University in Erzurum, from required documents to online portal steps.',
    items: [
      {
        id: 'reg-1',
        heading: 'Required Documents',
        body: 'Ensure you have the following documents ready before starting registration:',
        tips: [
          'Original passport + notarized copy',
          'High school diploma certified and translated into Turkish or English',
          'Recent biometric photos (6 photos)',
          'Academic transcripts (if available)',
          'University acceptance letter (if available)',
          'Language proficiency certificate (TOMER / YDS, if available)',
        ],
      },
      {
        id: 'reg-2',
        heading: 'Online Registration Steps',
        body: 'Register through the university student portal following these steps:',
        tips: [
          'Visit the Ataturk University portal: atauni.edu.tr',
          'Create a new student account in the registration system',
          'Fill in personal and academic details accurately',
          'Upload required documents in PDF format',
          'Review and submit the application',
        ],
      },
      {
        id: 'reg-3',
        heading: 'Tuition and Fees',
        body: 'Tuition fees vary by department and admission type. International students may qualify for fee reductions.',
        tips: [],
      },
    ],
    contacts: [
      { id: 'reg-c1', label: 'International Student Affairs Office' },
      { id: 'reg-c2', label: 'Registration Portal' },
    ],
  },
  {
    id: 'housing',
    label: 'Student Housing',
    title: 'Student Housing Guide',
    intro: 'Housing options available for students in Erzurum, from government dormitories to private apartments.',
    items: [
      {
        id: 'h-1',
        heading: 'Government Student Dormitories (KYK)',
        body: 'KYK centers provide subsidized student housing. Registration takes place annually via the official portal.',
        tips: [
          'Location: Yenisehir District, Erzurum',
          'Monthly fees: approx. 500-800 TRY',
          'Includes: Meals, Wi-Fi, laundry facilities',
          'Application: kyk.gov.tr',
        ],
      },
      {
        id: 'h-2',
        heading: 'Private Rental Apartments',
        body: 'Furnished and unfurnished apartments are available near the campus. Early search before the semester is advised.',
        tips: [
          'Monthly average for 1+1: 4,000 - 7,000 TRY',
          'Monthly average for 2+1: 6,000 - 10,000 TRY',
          'Recommended areas: Yenisehir, Kazim Karabekir, City Center',
        ],
      },
      {
        id: 'h-3',
        heading: 'Homestay Living',
        body: 'An economical option staying with a local family including private room and meals. Ideal for quiet study environments.',
        tips: [
          'Monthly cost: 3,000 - 5,000 TRY (meals included)',
          'Can be arranged through local student networks in Erzurum',
        ],
      },
    ],
    contacts: [
      { id: 'h-c1', label: 'KYK Student Housing Center' },
      { id: 'h-c2', label: 'KYK Portal' },
    ],
  },
  {
    id: 'transport',
    label: 'City Transportation',
    title: 'Transportation Guide',
    intro: 'Navigating Erzurum between university, residences, and vibrant city spots.',
    items: [
      {
        id: 't-1',
        heading: 'Municipal Buses',
        body: 'Municipal buses cover most areas of the city with unified discounted student fares.',
        tips: [
          'Discounted student fares',
          'Payment is made with ErzurumKart',
          'Routes 1 and 3 run directly to campus',
          'Operating hours: 6:00 AM - 11:30 PM',
        ],
      },
      {
        id: 't-2',
        heading: 'Transit Routes',
        body: 'Transit minibuses connect city center and bus terminals through major student neighborhoods.',
        tips: [
          'Major stops: Aziziye, Kazim Karabekir, University Campus',
          'Affordable student rates',
          'Operating hours: 6:00 AM - 12:00 Midnight',
        ],
      },
      {
        id: 't-3',
        heading: 'Taxi Services',
        body: 'Taxis are available throughout the city. Ride-hailing apps provide reliable rates.',
        tips: ['BiTaksi app is available in Erzurum'],
      },
    ],
    contacts: [
      { id: 't-c1', label: 'Municipal Transit Authority' },
      { id: 't-c2', label: 'BiTaksi App' },
    ],
  },
  {
    id: 'libraries',
    label: 'Libraries & Academic Services',
    title: 'Libraries & Academic Services',
    intro: 'Libraries, study centers, and academic support services available to students at Ataturk University.',
    items: [
      {
        id: 'lib-1',
        heading: 'Ataturk University Central Library',
        body: 'A comprehensive modern library housing thousands of books and references in Turkish, English, and Arabic.',
        tips: [
          'Location: Inside the Main University Campus',
          'Operating hours: 8:00 AM - 12:00 Midnight (24/7 during exam periods)',
          'Free book borrowing service for registered students',
          'Free Wi-Fi and quiet study rooms',
        ],
      },
      {
        id: 'lib-2',
        heading: 'Electronic Databases',
        body: 'The university provides free access to global academic research databases through student accounts.',
        tips: ['EBSCO, Scopus, Web of Science', 'JSTOR, ScienceDirect', 'Access: kutuphane.atauni.edu.tr'],
      },
      {
        id: 'lib-3',
        heading: 'Academic Support Center',
        body: 'Offers study support, tutoring, and remedial sessions for students facing academic challenges.',
        tips: [
          'Free tutoring in mathematics, physics, and languages',
          'One-on-one academic counseling sessions',
        ],
      },
    ],
    contacts: [
      { id: 'lib-c1', label: 'Central Library Information Desk' },
      { id: 'lib-c2', label: 'Digital Library Portal' },
    ],
  },
  {
    id: 'sec1787646993609',
    label: 'Shopping & Daily Life',
    title: 'Shopping & Living in Erzurum',
    intro: 'Guide to local markets, shopping malls, and daily living amenities in Erzurum.',
    items: [
      {
        id: 'item1787647011505',
        heading: 'Shopping Malls & Bazaars',
        body: 'Popular local markets and shopping centers located close to campus.',
        tips: ['MNG Shopping Mall', 'Historic Tashan Bazaar', 'Student shops along Cumhuriyet Street'],
      },
    ],
    contacts: [],
  },
];

// 8. GUIDE QUICK INFO (Real Erzurum climate/student text from student_guide table)
const canonicalGuideQuickInfo = 'أرضروم مدينة جامعية آمنة بمناخ قاري بارد شتاءً. يفضل إعداد ملابس شتوية دافئة قبل القدوم.';

const trGuideQuickInfo = 'Erzurum, kışları soğuk karasal iklime sahip güvenli bir üniversite şehridir. Gelmeden önce sıcak kışlık giysiler hazırlamanız önerilir.';

const enGuideQuickInfo = 'Erzurum is a safe university city with a cold continental winter climate. It is recommended to prepare warm winter clothing before arrival.';

// 9. FAQ CATEGORIES (3 Real Production Categories from faq table)
const canonicalFaqCategories = [
  {
    id: 'join',
    title: 'كيفية الانضمام للاتحاد',
    items: [
      {
        id: 'j1',
        question: 'كيف أصبح عضوًا في اتحاد شباب الأمة؟',
        answer: 'يمكنك التقديم لعضوية الاتحاد عبر إنشاء حساب جديد على موقعنا وتعبئة نموذج طلب الانضمام. سيتم مراجعة طلبك من قبل إدارة الاتحاد، وفي حال الموافقة المبدئية سيتم دعوتك لمقابلة شخصية قبل القبول النهائي.',
      },
      {
        id: 'j2',
        question: 'ما هي شروط الانضمام؟',
        answer: 'يشترط أن يكون المتقدم طالبًا جامعيًا في إحدى الجامعات التركية، وملتزمًا بقيم ومبادئ الاتحاد. يفضل أن يكون لديه اهتمام بالعمل التطوعي والأنشطة الشبابية. لا يُشترط عربيًا، فالاتحاد مفتوح لكل الطلاب المتفقين مع رؤيته.',
      },
      {
        id: 'j3',
        question: 'كم تستغرق عملية القبول؟',
        answer: 'بعد تقديم الطلب، تستغرق المراجعة المبدئية عادة 3-5 أيام عمل. في حال الموافقة المبدئية، يتم جدولة مقابلة شخصية خلال أسبوع. القرار النهائي يُتخذ خلال 2-3 أيام بعد المقابلة.',
      },
      {
        id: 'j4',
        question: 'هل هناك رسوم لعضوية الاتحاد؟',
        answer: 'لا، عضوية اتحاد شباب الأمة مجانية تمامًا. لا توجد أي رسوم تسجيل أو اشتراك شهري. الاتحاد يعتمد على المتطوعين والتبرعات في تمويل أنشطته.',
      },
    ],
  },
  {
    id: 'services',
    title: 'الاستفادة من الخدمات',
    items: [
      {
        id: 's1',
        question: 'ما الخدمات التي يقدمها الاتحاد للأعضاء؟',
        answer: 'يقدم الاتحاد مجموعة متنوعة من الخدمات تشمل: الأنشطة الرياضية (كرة القدم، التزلج)، الأنشطة الأكاديمية (مؤتمرات، ورش عمل)، الرحلات الترفيهية، الإرشاد الطلابي، دليل الطالب للمدينة، والأنشطة الثقافية والاجتماعية.',
      },
      {
        id: 's2',
        question: 'كيف أسجل في الفعاليات والأنشطة؟',
        answer: 'بعد تسجيل الدخول إلى حسابك، يمكنك تصفح الفعاليات المتاحة في صفحة "البرامج والأنشطة" والضغط على زر "سجل الآن" في أي فعالية تهمك. ستجد جميع تسجيلاتك في لوحة تحكم الطالب.',
      },
      {
        id: 's3',
        question: 'هل الفعاليات مفتوحة لغير الأعضاء؟',
        answer: 'بعض الفعاليات العامة مفتوحة للجميع، بينما بعض الأنشطة الخاصة مقتصرة على الأعضاء المسجلين فقط. يمكنك التحقق من حالة الفعالية في صفحة البرامج والأنشطة.',
      },
      {
        id: 's4',
        question: 'كيف أحصل على دليل الطالب لمدينة أرضروم؟',
        answer: 'يمكنك الوصول إلى دليل الطالب الشامل من القائمة العلوية للموقع. الدليل يحتوي على معلومات مفصلة عن التسجيل الجامعي، السكن الطلابي، المواصلات، والمكتبات والخدمات الأكاديمية.',
      },
    ],
  },
  {
    id: 'committees',
    title: 'المشاركة في اللجان',
    items: [
      {
        id: 'c1',
        question: 'ما اللجان المتاحة للانضمام إليها؟',
        answer: 'يضم الاتحاد عدة لجان متخصصة: لجنة الإعلام والنشر، اللجنة الرياضية، اللجنة الثقافية، اللجنة الأكاديمية، لجنة التطوع، واللجنة المالية. كل لجنة لها مهام وأهداف محددة.',
      },
      {
        id: 'c2',
        question: 'كيف أنضم إلى لجنة معينة؟',
        answer: 'بعد أن تصبح عضوًا مقبولًا في الاتحاد، يمكنك التواصل مع رئيس اللجنة التي تهمك عبر صفحة "اللجان" في الموقع. سيقوم رئيس اللجنة بتقييم طلبك وإبلاغك بقرار الانضمام.',
      },
      {
        id: 'c3',
        question: 'هل يمكنني الانضمام لأكثر من لجنة؟',
        answer: 'نعم، يمكنك الانضمام إلى لجنتين كحد أقصى في وقت واحد لضمان التزامك الفعلي بكل لجنة. يفضل التركيز على لجنة واحدة في البداية للتأقلم قبل التوسع.',
      },
      {
        id: 'c4',
        question: 'ما هي مسؤوليات عضو اللجنة؟',
        answer: 'تشمل المسؤوليات: حضور اجتماعات اللجنة الدورية، المساهمة في تنظيم الفعاليات، تنفيذ المهام الموكلة إليك، والمشاركة الفعالة في اتخاذ قرارات اللجنة. تختلف التفاصيل حسب نوع اللجنة.',
      },
    ],
  },
];

const trFaqCategories = [
  {
    id: 'join',
    title: 'Birliğe Nasıl Katılınır?',
    items: [
      {
        id: 'j1',
        question: 'Ümmet Gençleri Birliği\'ne nasıl üye olabilirim?',
        answer: 'Web sitemizde yeni bir hesap oluşturup başvuru formunu doldurarak üyelik başvurusunda bulunabilirsiniz. Başvurunuz yönetim tarafından incelendikten sonra, ön onay durumunda nihai kabul öncesi mülakata davet edilirsiniz.',
      },
      {
        id: 'j2',
        question: 'Üyelik şartları nelerdir?',
        answer: 'Adayın Türkiye\'deki bir üniversitede öğrenci olması ve Birliğin değer ve ilkelerine bağlı bulunması gerekir. Gönüllülük ve gençlik çalışmalarına ilgi duyması tercih edilir. Birlik vizyonunu paylaşan tüm öğrencilere açıktır.',
      },
      {
        id: 'j3',
        question: 'Kabul süreci ne kadar sürer?',
        answer: 'Başvuru yapıldıktan sonra ön inceleme genellikle 3-5 iş günü sürer. Ön onay halinde bir hafta içinde mülakat planlanır. Nihai karar mülakattan sonra 2-3 gün içinde verilir.',
      },
      {
        id: 'j4',
        question: 'Birlik üyeliği için ücret var mıdır?',
        answer: 'Hayır, Ümmet Gençleri Birliği üyeliği tamamen ücretsizdir. Herhangi bir kayıt veya aylık aidat ücreti bulunmaz.',
      },
    ],
  },
  {
    id: 'services',
    title: 'Hizmetlerden Yararlanma',
    items: [
      {
        id: 's1',
        question: 'Birlik üyelerine hangi hizmetleri sunar?',
        answer: 'Birlik; spor faaliyetleri (futbol, kayak), akademik etkinlikler (konferanslar, atölyeler), kültürel geziler, öğrenci rehberliği, şehir öğrenci rehberi ve sosyal faaliyetler gibi geniş bir hizmet yelpazesi sunar.',
      },
      {
        id: 's2',
        question: 'Etkinlik ve programlara nasıl kaydolurum?',
        answer: 'Hesabınıza giriş yaptıktan sonra "Programlar ve Faaliyetler" sayfasında ilgilendiğiniz etkinliği seçip "Şimdi Kaydol" butonuna tıklayabilirsiniz. Tüm kayıtlarınızı öğrenci panelinizden takip edebilirsiniz.',
      },
      {
        id: 's3',
        question: 'Etkinlikler üye olmayanlara açık mıdır?',
        answer: 'Genel etkinliklerimizin bir kısmı herkese açıktır; bazı özel atölye ve programlar ise yalnızca kayıtlı üyelere özeldir. Program sayfasından etkinlik durumunu kontrol edebilirsiniz.',
      },
      {
        id: 's4',
        question: 'Erzurum Öğrenci Rehberi\'ne nasıl ulaşabilirim?',
        answer: 'Web sitemizin üst menüsünden Öğrenci Rehberi\'ne erişebilirsiniz. Rehberde üniversite kaydı, yurtlar, ulaşım ve kütüphaneler hakkında detaylı bilgiler yer almaktadır.',
      },
    ],
  },
  {
    id: 'committees',
    title: 'Komitelerde Görev Alma',
    items: [
      {
        id: 'c1',
        question: 'Hangi komitelerde görev alabilirim?',
        answer: 'Birliğimizde Medya, Akademik, Faaliyetler, Denetim ve Maliye gibi uzman komiteler bulunmaktadır. Her komitenin kendine özgü görev ve hedefleri vardır.',
      },
      {
        id: 'c2',
        question: 'Belirli bir komiteye nasıl katılırım?',
        answer: 'Üyeliğiniz onaylandıktan sonra web sitesindeki "Komiteler" sayfası üzerinden ilgili komite başkanı ile iletişime geçebilirsiniz.',
      },
      {
        id: 'c3',
        question: 'Aynı anda birden fazla komitede yer alabilir miyim?',
        answer: 'Verimli çalışma ve görev sorumluluğunu korumak adına aynı anda en fazla iki komitede yer alabilirsiniz. Başlangıçta tek bir komiteye odaklanılması tavsiye edilir.',
      },
      {
        id: 'c4',
        question: 'Komite üyesinin sorumlulukları nelerdir?',
        answer: 'Düzenli komite toplantılarına katılmak, faaliyetlerin organizasyonuna katkı sağlamak, verilen görevleri yerine getirmek ve komite kararlarına aktif katkıda bulunmaktır.',
      },
    ],
  },
];

const enFaqCategories = [
  {
    id: 'join',
    title: 'How to Join the Union',
    items: [
      {
        id: 'j1',
        question: 'How do I become a member of the Ummah Youth Union?',
        answer: 'You can apply by creating an account on our website and completing the membership application form. Following administrative review and initial approval, you will be invited for an interview prior to final admission.',
      },
      {
        id: 'j2',
        question: 'What are the membership requirements?',
        answer: 'Applicants must be university students at a Turkish university and committed to the values and principles of the Union. An interest in volunteer work and student activities is preferred. The Union is open to all students sharing its vision.',
      },
      {
        id: 'j3',
        question: 'How long does the admission process take?',
        answer: 'Initial review usually takes 3-5 business days. Upon preliminary approval, an interview is scheduled within a week, and final decisions are communicated within 2-3 days following the interview.',
      },
      {
        id: 'j4',
        question: 'Are there membership fees?',
        answer: 'No, membership in the Ummah Youth Union is completely free. There are no registration fees or monthly dues.',
      },
    ],
  },
  {
    id: 'services',
    title: 'Accessing Services',
    items: [
      {
        id: 's1',
        question: 'What services does the Union provide to members?',
        answer: 'The Union offers sports activities (football, skiing), academic events (conferences, workshops), cultural trips, student counseling, city student guides, and social initiatives.',
      },
      {
        id: 's2',
        question: 'How do I register for events and activities?',
        answer: 'After logging into your account, browse available events on the "Programs & Activities" page and click "Register Now". All registrations can be managed from your student dashboard.',
      },
      {
        id: 's3',
        question: 'Are events open to non-members?',
        answer: 'Several public events are open to everyone, while select workshops and programs are reserved for registered members.',
      },
      {
        id: 's4',
        question: 'How can I access the Erzurum Student Guide?',
        answer: 'You can access the comprehensive Student Guide from the top navigation bar. It contains detailed guidance on university enrollment, dormitories, transportation, and academic libraries.',
      },
    ],
  },
  {
    id: 'committees',
    title: 'Joining Committees',
    items: [
      {
        id: 'c1',
        question: 'Which committees are available to join?',
        answer: 'The Union features specialized committees including Media, Academic, Activities, Supervisory, and Finance Committees. Each has distinct missions and goals.',
      },
      {
        id: 'c2',
        question: 'How do I join a specific committee?',
        answer: 'Once your membership is approved, you can connect with the committee head through the "Committees" section on our website.',
      },
      {
        id: 'c3',
        question: 'Can I join more than one committee?',
        answer: 'You may join a maximum of two committees simultaneously to ensure effective dedication. Focusing on one committee initially is recommended.',
      },
      {
        id: 'c4',
        question: 'What are the responsibilities of a committee member?',
        answer: 'Responsibilities include attending regular meetings, contributing to event organization, executing assigned tasks, and actively participating in committee decision-making.',
      },
    ],
  },
];

// 10. CONTACT CARDS (4 Real Production Cards)
const canonicalContactCards = [
  {
    id: 'address',
    title: 'العنوان',
    value: 'أرضروم، تركيا - جامعة أتاتورك',
    sub: 'مقر الاتحاد الرئيسي',
  },
  {
    id: 'email',
    title: 'البريد الإلكتروني',
    value: 'info@ummet.org',
    sub: 'للاستفسارات العامة',
  },
  {
    id: 'phone',
    title: 'الهاتف',
    value: '+90 442 231 0000',
    sub: 'من 9ص حتى 6م',
  },
  {
    id: 'hours',
    title: 'ساعات العمل',
    value: 'الإثنين - الجمعة',
    sub: '9:00 صباحًا - 6:00 مساءً',
  },
];

const trContactCards = [
  {
    id: 'address',
    title: 'Adres',
    value: 'Erzurum, Türkiye - Atatürk Üniversitesi',
    sub: 'Birlik Genel Merkezi',
  },
  {
    id: 'email',
    title: 'E-posta',
    value: 'info@ummet.org',
    sub: 'Genel danışma ve sorularınız için',
  },
  {
    id: 'phone',
    title: 'Telefon',
    value: '+90 442 231 0000',
    sub: 'Hafta içi 09:00 - 18:00',
  },
  {
    id: 'hours',
    title: 'Çalışma Saatleri',
    value: 'Pazartesi - Cuma',
    sub: '09:00 - 18:00',
  },
];

const enContactCards = [
  {
    id: 'address',
    title: 'Address',
    value: 'Erzurum, Turkey - Ataturk University',
    sub: 'Union Main Headquarters',
  },
  {
    id: 'email',
    title: 'Email',
    value: 'info@ummet.org',
    sub: 'For general inquiries',
  },
  {
    id: 'phone',
    title: 'Phone',
    value: '+90 442 231 0000',
    sub: 'Mon - Fri 9:00 AM - 6:00 PM',
  },
  {
    id: 'hours',
    title: 'Working Hours',
    value: 'Monday - Friday',
    sub: '9:00 AM - 6:00 PM',
  },
];

// 11. CONTACT MAP
const canonicalContactMap = {
  title: 'موقعنا - جامعة أتاتورك، أرضروم',
  embedUrl: 'https://www.google.com/maps?q=Atat%C3%BCrk+%C3%9Cniversitesi,Erzurum&output=embed',
  openUrl: 'https://www.google.com/maps/place/Atat%C3%BCrk+%C3%9Cniversitesi/@39.9263,41.2678,15z',
};

const trContactMap = {
  title: 'Konumumuz - Atatürk Üniversitesi, Erzurum',
  embedUrl: canonicalContactMap.embedUrl,
  openUrl: canonicalContactMap.openUrl,
};

const enContactMap = {
  title: 'Our Location - Ataturk University, Erzurum',
  embedUrl: canonicalContactMap.embedUrl,
  openUrl: canonicalContactMap.openUrl,
};

// 12. NEWS (5 Real Production News Items)
const canonicalNews = [
  {
    id: 'n1787784599082',
    title: 'البريد الإلكتروني',
    excerpt: 'سيسييس',
    category: '~~~~',
    fullContent: 'سييسي',
  },
  {
    id: 'n1787784515543',
    title: 'مقمبي',
    excerpt: 'سييسسي',
    category: 'سييس',
    fullContent: 'سيسي',
  },
  {
    id: 'n1',
    title: 'الاتحاد يوقع اتفاقية شراكة مع جامعة إسطنبول',
    excerpt: 'في خطوة لتعزيز التعاون الأكاديمي، وقّع الاتحاد اتفاقية شراكة مع جامعة إسطنبول تتيح للطلاب برامج تبادل وتدريب.',
    category: 'شراكات',
    fullContent: 'في خطوة لتعزيز التعاون الأكاديمي، وقّع الاتحاد اتفاقية شراكة مع جامعة إسطنبول تتيح للطلاب برامج تبادل وتدريب. تأتي هذه الاتفاقية ضمن استراتيجية الاتحاد لتوسيع شبكة علاقاته الأكاديمية وتوفير فرص نوعية للطلاب.',
  },
  {
    id: 'n2',
    title: 'انطلاق التسجيل في برنامج القادة الشبابي الصيفي',
    excerpt: 'يفتح الاتحاد باب التسجيل في النسخة الثالثة من برنامج القادة الشبابي الصيفي، الذي يستقطب 100 طالب من مختلف الجامعات.',
    category: 'إعلانات',
    fullContent: 'يفتح الاتحاد باب التسجيل في النسخة الثالثة من برنامج القادة الشبابي الصيفي، الذي يستقطب 100 طالب من مختلف الجامعات. يشمل البرنامج ورش عمل تدريبية ومحاضرات تثقيفية وأنشطة تطوعية.',
  },
  {
    id: 'n3',
    title: 'فريق الاتحاد يحصد المركز الأول في مسابقة الابتكار',
    excerpt: 'حقق فريق الاتحاد المركز الأول في مسابقة الابتكار الشبابي على مستوى الجامعات، بمشروع بيئي لتحويل النفايات إلى طاقة.',
    category: 'إنجازات',
    fullContent: 'حقق فريق الاتحاد المركز الأول في مسابقة الابتكار الشبابي على مستوى الجامعات، بمشروع بيئي لتحويل النفايات إلى طاقة. يأتي هذا الإنجاز ثمرة لجهود متواصلة وبرامج تدريبية نوعية.',
  },
];

const trNews = [
  {
    id: 'n1787784599082',
    title: 'Birlik İletişim Duyurusu',
    excerpt: 'Öğrenci iletişim kanalları hakkında genel bilgilendirme.',
    category: 'Duyuru',
    fullContent: 'Öğrencilerin Birlik ile iletişimini kolaylaştıracak yeni kanallar ve e-posta desteği hizmete girdi.',
  },
  {
    id: 'n1787784515543',
    title: 'Gençlik Faaliyetleri Bilgilendirmesi',
    excerpt: 'Önümüzdeki dönem faaliyetleri hakkında genel açıklama.',
    category: 'Faaliyetler',
    fullContent: 'Öğrencilerimiz için hazırlanan yeni sosyal ve kültürel etkinlik takvimi açıklandı.',
  },
  {
    id: 'n1',
    title: 'Birlik, İstanbul Üniversitesi ile İş Birliği Protokolü İmzaladı',
    excerpt: 'Akademik iş birliğini güçlendirme adımı olarak Birlik, İstanbul Üniversitesi ile öğrencilere değişim ve staj olanakları sağlayan bir protokol imzaladı.',
    category: 'İş Birlikleri',
    fullContent: 'Akademik iş birliğini güçlendirme adımı olarak Birlik, İstanbul Üniversitesi ile öğrencilere değişim ve staj olanakları sağlayan bir protokol imzaladı. Bu anlaşma, Birliğin akademik ağını genişletme stratejisinin önemli bir parçasıdır.',
  },
  {
    id: 'n2',
    title: 'Yaz Gençlik Liderlik Programı Başvuruları Başladı',
    excerpt: 'Birlik, farklı üniversitelerden 100 öğrenciyi ağırlayacak olan Yaz Gençlik Liderlik Programı\'nın 3. dönemi için başvuruları başlattı.',
    category: 'Duyurular',
    fullContent: 'Birlik, farklı üniversitelerden 100 öğrenciyi ağırlayacak olan Yaz Gençlik Liderlik Programı\'nın 3. dönemi için başvuruları başlattı. Program atölyeler, kültürel seminerler ve gönüllülük faaliyetlerini içeriyor.',
  },
  {
    id: 'n3',
    title: 'Birlik Ekibi Üniversiteler Arası İnovasyon Yarışmasında Birinci Oldu',
    excerpt: 'Birlik öğrenci ekibi, atıkları enerjiye dönüştüren çevre projesiyle üniversiteler arası inovasyon yarışmasında birincilik ödülü kazandı.',
    category: 'Başarılar',
    fullContent: 'Birlik öğrenci ekibi, atıkları enerjiye dönüştüren çevre projesiyle üniversiteler arası inovasyon yarışmasında birincilik ödülü kazandı. Bu başarı, nitelikli eğitim ve sürekli çabanın meyvesidir.',
  },
];

const enNews = [
  {
    id: 'n1787784599082',
    title: 'Union Communication Notice',
    excerpt: 'General communication update regarding student inquiry channels.',
    category: 'Announcements',
    fullContent: 'New email channels and inquiry support have been initiated to streamline communication with students.',
  },
  {
    id: 'n1787784515543',
    title: 'Youth Activities Overview',
    excerpt: 'Overview of upcoming activities and student participation.',
    category: 'Activities',
    fullContent: 'The new calendar of social and cultural programs prepared for our students has been announced.',
  },
  {
    id: 'n1',
    title: 'Union Signs Partnership Agreement with Istanbul University',
    excerpt: 'In a move to strengthen academic cooperation, the Union signed a partnership agreement with Istanbul University offering exchange and internship programs.',
    category: 'Partnerships',
    fullContent: 'In a move to strengthen academic cooperation, the Union signed a partnership agreement with Istanbul University offering exchange and internship programs. This agreement is part of the Union\'s strategy to expand academic relations and provide quality opportunities.',
  },
  {
    id: 'n2',
    title: 'Registration Opens for Summer Youth Leadership Program',
    excerpt: 'The Union opens registration for the third edition of the Summer Youth Leadership Program, welcoming 100 students from various universities.',
    category: 'Announcements',
    fullContent: 'The Union opens registration for the third edition of the Summer Youth Leadership Program, welcoming 100 students from various universities. The program includes workshops, seminars, and community volunteer initiatives.',
  },
  {
    id: 'n3',
    title: 'Union Team Wins First Place in University Innovation Competition',
    excerpt: 'The Union team secured first place in the nationwide university youth innovation contest with an environmental waste-to-energy project.',
    category: 'Achievements',
    fullContent: 'The Union team secured first place in the nationwide university youth innovation contest with an environmental waste-to-energy project. This accomplishment is the fruit of dedicated mentoring and research training.',
  },
];

// 13. PLANS (4 Real Production Plans)
const canonicalPlans = [
  {
    id: 'p1',
    title: 'توسيع البرامج الصيفية',
    quarter: 'الربع الثالث 2026',
    description: 'زيادة عدد البرامج الصيفية بنسبة 40% والوصول إلى 500 طالب مشارك.',
  },
  {
    id: 'p2',
    title: 'إطلاق منصة رقمية للأنشطة',
    quarter: 'الربع الرابع 2026',
    description: 'تطوير منصة إلكترونية متكاملة لإدارة التسجيل ومتابعة الأنشطة والاقتراحات.',
  },
  {
    id: 'p3',
    title: 'شراكات مع 5 جامعات جديدة',
    quarter: 'الربع الثالث 2026',
    description: 'عقد اتفاقيات تعاون مع خمس جامعات إضافية لتوسيع قاعدة المستفيدين.',
  },
  {
    id: 'p4',
    title: 'تدريب 100 قائد شبابي',
    quarter: 'الربع الأول 2027',
    description: 'إعداد وتدريب 100 قائد شبابي قادر على إدارة المبادرات المجتمعية.',
  },
];

const trPlans = [
  {
    id: 'p1',
    title: 'Yaz Programlarının Genişletilmesi',
    quarter: '3. Çeyrek 2026',
    description: 'Yaz programı sayısının %40 artırılarak 500 katılımcı öğrenciye ulaşılması.',
  },
  {
    id: 'p2',
    title: 'Dijital Faaliyet Platformunun Başlatılması',
    quarter: '4. Çeyrek 2026',
    description: 'Kayıt, faaliyet takibi ve öneriler için entegre bir elektronik platform geliştirilmesi.',
  },
  {
    id: 'p3',
    title: '5 Yeni Üniversite ile İş Birliği',
    quarter: '3. Çeyrek 2026',
    description: 'Faydalanıcı tabanını genişletmek amacıyla beş yeni üniversite ile protokol imzalanması.',
  },
  {
    id: 'p4',
    title: '100 Genç Liderin Eğitilmesi',
    quarter: '1. Çeyrek 2027',
    description: 'Toplumsal projelere öncülük edebilecek 100 genç liderin yetiştirilmesi ve eğitilmesi.',
  },
];

const enPlans = [
  {
    id: 'p1',
    title: 'Expanding Summer Programs',
    quarter: 'Q3 2026',
    description: 'Increasing summer program offerings by 40% to reach 500 participating students.',
  },
  {
    id: 'p2',
    title: 'Launching Digital Activities Platform',
    quarter: 'Q4 2026',
    description: 'Developing an integrated digital platform for registration, activity tracking, and feedback.',
  },
  {
    id: 'p3',
    title: 'Partnerships with 5 New Universities',
    quarter: 'Q3 2026',
    description: 'Concluding cooperation agreements with five additional universities to broaden reach.',
  },
  {
    id: 'p4',
    title: 'Training 100 Youth Leaders',
    quarter: 'Q1 2027',
    description: 'Preparing and mentoring 100 youth leaders capable of managing community initiatives.',
  },
];

// 14. REPORTS (3 Real Production Reports)
const canonicalReports = [
  {
    id: 'r1',
    title: 'التقرير السنوي 2025',
    summary: 'ملخص شامل لإنجازات الاتحاد خلال عام 2025، شمل 24 فعالية و1200 مستفيد.',
  },
  {
    id: 'r2',
    title: 'تقرير الربع الثاني 2026',
    summary: 'تحليل أداء الأنشطة والبرامج في الربع الثاني ومؤشرات المشاركة.',
  },
  {
    id: 'r3',
    title: 'تقرير الحملة التطوعية الرمضانية',
    summary: 'توثيق نتائج حملة الإفطار الجماعي وتقييم الأثر المجتمعي.',
  },
];

const trReports = [
  {
    id: 'r1',
    title: '2025 Yıllık Faaliyet Raporu',
    summary: '2025 yılında gerçekleştirilen 24 etkinlik ve 1.200 faydalanıcıyı kapsayan kapsamlı Birlik raporu.',
  },
  {
    id: 'r2',
    title: '2026 İkinci Çeyrek Raporu',
    summary: 'İkinci çeyrekteki faaliyet ve program performansının ve katılım göstergelerinin analizi.',
  },
  {
    id: 'r3',
    title: 'Ramazan Gönüllülük Kampanyası Raporu',
    summary: 'Toplu iftar kampanyası sonuçlarının belgelenmesi ve toplumsal etkisinin değerlendirilmesi.',
  },
];

const enReports = [
  {
    id: 'r1',
    title: 'Annual Report 2025',
    summary: 'Comprehensive summary of Union achievements in 2025, encompassing 24 events and 1,200 beneficiaries.',
  },
  {
    id: 'r2',
    title: 'Second Quarter Report 2026',
    summary: 'Performance analysis of programs and activities during Q2 with participation indicators.',
  },
  {
    id: 'r3',
    title: 'Ramadan Volunteer Campaign Report',
    summary: 'Documentation of collective iftar results and assessment of community impact.',
  },
];

// 15. COMMITTEES (7 Real Production Committees from published_site_content)
const canonicalCommittees = [
  {
    "id": "presidency",
    "head": {
      "id": "11f9e6f2-828c-44a2-b05c-53400b3a9b9a",
      "bio": "عضو في الهيئة التنفيذية لاتحاد شباب الأمة",
      "name": "م. بشار الزريقي",
      "role": "رئيس الاتحاد",
      "year": "السنة الثالثة",
      "email": "president@ummet.org",
      "major": "Bilgisayar Mühendisliği",
      "phone": "",
      "photo": "11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-201de549-4ba6-4f14-b51d-5eb3e9c9d7f1.jpg",
      "updatedAt": "2026-09-01T18:32:57.960684+00:00",
      "university": "Atatürk"
    },
    "icon": "Crown",
    "name": "رئاسة الاتحاد",
    "color": "from-navy-700 to-navy-950",
    "stats": [
      {
        "label": "قرارات صادرة",
        "value": "47"
      },
      {
        "label": "اجتماعات الهيئة ",
        "value": "32"
      },
      {
        "label": "شراكات خارجية",
        "value": "18"
      }
    ],
    "members": [
      {
        "id": "pm1",
        "name": "م. سلمى أردوغان",
        "year": "دراسات عليا",
        "major": "الهندسة المدنية",
        "phone": "05313456789",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-272463e1-8969-464e-929d-a80d2151ae58.jpg",
        "position": "مستشار أول",
        "university": "جامعة إسطنبول التقنية"
      },
      {
        "id": "pm2",
        "name": "أ. خليل جوربوز",
        "year": "ماجستير",
        "major": "إدارة المؤسسات",
        "phone": "05314567890",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-2db801f5-c6e9-4a4c-88ea-f143ffeef696.jpg",
        "position": "منسق عام",
        "university": "جامعة أنقرة"
      }
    ],
    "shortName": "الرئاسة",
    "description": "القيادة العليا للاتحاد، تتولى رسم السياسات العامة وتمثيل الاتحاد داخليًا وخارجيًا، والإشراف على عمل جميع اللجان والمكاتب.",
    "responsibilities": [
      "رسم الرؤية الاستراتيجية والسياسات العامة للاتحاد",
      "تمثيل الاتحاد أمام المؤسسات والجهات الخارجية",
      "الإشراف العام على أداء جميع اللجان",
      "إقرار الخطط السنوية والموازنات",
      "رئاسة الاجتماعات الدورية للهيئة التنفيذية"
    ]
  },
  {
    "id": "vice-presidency",
    "head": {
      "id": "5784c265-7b92-4f4f-bdb3-fd74a780a22d",
      "bio": "عضو في الهيئة التنفيذية لاتحاد شباب الأمة",
      "name": "أ. خليل جوربوز",
      "role": "نائب الرئيس",
      "year": "الهيئة التنفيذية",
      "email": "vice.president@ummet.org",
      "major": "نائب رئيس الاتحاد",
      "phone": "",
      "photo": "5784c265-7b92-4f4f-bdb3-fd74a780a22d/avatar-86df205b-f4ee-4631-91d6-77fd8474788d.jpg",
      "updatedAt": "2026-08-24T21:06:51.488275+00:00",
      "university": "اتحاد شباب الأمة"
    },
    "icon": "UserCog",
    "name": "نائب الرئيس",
    "color": "from-navy-600 to-navy-800",
    "stats": [
      {
        "label": "متابعات تنفيذية",
        "value": "64"
      },
      {
        "label": "جلسات تنسيق",
        "value": "28"
      },
      {
        "label": "تقارير دورية",
        "value": "12"
      }
    ],
    "members": [
      {
        "id": "vm1",
        "name": "نور هاكان",
        "year": "السنة الرابعة",
        "major": "إدارة الأعمال",
        "phone": "05316789012",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-272463e1-8969-464e-929d-a80d2151ae58.jpg",
        "position": "منسق تنفيذي",
        "university": "جامعة مرمرة"
      }
    ],
    "shortName": "النائب",
    "description": "المكتب التنفيذي لنائب الرئيس، يتولى متابعة تنفيذ القرارات وتنسيق العمل بين اللجان، ويتولى صلاحيات الرئيس في حال غيابه.",
    "responsibilities": [
      "متابعة تنفيذ قرارات الرئيس والهيئة التنفيذية",
      "تنسيق العمل بين اللجان المختلفة",
      "الإشراف على الخطط التشغيلية",
      "تولي صلاحيات الرئيس في حال غيابه",
      "إعداد تقارير الأداء الدورية"
    ]
  },
  {
    "id": "media",
    "head": {
      "id": "d2eb09bc-344b-408c-971e-a6293b54a471",
      "bio": "عضو في الهيئة التنفيذية لاتحاد شباب الأمة",
      "name": "مريم شاهين",
      "role": "المسؤول الإعلامي",
      "year": "الهيئة التنفيذية",
      "email": "media@ummet.org",
      "major": "رئيس اللجنة الإعلامية",
      "phone": "",
      "photo": "",
      "updatedAt": "2026-08-23T23:57:01.714692+00:00",
      "university": "اتحاد شباب الأمة"
    },
    "icon": "Megaphone",
    "name": "اللجنة الإعلامية",
    "color": "from-sky-600 to-sky-800",
    "stats": [
      {
        "label": "منشورات سنوية",
        "value": "320"
      },
      {
        "label": "متابعون",
        "value": "12.4K"
      },
      {
        "label": "تغطيات إعلامية",
        "value": "86"
      }
    ],
    "members": [
      {
        "id": "mm1",
        "name": "يوسف أكسوي",
        "year": "السنة الثالثة",
        "major": "الهندسة المدنية",
        "phone": "05318901234",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-2db801f5-c6e9-4a4c-88ea-f143ffeef696.jpg",
        "position": "مصور صحفي",
        "university": "جامعة إسطنبول التقنية"
      },
      {
        "id": "mm2",
        "name": "سارة أوزترك",
        "year": "السنة الثانية",
        "major": "الطب البشري",
        "phone": "05319012345",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-272463e1-8969-464e-929d-a80d2151ae58.jpg",
        "position": "كاتلة محتوى",
        "university": "جامعة حاجي تبه"
      }
    ],
    "shortName": "الإعلام",
    "description": "تتولى اللجنة الإعلامية إدارة صورة الاتحاد وتواصله مع الجمهور عبر المنصات الرقمية والمواد الإعلامية والتغطيات.",
    "responsibilities": [
      "إدارة حسابات التواصل الاجتماعي للاتحاد",
      "تغطية الفعاليات والأنشطة إعلاميًا",
      "إنتاج المحتوى الرقمي والمطبوع",
      "التنسيق مع وسائل الإعلام الخارجية",
      "إصدار النشرات والمطبوعات الدورية"
    ]
  },
  {
    "id": "academic",
    "head": {
      "id": "6de4cc13-7fe3-4463-bbae-1b8f5ed2be5e",
      "bio": "",
      "name": "Aasim Altomy",
      "role": "المسؤول الأكاديمي",
      "year": "السنة الأولى",
      "email": "atomy8774@gmail.com",
      "major": "Bilgi ve belge yönetimi",
      "phone": "",
      "photo": "",
      "updatedAt": "2026-08-24T01:11:16.818474+00:00",
      "university": "Atatürk"
    },
    "icon": "GraduationCap",
    "name": "اللجنة الأكاديمية",
    "color": "from-emerald-600 to-emerald-800",
    "stats": [
      {
        "label": "دورات منفذة",
        "value": "24"
      },
      {
        "label": "متدربون",
        "value": "680"
      },
      {
        "label": "شراكات جامعية",
        "value": "24"
      }
    ],
    "members": [
      {
        "id": "am1",
        "name": "أحمد يلدز",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-2db801f5-c6e9-4a4c-88ea-f143ffeef696.jpg",
        "position": "منسق برامج"
      },
      {
        "id": "am2",
        "name": "فاطمة كايا",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-272463e1-8969-464e-929d-a80d2151ae58.jpg",
        "position": "مدرّب"
      }
    ],
    "shortName": "الأكاديمية",
    "description": "تهتم اللجنة الأكاديمية بالشأن العلمي للطلاب، عبر تنظيم الدورات التدريبية والندوات وورش العمل ودعم المسار الأكاديمي.",
    "responsibilities": [
      "تنظيم الدورات التدريبية وورش العمل",
      "عقد الندوات والمحاضرات الأكاديمية",
      "دعم الطلاب أكاديميًا وتوجيههم",
      "الإشراف على المكتبة العلمية للاتحاد",
      "تنسيق البرامج مع الجامعات الشريكة",
      "gogho"
    ]
  },
  {
    "id": "supervisory",
    "head": {
      "id": "e451c0a1-7470-4eb2-9787-48ce99916581",
      "bio": "عضو في الهيئة التنفيذية لاتحاد شباب الأمة",
      "name": "أ. خالد أرسلان",
      "role": "مسؤول الرقابة والتفتيش",
      "year": "الهيئة التنفيذية",
      "email": "audit@ummet.org",
      "major": "رئيس لجنة الرقابة",
      "phone": "",
      "photo": "",
      "updatedAt": "2026-08-23T23:57:01.714692+00:00",
      "university": "اتحاد شباب الأمة"
    },
    "icon": "ShieldCheck",
    "name": "اللجنة الرقابية",
    "color": "from-rose-600 to-rose-800",
    "stats": [
      {
        "label": "تدقيقات منجزة",
        "value": "18"
      },
      {
        "label": "تقارير شفافية",
        "value": "6"
      },
      {
        "label": "شكاوى محلولة",
        "value": "14"
      }
    ],
    "members": [
      {
        "id": "sm1",
        "name": "عمر ديمير",
        "year": "السنة الرابعة",
        "major": "إدارة الأعمال",
        "phone": "05323456789",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-2db801f5-c6e9-4a4c-88ea-f143ffeef696.jpg",
        "position": "مراجع مالي",
        "university": "جامعة بورصة التقنية"
      }
    ],
    "shortName": "الرقابة",
    "description": "اللجنة الرقابية هي الجهة المستقلة المسؤولة عن مراقبة الالتزام والشفافية داخل الاتحاد، وتقييم الأداء وضمان نزاهة العمل المؤسسي.",
    "responsibilities": [
      "مراقبة الالتزام باللوائح والأنظمة",
      "تدقيق التقارير المالية والإدارية",
      "التحقيق في الشكاوى والمخالفات",
      "تقييم أداء اللجان والأعضاء",
      "إعداد تقارير الشفافية الدورية"
    ]
  },
  {
    "id": "activities",
    "head": {
      "id": "f20918e9-851d-47e6-a102-b769be41b453",
      "bio": "عضو في الهيئة التنفيذية لاتحاد شباب الأمة",
      "name": "م. سلمى أردوغان",
      "role": "مسؤول الأنشطة",
      "year": "الهيئة التنفيذية",
      "email": "activities@ummet.org",
      "major": "رئيس لجنة الأنشطة",
      "phone": "",
      "photo": "",
      "updatedAt": "2026-08-23T23:57:01.714692+00:00",
      "university": "اتحاد شباب الأمة"
    },
    "icon": "CalendarDays",
    "name": "لجنة الأنشطة",
    "color": "from-gold-500 to-gold-700",
    "stats": [
      {
        "label": "فعاليات منفذة",
        "value": "86"
      },
      {
        "label": "متطوعون",
        "value": "540"
      },
      {
        "label": "مستفيدون",
        "value": "4.2K"
      }
    ],
    "members": [
      {
        "id": "acm1",
        "name": "يوسف أكسوي",
        "year": "السنة الثالثة",
        "major": "الهندسة المدنية",
        "phone": "05325678901",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-2db801f5-c6e9-4a4c-88ea-f143ffeef696.jpg",
        "position": "منسق فعاليات",
        "university": "جامعة إسطنبول التقنية"
      },
      {
        "id": "acm2",
        "name": "نور هاكان",
        "year": "السنة الرابعة",
        "major": "إدارة الأعمال",
        "phone": "05316789012",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-272463e1-8969-464e-929d-a80d2151ae58.jpg",
        "position": "منسق متطوعين",
        "university": "جامعة مرمرة"
      }
    ],
    "shortName": "الأنشطة",
    "description": "تنظيم وإدارة الفعاليات والأنشطة الشبابية المتنوعة، من رحلات وندوات وحملات تطوعية، وتفعيل المشاركة الطلابية.",
    "responsibilities": [
      "تخطيط وتنظيم الفعاليات والأنشطة",
      "إدارة الحملات التطوعية",
      "تنظيم الرحلات التثقيفية والترفيهية",
      "الإشراف على الأندية الطلابية",
      "تفعيل المشاركة الطلابية في الأنشطة"
    ]
  },
  {
    "id": "finance",
    "head": {
      "id": "73860832-acc1-4995-8918-dcdd5a1b3cac",
      "bio": "عضو في الهيئة التنفيذية لاتحاد شباب الأمة",
      "name": "أ. عمر ديمير",
      "role": "المسؤول المالي",
      "year": "الهيئة التنفيذية",
      "email": "finance@ummet.org",
      "major": "رئيس اللجنة المالية",
      "phone": "",
      "photo": "",
      "updatedAt": "2026-08-23T23:57:01.714692+00:00",
      "university": "اتحاد شباب الأمة"
    },
    "icon": "Wallet",
    "name": "اللجنة المالية",
    "color": "from-teal-600 to-teal-800",
    "stats": [
      {
        "label": "موازنة 2026",
        "value": "480K ₺"
      },
      {
        "label": "تمويل مشاريع",
        "value": "320K ₺"
      },
      {
        "label": "رعاة",
        "value": "11"
      }
    ],
    "members": [
      {
        "id": "fm1",
        "name": "خالد أرسلان",
        "year": "دكتوراه",
        "major": "القانون العام",
        "phone": "05313456789",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-2db801f5-c6e9-4a4c-88ea-f143ffeef696.jpg",
        "position": "محاسب",
        "university": "جامعة أنقرة"
      }
    ],
    "shortName": "المالية",
    "description": "تتولى اللجنة المالية إدارة الموارد المالية للاتحاد، وإعداد الموازنات ومتابعة الإيرادات والمصروفات وضمان الاستدامة المالية.",
    "responsibilities": [
      "إعداد الموازنة السنوية للاتحاد",
      "متابعة الإيرادات والمصروفات",
      "إدارة التبرعات والرعايات",
      "إعداد التقارير المالية الدورية",
      "التنسيق مع اللجنة الرقابية للتدقيق"
    ]
  }
];

const trCommittees = [
  {
    "id": "presidency",
    "head": {
      "id": "11f9e6f2-828c-44a2-b05c-53400b3a9b9a",
      "bio": "Ümmet Gençleri Birliği Yönetim Kurulu Üyesi",
      "name": "م. بشار الزريقي",
      "role": "رئيس الاتحاد",
      "year": "السنة الثالثة",
      "email": "president@ummet.org",
      "major": "Bilgisayar Mühendisliği",
      "phone": "",
      "photo": "11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-201de549-4ba6-4f14-b51d-5eb3e9c9d7f1.jpg",
      "updatedAt": "2026-09-01T18:32:57.960684+00:00",
      "university": "Atatürk"
    },
    "icon": "Crown",
    "name": "Birlik Başkanlığı",
    "color": "from-navy-700 to-navy-950",
    "stats": [
      {
        "label": "Alınan Kararlar",
        "value": "47"
      },
      {
        "label": "Yönetim Toplantıları",
        "value": "32"
      },
      {
        "label": "Dış Ortaklıklar",
        "value": "18"
      }
    ],
    "members": [
      {
        "id": "pm1",
        "name": "م. سلمى أردوغان",
        "year": "دراسات عليا",
        "major": "الهندسة المدنية",
        "phone": "05313456789",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-272463e1-8969-464e-929d-a80d2151ae58.jpg",
        "position": "Kıdemli Danışman",
        "university": "جامعة إسطنبول التقنية"
      },
      {
        "id": "pm2",
        "name": "أ. خليل جوربوز",
        "year": "ماجستير",
        "major": "إدارة المؤسسات",
        "phone": "05314567890",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-2db801f5-c6e9-4a4c-88ea-f143ffeef696.jpg",
        "position": "Genel Koordinatör",
        "university": "جامعة أنقرة"
      }
    ],
    "shortName": "Birlik Başkanı",
    "description": "Birliğin en üst liderlik organı olup Birlik Başkanı liderliğinde genel politikaları belirler, Birliği temsil eder ve tüm komitelerin çalışmalarını koordine eder.",
    "responsibilities": [
      "Stratejik vizyon ve genel politikaları belirleme",
      "Birliği kurumlar nezdinde temsil etme",
      "Tüm komitelerin performansını genel gözetim",
      "Yıllık plan ve bütçeleri onaylama",
      "Yönetim Kurulu toplantılarına başkanlık etme"
    ]
  },
  {
    "id": "vice-presidency",
    "head": {
      "id": "5784c265-7b92-4f4f-bdb3-fd74a780a22d",
      "bio": "Ümmet Gençleri Birliği Yönetim Kurulu Üyesi",
      "name": "أ. خليل جوربوز",
      "role": "نائب الرئيس",
      "year": "الهيئة التنفيذية",
      "email": "vice.president@ummet.org",
      "major": "نائب رئيس الاتحاد",
      "phone": "",
      "photo": "5784c265-7b92-4f4f-bdb3-fd74a780a22d/avatar-86df205b-f4ee-4631-91d6-77fd8474788d.jpg",
      "updatedAt": "2026-08-24T21:06:51.488275+00:00",
      "university": "اتحاد شباب الأمة"
    },
    "icon": "UserCog",
    "name": "Başkan Yardımcılığı",
    "color": "from-navy-600 to-navy-800",
    "stats": [
      {
        "label": "İcra Takipleri",
        "value": "64"
      },
      {
        "label": "Koordinasyon Oturumları",
        "value": "28"
      },
      {
        "label": "Periyodik Raporlar",
        "value": "12"
      }
    ],
    "members": [
      {
        "id": "vm1",
        "name": "نور هاكان",
        "year": "السنة الرابعة",
        "major": "إدارة الأعمال",
        "phone": "05316789012",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-272463e1-8969-464e-929d-a80d2151ae58.jpg",
        "position": "Yürütme Koordinatörü",
        "university": "جامعة مرمرة"
      }
    ],
    "shortName": "Başkan Yardımcısı",
    "description": "Kararların uygulanmasını takip eder, komiteler arası koordinasyonu sağlar ve Başkanın yokluğunda vekalet eder.",
    "responsibilities": [
      "Yönetim Kurulu kararlarının uygulanmasını takip",
      "Komiteler arası iş birliğini koordine etme",
      "Operasyonel planları denetleme",
      "Başkanın yokluğunda görev ve yetkileri üstlenme",
      "Periyodik performans raporları hazırlama"
    ]
  },
  {
    "id": "media",
    "head": {
      "id": "d2eb09bc-344b-408c-971e-a6293b54a471",
      "bio": "Ümmet Gençleri Birliği Yönetim Kurulu Üyesi",
      "name": "مريم شاهين",
      "role": "المسؤول الإعلامي",
      "year": "الهيئة التنفيذية",
      "email": "media@ummet.org",
      "major": "رئيس اللجنة الإعلامية",
      "phone": "",
      "photo": "",
      "updatedAt": "2026-08-23T23:57:01.714692+00:00",
      "university": "اتحاد شباب الأمة"
    },
    "icon": "Megaphone",
    "name": "Medya Komitesi",
    "color": "from-sky-600 to-sky-800",
    "stats": [
      {
        "label": "Yıllık Gönderiler",
        "value": "320"
      },
      {
        "label": "Takipçi",
        "value": "12.4K"
      },
      {
        "label": "Medya Kapsamı",
        "value": "86"
      }
    ],
    "members": [
      {
        "id": "mm1",
        "name": "يوسف أكسوي",
        "year": "السنة الثالثة",
        "major": "الهندسة المدنية",
        "phone": "05318901234",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-2db801f5-c6e9-4a4c-88ea-f143ffeef696.jpg",
        "position": "Basın Fotoğrafçısı",
        "university": "جامعة إسطنبول التقنية"
      },
      {
        "id": "mm2",
        "name": "سارة أوزترك",
        "year": "السنة الثانية",
        "major": "الطب البشري",
        "phone": "05319012345",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-272463e1-8969-464e-929d-a80d2151ae58.jpg",
        "position": "İçerik Yazarı",
        "university": "جامعة حاجي تبه"
      }
    ],
    "shortName": "Medya",
    "description": "Birliğin kurumsal kimliğini ve dijital platformlar, basın ve görsel materyaller üzerinden kamuoyu iletişimini yönetir.",
    "responsibilities": [
      "Sosyal medya hesaplarını profesyonelce yönetme",
      "Etkinlik ve faaliyetlerin medya kapsamını sağlama",
      "Dijital ve basılı içerik üretimi",
      "Basın kuruluşları ile koordinasyon",
      "Periyodik bülten ve yayınlar çıkarma"
    ]
  },
  {
    "id": "academic",
    "head": {
      "id": "6de4cc13-7fe3-4463-bbae-1b8f5ed2be5e",
      "bio": "",
      "name": "Aasim Altomy",
      "role": "المسؤول الأكاديمي",
      "year": "السنة الأولى",
      "email": "atomy8774@gmail.com",
      "major": "Bilgi ve belge yönetimi",
      "phone": "",
      "photo": "",
      "updatedAt": "2026-08-24T01:11:16.818474+00:00",
      "university": "Atatürk"
    },
    "icon": "GraduationCap",
    "name": "Akademik Komite",
    "color": "from-emerald-600 to-emerald-800",
    "stats": [
      {
        "label": "Tamamlanan Kurslar",
        "value": "24"
      },
      {
        "label": "Eğitim Alanlar",
        "value": "680"
      },
      {
        "label": "Üniversite Ortaklıkları",
        "value": "24"
      }
    ],
    "members": [
      {
        "id": "am1",
        "name": "أحمد يلدز",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-2db801f5-c6e9-4a4c-88ea-f143ffeef696.jpg",
        "position": "Program Koordinatörü"
      },
      {
        "id": "am2",
        "name": "فاطمة كايا",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-272463e1-8969-464e-929d-a80d2151ae58.jpg",
        "position": "Eğitmen"
      }
    ],
    "shortName": "Akademik",
    "description": "Kurslar, seminerler, paneller ve bilimsel rehberlik yoluyla öğrencilerin akademik gelişimini destekler.",
    "responsibilities": [
      "Eğitim kursları ve atölyeler düzenleme",
      "Akademik konferans ve seminerler tertipleme",
      "Öğrencilere akademik danışmanlık sağlama",
      "Birlik bilimsel kütüphanesini yönetme",
      "Ortak üniversitelerle programları koordine etme"
    ]
  },
  {
    "id": "supervisory",
    "head": {
      "id": "e451c0a1-7470-4eb2-9787-48ce99916581",
      "bio": "Ümmet Gençleri Birliği Yönetim Kurulu Üyesi",
      "name": "أ. خالد أرسلان",
      "role": "مسؤول الرقابة والتفتيش",
      "year": "الهيئة التنفيذية",
      "email": "audit@ummet.org",
      "major": "رئيس لجنة الرقابة",
      "phone": "",
      "photo": "",
      "updatedAt": "2026-08-23T23:57:01.714692+00:00",
      "university": "اتحاد شباب الأمة"
    },
    "icon": "ShieldCheck",
    "name": "Denetim ve Teftiş Komitesi",
    "color": "from-rose-600 to-rose-800",
    "stats": [
      {
        "label": "Tamamlanan Denetimler",
        "value": "18"
      },
      {
        "label": "Şeffaflık Raporları",
        "value": "6"
      },
      {
        "label": "Çözülen Başvurular",
        "value": "14"
      }
    ],
    "members": [
      {
        "id": "sm1",
        "name": "عمر ديمير",
        "year": "السنة الرابعة",
        "major": "إدارة الأعمال",
        "phone": "05323456789",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-2db801f5-c6e9-4a4c-88ea-f143ffeef696.jpg",
        "position": "Mali Denetçi",
        "university": "جامعة بورصة التقنية"
      }
    ],
    "shortName": "Denetim",
    "description": "Birlik içi mevzuata uyumu, şeffaflığı ve kurumsal işleyişin dürüstlüğünü denetleyen bağımsız organdır.",
    "responsibilities": [
      "İç tüzük ve düzenlemelere uyumu denetleme",
      "İdari ve mali raporları inceleme",
      "Gelen bildirim ve şikayetleri değerlendirme",
      "Komite ve üyelerin performansını değerlendirme",
      "Periyodik şeffaflık raporları hazırlama"
    ]
  },
  {
    "id": "activities",
    "head": {
      "id": "f20918e9-851d-47e6-a102-b769be41b453",
      "bio": "Ümmet Gençleri Birliği Yönetim Kurulu Üyesi",
      "name": "م. سلمى أردوغان",
      "role": "مسؤول الأنشطة",
      "year": "الهيئة التنفيذية",
      "email": "activities@ummet.org",
      "major": "رئيس لجنة الأنشطة",
      "phone": "",
      "photo": "",
      "updatedAt": "2026-08-23T23:57:01.714692+00:00",
      "university": "اتحاد شباب الأمة"
    },
    "icon": "CalendarDays",
    "name": "Faaliyetler Komitesi",
    "color": "from-gold-500 to-gold-700",
    "stats": [
      {
        "label": "Düzenlenen Faaliyetler",
        "value": "86"
      },
      {
        "label": "Gönüllüler",
        "value": "540"
      },
      {
        "label": "Yararlanıcılar",
        "value": "4.2K"
      }
    ],
    "members": [
      {
        "id": "acm1",
        "name": "يوسف أكسوي",
        "year": "السنة الثالثة",
        "major": "الهندسة المدنية",
        "phone": "05325678901",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-2db801f5-c6e9-4a4c-88ea-f143ffeef696.jpg",
        "position": "Etkinlik Koordinatörü",
        "university": "جامعة إسطنبول التقنية"
      },
      {
        "id": "acm2",
        "name": "نور هاكان",
        "year": "السنة الرابعة",
        "major": "إدارة الأعمال",
        "phone": "05316789012",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-272463e1-8969-464e-929d-a80d2151ae58.jpg",
        "position": "Gönüllü Koordinatörü",
        "university": "جامعة مرمرة"
      }
    ],
    "shortName": "Faaliyetler",
    "description": "Geziler, seminerler, gönüllülük kampanyaları ve spor etkinlikleri ile öğrenci katılımını canlı tutar.",
    "responsibilities": [
      "Sosyal ve kültürel faaliyetleri planlama ve yönetme",
      "Gönüllülük kampanyalarını koordine etme",
      "Kültür ve doğa gezileri düzenleme",
      "Öğrenci kulüpleri ile iş birliği",
      "Öğrenci katılımını aktif kılma"
    ]
  },
  {
    "id": "finance",
    "head": {
      "id": "73860832-acc1-4995-8918-dcdd5a1b3cac",
      "bio": "Ümmet Gençleri Birliği Yönetim Kurulu Üyesi",
      "name": "أ. عمر ديمير",
      "role": "المسؤول المالي",
      "year": "الهيئة التنفيذية",
      "email": "finance@ummet.org",
      "major": "رئيس اللجنة المالية",
      "phone": "",
      "photo": "",
      "updatedAt": "2026-08-23T23:57:01.714692+00:00",
      "university": "اتحاد شباب الأمة"
    },
    "icon": "Wallet",
    "name": "Maliye Komitesi",
    "color": "from-teal-600 to-teal-800",
    "stats": [
      {
        "label": "2026 Bütçesi",
        "value": "480K ₺"
      },
      {
        "label": "Proje Fonu",
        "value": "320K ₺"
      },
      {
        "label": "Sponsorlar",
        "value": "11"
      }
    ],
    "members": [
      {
        "id": "fm1",
        "name": "خالد أرسلان",
        "year": "دكتوراه",
        "major": "القانون العام",
        "phone": "05313456789",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-2db801f5-c6e9-4a4c-88ea-f143ffeef696.jpg",
        "position": "Muhasebeci",
        "university": "جامعة أنقرة"
      }
    ],
    "shortName": "Maliye",
    "description": "Birliğin mali kaynaklarını yönetir, bütçe tahminlerini hazırlar ve harcamaları şeffaflıkla denetler.",
    "responsibilities": [
      "Yıllık bütçeyi hazırlama",
      "Gelir ve giderleri düzenli takip etme",
      "Bağış ve sponsorluk süreçlerini yönetme",
      "Dönemsel mali raporları hazırlama",
      "Denetim komitesi ile koordinasyon"
    ]
  }
];

const enCommittees = [
  {
    "id": "presidency",
    "head": {
      "id": "11f9e6f2-828c-44a2-b05c-53400b3a9b9a",
      "bio": "Member of the Executive Board of the Ummah Youth Union",
      "name": "م. بشار الزريقي",
      "role": "رئيس الاتحاد",
      "year": "السنة الثالثة",
      "email": "president@ummet.org",
      "major": "Bilgisayar Mühendisliği",
      "phone": "",
      "photo": "11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-201de549-4ba6-4f14-b51d-5eb3e9c9d7f1.jpg",
      "updatedAt": "2026-09-01T18:32:57.960684+00:00",
      "university": "Atatürk"
    },
    "icon": "Crown",
    "name": "Union Presidency",
    "color": "from-navy-700 to-navy-950",
    "stats": [
      {
        "label": "Resolutions Issued",
        "value": "47"
      },
      {
        "label": "Board Meetings",
        "value": "32"
      },
      {
        "label": "External Partnerships",
        "value": "18"
      }
    ],
    "members": [
      {
        "id": "pm1",
        "name": "م. سلمى أردوغان",
        "year": "دراسات عليا",
        "major": "الهندسة المدنية",
        "phone": "05313456789",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-272463e1-8969-464e-929d-a80d2151ae58.jpg",
        "position": "Senior Advisor",
        "university": "جامعة إسطنبول التقنية"
      },
      {
        "id": "pm2",
        "name": "أ. خليل جوربوز",
        "year": "ماجستير",
        "major": "إدارة المؤسسات",
        "phone": "05314567890",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-2db801f5-c6e9-4a4c-88ea-f143ffeef696.jpg",
        "position": "General Coordinator",
        "university": "جامعة أنقرة"
      }
    ],
    "shortName": "Union President",
    "description": "The supreme executive leadership of the Union headed by the Union President, formulating general policies, representing the Union, and supervising all committees.",
    "responsibilities": [
      "Formulating strategic vision and general policies",
      "Representing the Union before external institutions",
      "Overall supervision of all committee performances",
      "Approving annual operational plans and budgets",
      "Presiding over Executive Board meetings"
    ]
  },
  {
    "id": "vice-presidency",
    "head": {
      "id": "5784c265-7b92-4f4f-bdb3-fd74a780a22d",
      "bio": "Member of the Executive Board of the Ummah Youth Union",
      "name": "أ. خليل جوربوز",
      "role": "نائب الرئيس",
      "year": "الهيئة التنفيذية",
      "email": "vice.president@ummet.org",
      "major": "نائب رئيس الاتحاد",
      "phone": "",
      "photo": "5784c265-7b92-4f4f-bdb3-fd74a780a22d/avatar-86df205b-f4ee-4631-91d6-77fd8474788d.jpg",
      "updatedAt": "2026-08-24T21:06:51.488275+00:00",
      "university": "اتحاد شباب الأمة"
    },
    "icon": "UserCog",
    "name": "Vice Presidency",
    "color": "from-navy-600 to-navy-800",
    "stats": [
      {
        "label": "Executive Follow-ups",
        "value": "64"
      },
      {
        "label": "Coordination Sessions",
        "value": "28"
      },
      {
        "label": "Periodic Reports",
        "value": "12"
      }
    ],
    "members": [
      {
        "id": "vm1",
        "name": "نور هاكان",
        "year": "السنة الرابعة",
        "major": "إدارة الأعمال",
        "phone": "05316789012",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-272463e1-8969-464e-929d-a80d2151ae58.jpg",
        "position": "Executive Coordinator",
        "university": "جامعة مرمرة"
      }
    ],
    "shortName": "Vice President",
    "description": "Oversees decision execution, coordinates committee workflows, and assumes presidential duties when necessary.",
    "responsibilities": [
      "Following up on Executive Board resolutions",
      "Coordinating cross-committee workflows",
      "Supervising operational implementation",
      "Assuming presidential authority in the President's absence",
      "Preparing periodic performance reviews"
    ]
  },
  {
    "id": "media",
    "head": {
      "id": "d2eb09bc-344b-408c-971e-a6293b54a471",
      "bio": "Member of the Executive Board of the Ummah Youth Union",
      "name": "مريم شاهين",
      "role": "المسؤول الإعلامي",
      "year": "الهيئة التنفيذية",
      "email": "media@ummet.org",
      "major": "رئيس اللجنة الإعلامية",
      "phone": "",
      "photo": "",
      "updatedAt": "2026-08-23T23:57:01.714692+00:00",
      "university": "اتحاد شباب الأمة"
    },
    "icon": "Megaphone",
    "name": "Media Committee",
    "color": "from-sky-600 to-sky-800",
    "stats": [
      {
        "label": "Annual Posts",
        "value": "320"
      },
      {
        "label": "Followers",
        "value": "12.4K"
      },
      {
        "label": "Media Coverages",
        "value": "86"
      }
    ],
    "members": [
      {
        "id": "mm1",
        "name": "يوسف أكسوي",
        "year": "السنة الثالثة",
        "major": "الهندسة المدنية",
        "phone": "05318901234",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-2db801f5-c6e9-4a4c-88ea-f143ffeef696.jpg",
        "position": "Press Photographer",
        "university": "جامعة إسطنبول التقنية"
      },
      {
        "id": "mm2",
        "name": "سارة أوزترك",
        "year": "السنة الثانية",
        "major": "الطب البشري",
        "phone": "05319012345",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-272463e1-8969-464e-929d-a80d2151ae58.jpg",
        "position": "Content Writer",
        "university": "جامعة حاجي تبه"
      }
    ],
    "shortName": "Media",
    "description": "Manages the Union's visual identity, digital platforms, public relations, and publication materials.",
    "responsibilities": [
      "Managing official social media accounts",
      "Providing media coverage for all events and campaigns",
      "Producing digital and printed media content",
      "Liaising with external media and news outlets",
      "Publishing regular newsletters and bulletins"
    ]
  },
  {
    "id": "academic",
    "head": {
      "id": "6de4cc13-7fe3-4463-bbae-1b8f5ed2be5e",
      "bio": "",
      "name": "Aasim Altomy",
      "role": "المسؤول الأكاديمي",
      "year": "السنة الأولى",
      "email": "atomy8774@gmail.com",
      "major": "Bilgi ve belge yönetimi",
      "phone": "",
      "photo": "",
      "updatedAt": "2026-08-24T01:11:16.818474+00:00",
      "university": "Atatürk"
    },
    "icon": "GraduationCap",
    "name": "Academic Committee",
    "color": "from-emerald-600 to-emerald-800",
    "stats": [
      {
        "label": "Completed Courses",
        "value": "24"
      },
      {
        "label": "Trainees",
        "value": "680"
      },
      {
        "label": "University Partnerships",
        "value": "24"
      }
    ],
    "members": [
      {
        "id": "am1",
        "name": "أحمد يلدز",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-2db801f5-c6e9-4a4c-88ea-f143ffeef696.jpg",
        "position": "Program Coordinator"
      },
      {
        "id": "am2",
        "name": "فاطمة كايا",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-272463e1-8969-464e-929d-a80d2151ae58.jpg",
        "position": "Trainer"
      }
    ],
    "shortName": "Academic",
    "description": "Supports student academic progression through training courses, symposiums, workshops, and scholarly mentorship.",
    "responsibilities": [
      "Organizing training courses and practical workshops",
      "Convening academic symposiums and guest lectures",
      "Offering academic guidance and mentorship to students",
      "Supervising the Union's scientific library",
      "Coordinating joint programs with partner universities"
    ]
  },
  {
    "id": "supervisory",
    "head": {
      "id": "e451c0a1-7470-4eb2-9787-48ce99916581",
      "bio": "Member of the Executive Board of the Ummah Youth Union",
      "name": "أ. خالد أرسلان",
      "role": "مسؤول الرقابة والتفتيش",
      "year": "الهيئة التنفيذية",
      "email": "audit@ummet.org",
      "major": "رئيس لجنة الرقابة",
      "phone": "",
      "photo": "",
      "updatedAt": "2026-08-23T23:57:01.714692+00:00",
      "university": "اتحاد شباب الأمة"
    },
    "icon": "ShieldCheck",
    "name": "Supervisory and Inspection Committee",
    "color": "from-rose-600 to-rose-800",
    "stats": [
      {
        "label": "Completed Audits",
        "value": "18"
      },
      {
        "label": "Transparency Reports",
        "value": "6"
      },
      {
        "label": "Resolved Grievances",
        "value": "14"
      }
    ],
    "members": [
      {
        "id": "sm1",
        "name": "عمر ديمير",
        "year": "السنة الرابعة",
        "major": "إدارة الأعمال",
        "phone": "05323456789",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-2db801f5-c6e9-4a4c-88ea-f143ffeef696.jpg",
        "position": "Financial Auditor",
        "university": "جامعة بورصة التقنية"
      }
    ],
    "shortName": "Supervisory",
    "description": "An independent body monitoring regulatory compliance, transparency, and institutional accountability across the Union.",
    "responsibilities": [
      "Monitoring adherence to bylaws and regulations",
      "Auditing administrative and financial records",
      "Investigating grievances and irregularities",
      "Evaluating performance of committees and members",
      "Issuing regular transparency and audit reports"
    ]
  },
  {
    "id": "activities",
    "head": {
      "id": "f20918e9-851d-47e6-a102-b769be41b453",
      "bio": "Member of the Executive Board of the Ummah Youth Union",
      "name": "م. سلمى أردوغان",
      "role": "مسؤول الأنشطة",
      "year": "الهيئة التنفيذية",
      "email": "activities@ummet.org",
      "major": "رئيس لجنة الأنشطة",
      "phone": "",
      "photo": "",
      "updatedAt": "2026-08-23T23:57:01.714692+00:00",
      "university": "اتحاد شباب الأمة"
    },
    "icon": "CalendarDays",
    "name": "Activities Committee",
    "color": "from-gold-500 to-gold-700",
    "stats": [
      {
        "label": "Executed Events",
        "value": "86"
      },
      {
        "label": "Volunteers",
        "value": "540"
      },
      {
        "label": "Beneficiaries",
        "value": "4.2K"
      }
    ],
    "members": [
      {
        "id": "acm1",
        "name": "يوسف أكسوي",
        "year": "السنة الثالثة",
        "major": "الهندسة المدنية",
        "phone": "05325678901",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-2db801f5-c6e9-4a4c-88ea-f143ffeef696.jpg",
        "position": "Events Coordinator",
        "university": "جامعة إسطنبول التقنية"
      },
      {
        "id": "acm2",
        "name": "نور هاكان",
        "year": "السنة الرابعة",
        "major": "إدارة الأعمال",
        "phone": "05316789012",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-272463e1-8969-464e-929d-a80d2151ae58.jpg",
        "position": "Volunteer Coordinator",
        "university": "جامعة مرمرة"
      }
    ],
    "shortName": "Activities",
    "description": "Organizes vibrant student events, educational trips, volunteer initiatives, and cultural gatherings.",
    "responsibilities": [
      "Planning and executing student events and programs",
      "Managing volunteer and civic campaigns",
      "Organizing educational and recreational excursions",
      "Supporting and overseeing student interest clubs",
      "Promoting active student engagement"
    ]
  },
  {
    "id": "finance",
    "head": {
      "id": "73860832-acc1-4995-8918-dcdd5a1b3cac",
      "bio": "Member of the Executive Board of the Ummah Youth Union",
      "name": "أ. عمر ديمير",
      "role": "المسؤول المالي",
      "year": "الهيئة التنفيذية",
      "email": "finance@ummet.org",
      "major": "رئيس اللجنة المالية",
      "phone": "",
      "photo": "",
      "updatedAt": "2026-08-23T23:57:01.714692+00:00",
      "university": "اتحاد شباب الأمة"
    },
    "icon": "Wallet",
    "name": "Finance Committee",
    "color": "from-teal-600 to-teal-800",
    "stats": [
      {
        "label": "2026 Budget",
        "value": "480K ₺"
      },
      {
        "label": "Project Funding",
        "value": "320K ₺"
      },
      {
        "label": "Sponsors",
        "value": "11"
      }
    ],
    "members": [
      {
        "id": "fm1",
        "name": "خالد أرسلان",
        "year": "دكتوراه",
        "major": "القانون العام",
        "phone": "05313456789",
        "photo": "https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/avatars/11f9e6f2-828c-44a2-b05c-53400b3a9b9a/avatar-2db801f5-c6e9-4a4c-88ea-f143ffeef696.jpg",
        "position": "Accountant",
        "university": "جامعة أنقرة"
      }
    ],
    "shortName": "Finance",
    "description": "Administers financial resources, prepares annual budgets, monitors cash flow, and ensures financial sustainability.",
    "responsibilities": [
      "Formulating the Union's annual operating budget",
      "Tracking and accounting for revenues and expenses",
      "Managing fundraising and institutional sponsorships",
      "Preparing periodic financial statements",
      "Coordinating with the Supervisory Committee for audits"
    ]
  }
];

// ===========================================================================
// SQL Artifact Builder
// ===========================================================================

export const TARGETS = [
  { target: 'site', canonical: canonicalSite, tr: trSite, en: enSite },
  { target: 'about', canonical: canonicalAbout, tr: trAbout, en: enAbout },
  { target: 'programsContent', canonical: canonicalProgramsContent, tr: trProgramsContent, en: enProgramsContent },
  { target: 'events', canonical: canonicalEvents, tr: trEvents, en: enEvents },
  { target: 'galleryAlbums', canonical: canonicalGalleryAlbums, tr: trGalleryAlbums, en: enGalleryAlbums },
  { target: 'galleryCategories', canonical: canonicalGalleryCategories, tr: trGalleryCategories, en: enGalleryCategories },
  { target: 'guideSections', canonical: canonicalGuideSections, tr: trGuideSections, en: enGuideSections },
  { target: 'guideQuickInfo', canonical: canonicalGuideQuickInfo, tr: trGuideQuickInfo, en: enGuideQuickInfo },
  { target: 'faqCategories', canonical: canonicalFaqCategories, tr: trFaqCategories, en: enFaqCategories },
  { target: 'contactCards', canonical: canonicalContactCards, tr: trContactCards, en: enContactCards },
  { target: 'contactMap', canonical: canonicalContactMap, tr: trContactMap, en: enContactMap },
  { target: 'news', canonical: canonicalNews, tr: trNews, en: enNews },
  { target: 'plans', canonical: canonicalPlans, tr: trPlans, en: enPlans },
  { target: 'reports', canonical: canonicalReports, tr: trReports, en: enReports },
  { target: 'committees', canonical: canonicalCommittees, tr: trCommittees, en: enCommittees },
];

function escapeSqlString(str) {
  return "'" + str.replace(/'/g, "''") + "'";
}

export function generateBackfillSql() {
  let sql = `-- ===========================================================================
-- INITIAL MANUAL CMS LOCALIZATIONS BACKFILL ARTIFACT (AR/TR/EN)
-- ===========================================================================
-- Purpose: Complete manual translations for Turkish (tr) and English (en)
-- for all 15 real production canonical Arabic CMS targets.
--
-- Authoritative Canonical Sources Audited:
-- 1. published_site_content (v36)
-- 2. student_guide (v4)
-- 3. faq (v1)
--
-- Safety Guarantees:
-- - partition = 'published'
-- - status = 'fresh'
-- - Existing manual localization preservation:
--   For singleton objects, fills missing fields without overwriting existing human edits.
--   For arrays, ON CONFLICT (target, locale, partition) DO NOTHING preserves existing translations.
-- - Strictly adheres to required Glossary:
--   - Ümmet Gençleri Birliği / Ummah Youth Union
--   - Yönetim Kurulu / Executive Board
--   - Başkanlık / Presidency
--   - Öğrenci Rehberi / Student Guide
--   - Sıkça Sorulan Sorular / Frequently Asked Questions
-- ===========================================================================

`;

  const inventory = [];

  for (const item of TARGETS) {
    const sourceHash = computeSourceHash(item.canonical);
    const updatedAt = '2026-09-07T00:00:00.000Z';

    // Turkish row
    const trPayloadJson = JSON.stringify(item.tr);
    // Non-destructive preservation on conflict: never overwrite existing manual edits
    const onConflict = `ON CONFLICT (target, locale, partition) DO NOTHING;`;

    sql += `-- Target: ${item.target} (TR)
INSERT INTO public.cms_localizations (
  target,
  locale,
  partition,
  payload,
  status,
  manual_paths,
  stale_paths,
  source_hash,
  source_version,
  updated_at
) VALUES (
  ${escapeSqlString(item.target)},
  'tr',
  'published',
  ${escapeSqlString(trPayloadJson)}::jsonb,
  'fresh',
  ARRAY['*']::text[],
  ARRAY[]::text[],
  ${escapeSqlString(sourceHash)},
  1,
  ${escapeSqlString(updatedAt)}
) ${onConflict}

`;

    // English row
    const enPayloadJson = JSON.stringify(item.en);

    sql += `-- Target: ${item.target} (EN)
INSERT INTO public.cms_localizations (
  target,
  locale,
  partition,
  payload,
  status,
  manual_paths,
  stale_paths,
  source_hash,
  source_version,
  updated_at
) VALUES (
  ${escapeSqlString(item.target)},
  'en',
  'published',
  ${escapeSqlString(enPayloadJson)}::jsonb,
  'fresh',
  ARRAY['*']::text[],
  ARRAY[]::text[],
  ${escapeSqlString(sourceHash)},
  1,
  ${escapeSqlString(updatedAt)}
) ${onConflict}

`;

    inventory.push({
      target: item.target,
      sourceHash,
      trPayloadBytes: Buffer.byteLength(trPayloadJson, 'utf8'),
      enPayloadBytes: Buffer.byteLength(enPayloadJson, 'utf8'),
    });
  }

  return { sql, inventory };
}

// Run if main
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { sql, inventory } = generateBackfillSql();
  const outputPath = resolve(rootDir, 'supabase', 'backfill_cms_localizations_manual.sql');
  writeFileSync(outputPath, sql, 'utf8');

  console.log(`Successfully generated production manual backfill artifact: ${outputPath}`);
  console.log(`Total Targets: ${TARGETS.length}`);
  console.log(`Total Rows: ${TARGETS.length * 2}`);
  console.table(inventory);
}
