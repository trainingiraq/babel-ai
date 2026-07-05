# بابل AI

نسخة MVP لتطبيق شات مستقل يعمل محليا. الواجهة موجودة في `public/`، والخادم المحلي في `serve.ps1`.

توجد أيضا نسخة قابلة للاستضافة عبر `server.js` و`package.json`.

## التشغيل

تأكد أن `.env.local` يحتوي على:

```text
OPENAI_API_KEY=...
APP_ACCESS_CODE=...
OPENAI_MODEL=gpt-5.4-nano
DAILY_REQUEST_LIMIT=50
```

### تشغيل محلي على ويندوز

ثم شغل:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1 -Port 5173
```

وافتح:

```text
http://127.0.0.1:5173/
```

### تشغيل نسخة الاستضافة محليا إذا كان Node.js مثبتا

```powershell
npm start
```

ثم افتح:

```text
http://127.0.0.1:5174/
```

## التحكم والحماية الأساسية

الإعدادات الخاصة موجودة في `.env.local`:

```text
OPENAI_API_KEY=...
APP_ACCESS_CODE=...
DAILY_REQUEST_LIMIT=50
```

- `APP_ACCESS_CODE`: كود الدخول الذي تدخله في الواجهة قبل استخدام الشات.
- `DAILY_REQUEST_LIMIT`: عدد الطلبات اليومي قبل إيقاف الاستخدام مؤقتا.
- لتغيير كود الدخول، شغل `Set Access Code.cmd`.

## النشر

راجع:

```text
DEPLOY_RENDER.md
```

الموقع الجاهز للاستضافة يستخدم `server.js`. لا ترفع `.env.local` ولا تضع مفتاح OpenAI داخل GitHub أو داخل ملفات المشروع.

## الملفات

- `serve.ps1`: خادم محلي يقرأ المفتاح من `.env.local` ويتصل بـ OpenAI.
- `server.js`: خادم Node.js قابل للنشر على Render أو Railway.
- `package.json`: إعداد تشغيل Node.js.
- `render.yaml`: إعداد مبدئي للنشر على Render.
- `public/index.html`: واجهة التطبيق.
- `public/styles.css`: تصميم الواجهة.
- `public/app.js`: منطق المحادثة في المتصفح.
- `gpt-instructions.md`: تعليمات جاهزة لبناء GPT داخل ChatGPT.

## ملاحظات قبل النشر العام

هذه نسخة محلية للتجربة. قبل النشر العام نحتاج إضافة تسجيل دخول أو حدود استخدام أقوى، مراقبة التكلفة، صفحة خصوصية، شروط استخدام، وسيرفر منشور لا يكشف مفتاح OpenAI للمتصفح.
