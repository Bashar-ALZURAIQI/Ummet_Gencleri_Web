# خطة تنفيذ الحسابات والمناصب والملفات الشخصية وسجل التعديلات

> **للتنفيذ:** تطبق المهام بالترتيب، مع دورة اختبار أحمر/أخضر لكل سلوك قبل الانتقال إلى المهمة التالية.

**الهدف:** جعل حساب Supabase هو هوية الشخص الثابتة، ونقل المنصب والصلاحيات بين الحسابات بصورة ذرية، مع ملف شخصي وصورة وكلمة مرور حقيقية وسجل تعديلات محمي بحسب المالك.

**المعمارية:** تفصل طبقة المجال بين `auth user` و`profile` و`executive assignment`. تكون Supabase هي مصدر الحقيقة، وتتعامل `AppContext` مع الجلب والمزامنة اللحظية فقط. تعرض الواجهة مكونات ملف وصورة مشتركة، بينما تطبق RLS وRPC الحماية حتى إذا جرى تجاوز الواجهة.

**التقنيات:** React 18، TypeScript، Vite، Supabase Auth/Postgres/Storage/Realtime، Node Test Runner، Tailwind CSS.

**حالة مساحة العمل:** توجد إصلاحات سابقة غير مثبتة في `AppContext.tsx` و`AdminDashboard.tsx` و`CommitteePage.tsx` و`profileNormalize.ts` و`package.json` و`tests/`. يجب البناء فوقها وعدم إرجاعها. لا يستخدم `git add .`، ولا يثبت ملف متداخل قبل مراجعة الفرق الكامل.

---

## المهمة 1: تثبيت نموذج الهوية وسياسات العرض باختبارات نقية

**الملفات:**

- إنشاء: `src/domain/accountIdentity.ts`
- إنشاء: `tests/accountIdentity.test.mjs`
- تعديل: `src/data/mockData.ts`

### الخطوات

1. اكتب اختبارات فاشلة تثبت أن:
   - الدور يأتي من تعيين `user_id` ولا يستنتج من البريد.
   - عدم وجود تعيين يعني `STUDENT` حتى لو احتوى البريد على `president`.
   - الرئيس يرى جميع سجلات التعديل، والعضو يرى السجلات التي يطابق `submittedByUserId` حسابه فقط، والطالب لا يرى السجل.
   - سجل بلا مالك لا يظهر إلا للرئيس.
   - بريد التواصل قابل للتغيير من payload الملف، لكن `loginEmail` و`role` لا يدخلان payload التحديث.
   - التحقق من الصور يقبل `jpeg/png/webp` حتى 5MB ويرفض غير ذلك.
2. شغل `npm test` وتحقق من فشل الاختبارات بسبب عدم وجود الدوال.
3. أنشئ أنواع ودوال نقية:
   - `AccountProfile`
   - `ExecutiveAssignment`
   - `resolveAssignedRole(assignment)`
   - `visibleHistoryFor(entries, viewer)`
   - `sanitizeProfileUpdates(input)`
   - `validateAvatarFile(fileLike)`
4. وسّع `Student` و`CurrentUser` والنماذج المرتبطة لاحقاً لدعم `userId`, `loginEmail`, `contactEmail`, `photo`, `bio` من دون حذف الحقول القديمة قبل اكتمال الترحيل.
5. شغل `npm test`؛ المتوقع نجاح الاختبارات القديمة والجديدة.
6. شغل `npm run typecheck`؛ المتوقع عدم وجود أخطاء TypeScript.

## المهمة 2: إنشاء مخطط Supabase الآمن والقابل للترحيل

**الملفات:**

- إنشاء: `supabase/migrations/20260822000000_identity_roles_profiles_history.sql`
- إنشاء: `tests/supabaseIdentityMigration.test.mjs`

### الخطوات

1. اكتب اختباراً ساكناً فاشلاً يقرأ ملف migration ويتحقق من وجود:
   - أعمدة الملف الجديدة.
   - `executive_assignments` بقيود فريدة على المستخدم والمنصب.
   - `edit_requests` ومعرّفي المرسل والمراجع.
   - RLS لكل الجداول الجديدة.
   - RPC باسم `transfer_executive_assignment`.
   - bucket `avatars` وسياسات المالك.
   - منح صريحة للأدوار المطلوبة، وعدم منح الكتابة لـ `anon`.
