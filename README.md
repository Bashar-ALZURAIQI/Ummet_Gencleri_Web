# Ümmet Gençleri Web (اتحاد شباب الأمة)

Official website and management platform of Ümmet Gençleri.
تطبيق React وSupabase لإدارة حسابات الطلاب، ملفاتهم العامة، الهيئة التنفيذية، طلبات الانضمام، وسجل التعديلات والقرارات.

## Technology

- React
- TypeScript
- Vite
- Tailwind CSS
- Supabase

## Local Development

Install dependencies:

```bash
npm install
```

Start development server:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Run test suite:

```bash
npm test
npm run typecheck
npm run lint
```

## متطلبات التشغيل والبيئة (Environment Variables)

- Node.js 22 أو أحدث.
- Supabase project حقيقي ومربوط بهذه النسخة قبل تطبيق أي تغيير على قاعدة البيانات.
- Create a local `.env` file:

```text
VITE_SUPABASE_URL=<your-project-url>
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_VAPID_PUBLIC_KEY=<your-public-vapid-key>
```

Never commit `.env` or private credentials. لا يوضع مفتاح إداري أو سري في متغيرات `VITE_` أو في كود المتصفح. ملف `.env` مستثنى من التتبع.

## إشعارات الطلاب المقبولين (Web Push)

الميزة متاحة حصرياً للطالب الذي حالته الرسمية `accepted` وملفه `active`. لا يظهر زر الاشتراك للزائر أو للطلب المعلق أو المقابلة أو المرفوض أو المطرود. رسائل المقابلة والقبول والرفض تستمر عبر البريد الإلكتروني فقط.

ولّد زوج VAPID مرة واحدة واحتفظ به دائماً؛ تغيير الزوج يلغي الاشتراكات القديمة:

```text
npx --yes web-push@3.6.5 generate-vapid-keys --json
```

ضع المفتاح العام فقط في `.env`:

```text
VITE_VAPID_PUBLIC_KEY=<publicKey>
```

وفي Supabase Dashboard افتح **Edge Functions > Secrets** وأضف:

```text
VAPID_PUBLIC_KEY=<publicKey>
VAPID_PRIVATE_KEY=<privateKey>
VAPID_SUBJECT=mailto:president@ummet.org
PUSH_WEBHOOK_SECRET=<random-32-byte-base64url-value>
```

المفتاح الخاص و`PUSH_WEBHOOK_SECRET` لا يوضعان في `.env` الخاص بـVite ولا في أي متغير يبدأ بـ`VITE_`.

للتشغيل المحلي للدالة، أنشئ ملفاً محلياً مستثنى باسم `supabase/functions/.env.local` بالقيم الأربع السابقة، ثم شغّل:

```text
npx supabase functions serve send-web-push --env-file supabase/functions/.env.local
```

بعد تطبيق ملفات migration ونشر `send-web-push`، أضف قيمتين في **Supabase Vault** بالأسماء الدقيقة التالية:

```text
accepted_student_push_webhook_url=https://rscunkzvbsdbjzhnuria.supabase.co/functions/v1/send-web-push
accepted_student_push_webhook_secret=<نفس قيمة PUSH_WEBHOOK_SECRET>
```

ينشئ migration الخاص بـ`secure_accepted_student_push_dispatch` مشغّل `pg_net` على حدث `INSERT` في
`public.push_notifications` ويقرأ العنوان والسر من Vault. لا تنشئ Webhook ثانياً من الواجهة، حتى لا يتم إرسال الإشعار مرتين.

يعمل Service Worker على `localhost` باعتباره سياقاً آمناً للتطوير. في الإنتاج يلزم HTTPS. على iPhone وiPad يلزم iOS/iPadOS 16.4 أو أحدث وإضافة الموقع إلى الشاشة الرئيسية ثم فتحه من الأيقونة قبل الضغط على «تفعيل الإشعارات».

## إعداد Supabase

طبّق ملفات `supabase/migrations` بالترتيب على المشروع الصحيح بعد مراجعته وربطه. الترحيل الرئيسي يجهز ما يلي:

- ملفات `profiles` المرتبطة بمعرّف Auth UUID.
- مناصب `executive_assignments` المنفصلة عن بيانات الملف.
- سجل `edit_requests` بسياسات RLS.
- bucket عام باسم `avatars` للعرض، مع رفع وتعديل وحذف داخل مجلد UUID الخاص بصاحب الحساب فقط، وحد 5MB وصيغ JPEG وPNG وWebP.
- قنوات Realtime اللازمة لتحديث الملف والمنصب ودليل الهيئة العام.
- سياسات طلبات الطلاب: الطالب يقرأ طلبه فقط، والرئيس الحالي يقرأ جميع الطلبات؛ لا يوجد INSERT أو UPDATE أو DELETE مباشر من المتصفح.
- RPCs محمية للرئيس لجدولة المقابلة واتخاذ القرار. قبول الطلب يحدّث `profiles.status='active'` للـUUID نفسه داخل المعاملة ذاتها.

بعد تطبيق migrations، تأكد من إعدادات Data API ومن إضافة الجداول المطلوبة إلى Realtime في المشروع المستهدف. لا تفترض أن قاعدة بعيدة محدثة لمجرد وجود ملفات SQL محليًا.

