# Nawafith Internal

نظام داخلي خاص للبحث في أرشيف نوافذ بعد حفظ البيانات محلياً.

## التشغيل
- Node.js 22
- Entry file: `server.js`
- Build command: `npm install`
- Start command: `npm start`

## البيانات
الأرشيف SQLite للقراءة فقط، ويحتوي على 53,547 صفحة محفوظة و17,400 سجل منظم. يتم تجهيز قاعدة البيانات أثناء `npm install`.

## الأمان
لا يتم حفظ كلمات المرور أو ملف `.env` الحقيقي داخل Git. ضع القيم السرية ضمن Environment Variables في Hostinger.

راجع `.env.example` و`README_HOSTINGER.txt` لإعداد النشر.