2. شغل `npm test` وتحقق من فشل اختبار migration.
3. اكتب migration متكرراً بأمان قدر الإمكان، ويشمل:
   - `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contact_email, bio, avatar_path, updated_at`.
   - فهارس التطبيع المطلوبة للبريد القديم خلال الترحيل.
   - جدول `executive_assignments(user_id uuid, position_key text, committee_key text, assigned_by uuid, assigned_at, updated_at)` مع `UNIQUE(user_id)` و`UNIQUE(position_key)` وقيود مفاتيح المناصب المعروفة.
   - جدول `edit_requests` بالحالة والنصوص والقرار والتواريخ.
   - دالتي تحقق داخليتين `is_current_president()` و`is_current_executive()` مع `search_path` ثابت ومنح مقيدة.
   - RLS: صاحب الملف يعدل ملفه، والرئيس يقرأ دليل الأعضاء؛ صاحب الطلب أو الرئيس يقرآن الطلب؛ الرئيس وحده يقرر؛ لا تعديل مباشر لتعيينات المناصب.
   - View آمنة للحقول العامة فقط، وView عامة للهيئة التنفيذية من دون الهاتف أو الحقول الخاصة.
   - bucket عام للقراءة `avatars`، مع كتابة/حذف داخل مجلد `auth.uid()` فقط.
   - إضافة الجداول اللازمة إلى Realtime publication مع معالجة حالة وجودها مسبقاً.
4. اكتب RPC ذرية `transfer_executive_assignment(position, target_user_id)`:
   - تتحقق أن `auth.uid()` هو الرئيس الحالي وقت التنفيذ.
   - تتحقق أن الهدف حساب موجود ونشط.
   - تقفل صف المنصب، وتزيل تعيين الهدف السابق إن وجد، وتنزل صاحب المنصب الحالي، ثم تسند المنصب للهدف ضمن معاملة واحدة.
   - تسمح بنقل الرئاسة لأن التحقق يحدث قبل إزالة تعيين الرئيس القديم.
   - تعيد تفاصيل القديم والجديد ليستعملها العميل في تحديث الواجهة.
5. رحّل `board_members` إلى التعيينات بواسطة الربط مع `auth.users` على البريد المطبع، وانسخ البريد الحالي إلى `contact_email` عند خلوه. لا تنشئ حسابات تخمينية ولا تحذف صفوفاً غير قابلة للربط.
6. شغل `npm test`؛ المتوقع نجاح فحص migration.
7. لا تطبق migration على مشروع Supabase البعيد قبل توافر ربط CLI أو تنفيذها في لوحة المشروع؛ إنشاء الملف المحلي ليس بديلاً عن التطبيق البعيد.

## المهمة 3: بناء بوابة حسابات Supabase وفصل التحويلات النقية

**الملفات:**

- إنشاء: `src/services/accountService.ts`
- إنشاء: `src/services/editRequestService.ts`
- إنشاء: `src/services/avatarService.ts`
- إنشاء: `src/domain/supabaseMappers.ts`
- إنشاء: `tests/supabaseMappers.test.mjs`
- تعديل: `src/lib/supabase.ts`

### الخطوات

1. اكتب اختبارات فاشلة لتحويل صفوف `profiles` و`executive_assignments` إلى `CurrentUser` و`Student`، بما في ذلك القيم الناقصة.
2. شغل `npm test` وتحقق من الفشل المتوقع.
3. نفذ المحولات النقية، واجعل `user.id` و`user.email` القيمتين المعتمدتين لهوية الحساب وبريد الدخول.
4. نفذ بوابة الحساب بالعمليات:
   - `loadSessionIdentity(session)`.
   - `listAssignableMembers()` للرئيس.
   - `updateOwnProfile(userId, updates)` مع `.select().single()` وإرجاع الصف المؤكد.
   - `transferExecutiveAssignment(position, targetUserId)` باستدعاء RPC.
   - `subscribeToOwnProfileAndAssignment(userId, callback)` مع دالة إلغاء الاشتراك.
   - `changeOwnPassword(loginEmail, currentPassword, newPassword)` بإعادة التحقق ثم `auth.updateUser`.