## تهيئة الرئيس الأول

في قاعدة جديدة لا يوجد رئيس يستطيع منح الصلاحيات بعد. أنشئ أولًا حساب الرئيس بالطريقة العادية في Supabase Auth، ثم نفّذ الإجراء التالي مرة واحدة فقط من SQL Editor بصلاحية مالك المشروع، بعد استبدال UUID بالمعرّف الحقيقي لذلك الحساب. لا يُنفذ هذا من المتصفح ولا يوضع له مفتاح إداري في التطبيق.

```sql
DO $bootstrap_first_president$
DECLARE
  v_first_president uuid := '00000000-0000-4000-8000-000000000000'::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_first_president) THEN
    RAISE EXCEPTION 'The selected Auth user does not exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.executive_assignments
    WHERE position_key = 'PRESIDENT'
  ) THEN
    RAISE EXCEPTION 'A president is already assigned';
  END IF;

  INSERT INTO public.executive_assignments (
    user_id, position_key, committee_key, assigned_by
  ) VALUES (
    v_first_president, 'PRESIDENT', 'presidency', NULL
  );

  UPDATE public.profiles
  SET status = 'active'
  WHERE id = v_first_president;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected Auth profile does not exist';
  END IF;
END
$bootstrap_first_president$;
```

بعد نجاح التهيئة، كل نقل لاحق للرئاسة أو للمناصب يتم من واجهة الرئيس عبر RPC المحمية، ولا يُعاد تشغيل إجراء التهيئة.

## الحساب والملف الشخصي

- بريد الدخول محفوظ في Supabase Auth وغير قابل للتغيير من صفحة الملف.
- البريد للتواصل حقل عام مستقل ويمكن لصاحب الحساب تعديله دون تغيير بريد الدخول.
- الاسم والجامعة والتخصص والسنة والهاتف والنبذة والصورة بيانات ملف قابلة للتعديل من صاحب الحساب.
- يمكن رفع صورة للملف أو حذفها، وتظهر الصورة والبيانات العامة في المواضع العامة بعد تأكيد الخادم.
- تغيير كلمة المرور يثبت كلمة المرور الحالية في جلسة معزولة ثم يغيّر كلمة مرور الحساب نفسه؛ لا توجد كلمة مرور مشتركة أو تجريبية.

## نقل المناصب

المنصب والصلاحية مرتبطان بصف `executive_assignments` ومعرّف المستخدم UUID، وليس بالبريد أو الاسم.

لاختبار نقل الرئيس بحسابين:

1. سجّل الدخول بحساب الرئيس الحالي.
2. اختر حسابًا طالبًا نشطًا مختلفًا وانقل إليه منصب الرئيس، ثم وافق على سحب الصلاحيات.
3. يجب أن تتحول جلسة الرئيس السابق إلى طالب عادي فور تحديث الهوية.
4. سجّل الدخول بالحساب الثاني باستخدام بريد الدخول وكلمة المرور الخاصين به؛ يجب أن تظهر له لوحة وصلاحيات الرئيس.
5. أعد فتح الموقع أو سجّل الخروج والدخول على جهاز آخر وتأكد أن الاسم والصورة والمنصب بقيت متزامنة من Supabase.

تغيير الاسم أو البريد للتواصل لا ينقل المنصب، وتغيير المنصب لا يغيّر بيانات تسجيل الدخول.

## طلبات الانضمام

إنشاء المستخدم والملف ونسخة طلب الانضمام يتم من trigger مرتبط بـAuth، وليس عبر INSERT من المتصفح. تعرض الواجهة فقط الصفوف التي تسمح بها RLS، وتنتظر نتيجة RPC قبل إظهار نجاح الجدولة أو القرار. لا تستخدم `localStorage` كمصدر لطلبات الطلاب أو قراراتها.

## سجل التعديلات والقرارات

- الرئيس الحالي يرى سجل التعديلات والقرارات كاملًا.
- كل عضو حالي في الهيئة التنفيذية يرى التعديلات التي قدمها UUID الخاص به فقط.
- الطالب والزائر لا يريان السجل.
- السجل المحلي القديم غير الموثق لا يمنح ملكية أو صلاحية، ويظل ظاهرًا للرئيس فقط عند الحاجة إلى المراجعة.

## المسار الإداري القديم

الدالة `setup-board-accounts` disabled نهائيًا وتعيد HTTP 410. لا تنشئ حسابات، ولا تحمل عناوين دخول جاهزة، ولا تستخدم كلمة مرور مشتركة. إنشاء الحسابات يتم عبر Supabase Auth، ونقل المناصب يتم عبر RPC الرئيس المراجع.

## التحقق المحلي والأمان (Security & Verification)

Administrative operations are protected by Supabase authentication,
Row Level Security and server-side authorization.

```text
npm test
npm run typecheck
npm run lint
npm run build
```

هذه الأوامر تتحقق من قواعد الهوية، RLS/RPCs، دورة الصورة وكلمة المرور، وعدم رجوع مسارات الدخول التجريبية.