5. نفذ خدمة الصور:
   - مسار ثابت `USER_ID/avatar.EXT`.
   - رفع مع `upsert`، ثم تحديث `avatar_path` فقط بعد نجاح الرفع.
   - حذف الملف ثم تصفير المسار.
   - توليد رابط عام مع cache-busting من `updated_at`.
6. نفذ خدمة السجل للجلب والإدراج والقرار، ولا تقبل `submitted_by` من نموذج المستخدم؛ تأخذه قاعدة البيانات من الجلسة/السياسة.
7. شغل `npm test` و`npm run typecheck`؛ المتوقع النجاح.

## المهمة 4: استبدال المصادقة المحلية بمصدر حقيقة واحد

**الملفات:**

- تعديل: `src/context/AppContext.tsx`
- تعديل: `src/pages/AuthPages.tsx`
- تعديل: `src/data/mockData.ts`
- تعديل: `tests/presidentIdentity.test.mjs` فقط إذا احتاج توضيح أن helpers القديمة توافقية وليست مصدراً للصلاحية

### الخطوات

1. أضف اختباراً إلى `accountIdentity.test.mjs` يثبت أن البريد الرئيسي القديم لا يحصل على الرئاسة من دون assignment.
2. شغل `npm test` وتأكد أن الاختبار يفشل أمام المنطق الحالي.
3. احذف من مسار التشغيل:
   - `MASTER_EMAIL`, `MASTER_PASSWORD`, `MASTER_ID`.
   - `ensureMasterPresident` وتأثيرات الإصلاح التلقائي.
   - `emailToRole` وfallback المبني على نمط البريد.
   - `boardCredentialFor`, `syncBoardCredentials`, وفتح الطالب المحلي بأي كلمة مرور غير فارغة.
4. اجعل `login` يستعمل `supabase.auth.signInWithPassword` فقط، ثم `loadSessionIdentity` لتحديد اللوحة.
5. اجعل استعادة الجلسة تنتظر تحميل الملف والتعيين قبل إظهار لوحة ذات صلاحية. عند الخطأ لا تمنح دوراً مرتفعاً من cache.
6. اجعل التسجيل ينشئ Supabase Auth ثم صف `profiles`، ولا يخزن كلمة المرور محلياً.
7. أبقِ البيانات المحلية غير الحساسة fallback للعرض أثناء الترحيل، لكن لا تستعملها لتقرير الدور أو قبول كلمة المرور.
8. شغل `npm test`, ثم `npm run typecheck`, ثم `npm run build`؛ المتوقع النجاح.

## المهمة 5: تنفيذ نقل المناصب اللحظي في السياق والواجهة

**الملفات:**

- تعديل: `src/context/AppContext.tsx`
- تعديل: `src/pages/AdminDashboard.tsx`
- تعديل: `src/App.tsx`
- تعديل: `src/components/Navbar.tsx`

### الخطوات

1. غيّر عقد `assignMemberRole` إلى عملية async تعيد `{ok, error, previousHolder, newHolder}`، وسمها `transferMemberRole` إن كان ذلك أوضح.
2. اجعل MembersTab متاحاً للتعديل للرئيس فقط، ويعرض أعضاء Supabase الحقيقيين مع بريد الدخول للقراءة فقط.
3. عند اختيار منصب مشغول، اعرض اسم القديم والجديد. وعند نقل `PRESIDENT` اعرض التحذير المعتمد بأن جميع صلاحيات الرئيس الحالي ستسحب فوراً.
4. لا تحدث القوائم محلياً قبل نجاح RPC. بعد النجاح أعد جلب التعيينات والملف العام.
5. اشترك في Realtime لتعيين المستخدم الحالي:
   - عند خسارة المنصب، اضبط الدور إلى `STUDENT` وانتقل إلى `student-dashboard`.
   - عند اكتساب منصب، حدث الدور واللجنة وانتقل إلى `admin`.
6. شدد حراسة العرض في `App.tsx` وNavbar بحيث لا تبقى شاشة الإدارة مفتوحة بعد فقدان الدور.
7. اختبر يدوياً بحسابين عند توافر قاعدة مطبقة: نقل نائب ثم نقل الرئيس، مع جلسة ثانية مفتوحة.
8. شغل `npm test`, `npm run typecheck`, `npm run build`.

## المهمة 6: إنشاء واجهة ملف شخصي مشتركة وآمنة

**الملفات:**

- إنشاء: `src/components/UserAvatar.tsx`
- إنشاء: `src/components/ProfileSettings.tsx`
- تعديل: `src/pages/AdminDashboard.tsx`
- تعديل: `src/pages/StudentDashboard.tsx`
- تعديل: `src/context/AppContext.tsx`
- تعديل: `src/utils/profileNormalize.ts`

### الخطوات

1. اكتب اختبارات لتطبيع `contactEmail`, `bio`, `photo` والقيم الناقصة في `profileNormalize`.
2. شغل `npm test` وتحقق من الفشل.
3. وسّع التطبيع والأنواع، ثم أنشئ `UserAvatar` الذي يعرض الصورة أو الحرف الأول مع alt مناسب.
4. أنشئ `ProfileSettings` بأقسام:
   - الصورة والمعاينة والرفع/الاستبدال/الحذف.
   - الاسم وبريد التواصل والهاتف والجامعة والتخصص والسنة والنبذة.
   - بريد الدخول والمنصب للقراءة فقط.
   - كلمة المرور الحالية والجديدة والتأكيد.
5. افصل حفظ الملف عن تغيير كلمة المرور حتى لا يؤدي فشل أحدهما إلى نجاح وهمي للآخر.
6. تحقق من تطابق كلمة المرور وتأكيدها، وطول آمن، ورسائل الخطأ العربية.
7. استبدل ProfileTab التنفيذية وEditProfileModal الطلابية بالمكوّن المشترك، مع الإبقاء على رؤية/أهداف اللجنة في قسم مستقل.
8. اجعل `updateOwnProfile`, `uploadOwnAvatar`, `deleteOwnAvatar`, `changeOwnPassword` async وتعيد نتيجة صريحة.
9. شغل `npm test`, `npm run typecheck`, `npm run build`.

## المهمة 7: نشر الاسم والصورة من المصدر الموحد في جميع الواجهات

**الملفات:**

- تعديل: `src/components/Navbar.tsx`
- تعديل: `src/pages/StudentDashboard.tsx`
- تعديل: `src/pages/AdminDashboard.tsx`
- تعديل: `src/pages/BoardPage.tsx`
- تعديل: `src/pages/CommitteePage.tsx`
- تعديل: `src/context/AppContext.tsx`

### الخطوات

1. استبدل دوائر الحرف والصور المباشرة المتفرقة بـ `UserAvatar`.
2. ابنِ بيانات الهيئة العامة من `public_executive_board`/الملفات العامة، لا من رئيس ثابت أو بريد المنصب.
3. عند تعديل الملف المؤكد من Supabase، حدّث `currentUser`, `currentStudent`, `members`, ورأس اللجنة بنفس `userId` لا بمقارنة البريد.
4. اشترك في تحديث الملف الحالي، وأعد جلب بيانات الهيئة العامة عند تغير الملفات أو التعيينات.
5. أبقِ رابط الصورة الافتراضي فقط كحالة fallback، ولا تجعله قيمة محفوظة فوق صورة المستخدم.
6. شغل `npm test`, `npm run typecheck`, `npm run build`.

## المهمة 8: نقل سجل التعديلات والقرارات إلى Supabase وتطبيق خصوصية المالك

**الملفات:**

- تعديل: `src/data/mockData.ts`
- تعديل: `src/context/AppContext.tsx`
- تعديل: `src/components/EditsHistoryPanel.tsx`
- تعديل: `src/components/ProfileEditsPanel.tsx`
- تعديل: `src/components/SiteEditsPanel.tsx`
- تعديل: `src/pages/AdminDashboard.tsx`
- تعديل: `tests/accountIdentity.test.mjs`

### الخطوات

1. وسّع نوع السجل بـ `submittedByUserId`, `reviewedByUserId`, `status`, `decisionNote`, والتواريخ، مع دعم قراءة legacy.
2. اكتب اختباراً يفشل إذا استطاع عضو رؤية سجل Member آخر له اسم أو منصب مماثل.
3. اجعل إرسال تعديل الموقع/الملف ينشئ `edit_requests` بمعرّف المستخدم الحالي.
4. اجعل قرار الرئيس يحدث الصف نفسه بدلاً من إنشاء سجل محلي مجهول المالك.
5. حمّل السجل من Supabase؛ تعتمد الواجهة على RLS أولاً وتطبق `visibleHistoryFor` كحماية عرض إضافية.
6. يعرض الرئيس عداد الجميع، ويعرض العضو عداد طلباته فقط. لا تظهر تبويبة السجل للطالب.
7. عند وجود سجل localStorage قديم:
   - اربطه بالمستخدم إذا وجد تطابق موثوق ببريد المرسل.
   - غير القابل للربط يبقى legacy ولا يظهر إلا للرئيس.
   - لا تعيد استيراد السجل نفسه أكثر من مرة؛ استخدم مفتاح migration/version.
8. شغل `npm test`, `npm run typecheck`, `npm run build`.

## المهمة 9: تنظيف المسارات القديمة وحماية التوافق

**الملفات:**

- تعديل: `src/context/AppContext.tsx`
- تعديل: `src/data/mockData.ts`
- تعديل: `supabase/functions/setup-board-accounts/index.ts`
- تعديل: `README.md`
- تعديل: `.gitignore` عند الحاجة فقط، من دون كشف `.env`

### الخطوات

1. أزل مصفوفة كلمات المرور التجريبية من bundle وأي تخزين محلي لكلمات المرور.
2. حوّل `setup-board-accounts` من seed ذي كلمة مرور مشتركة إلى أداة ترحيل إدارية لا تعمل من العميل، أو وثّق إيقافها إذا لم تعد لازمة.
3. ابحث باستخدام:

   ```powershell
   rg -n "MASTER_PASSWORD|MASTER_EMAIL|demoAccounts|app_credentials|emailToRole|password.length > 0" src supabase
   ```

   المتوقع: لا نتائج في مسار التشغيل؛ يسمح فقط بتعليق migration موثق إن لزم.
4. وثق في README:
   - تطبيق migrations.
   - إعداد bucket/Realtime.
   - أن بريد الدخول غير قابل للتغيير من الملف.
   - خطوات اختبار نقل الرئيس بحسابين.
5. تحقق أن `.env` غير متتبعة ولا تظهر قيمها في أي فرق.

## المهمة 10: التحقق النهائي ومراجعة الأمان

**الملفات:** كل الملفات المعدلة في المهام السابقة.

### الخطوات

1. شغل مجموعة التحقق الكاملة:

   ```powershell
   npm test
   npm run typecheck
   npm run lint
   npm run build
   git diff --check
   ```

2. المتوقع:
   - جميع الاختبارات ناجحة.
   - لا أخطاء TypeScript.
   - لا أخطاء ESLint جديدة؛ عالج الموجود المرتبط بالتغيير ولا توسع في تنظيف غير متعلق.
   - نجاح Vite build.
   - لا أخطاء مسافات أو conflict markers.
3. راجع يدوياً السيناريوهات الأساسية:
   - خيرالله نائب ثم تحويله إلى طالب، وأحمد نائب بالبريد وكلمة المرور نفسيهما.
   - نقل الرئاسة مع التحذير وتبدل اللوحتين فورياً.
   - تعديل بريد التواصل من دون تغير بريد الدخول.
   - رفع/استبدال/حذف الصورة وظهورها في Navbar والهيئة واللجنة وجهاز ثانٍ.
   - تغيير كلمة المرور ثم نجاح الجديدة وفشل القديمة.
   - عضو يرى سجلاته فقط والرئيس يرى الجميع.
4. راجع سياسات RLS بطلبات مباشرة من حساب رئيس وعضو وطالب وanon إن كانت بيئة Supabase متاحة.
5. افحص `git diff` ملفاً ملفاً. لا تخلط تغييرات المستخدم السابقة في commit من دون مراجعتها، ولا تنفذ deployment بعيداً من دون ربط المشروع وصلاحية صريحة.

## مراجعة ذاتية للخطة

- تغطي الهوية والمنصب والبريد وكلمة المرور والصورة والسجل ضمن نموذج واحد.
- تبدأ كل طبقة قابلة للاختبار باختبار فاشل ثم أقل تنفيذ ناجح.
- تطبق الحماية في قاعدة البيانات والواجهة معاً.
- تحافظ على الحسابات والبيانات الحالية ولا تعتمد على حذف تلقائي.
- تفصل تطبيق migration محلياً عن نشره فعلياً إلى Supabase.
- تحافظ على الإصلاحات السابقة في مساحة العمل وتمنع staging واسعاً.
