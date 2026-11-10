import { getTranslations } from 'next-intl/server';

export default async function Page() {
  const en = await getTranslations({ locale: 'en' });
  const tr = await getTranslations({ locale: 'tr' });
  return (
    <main>
      <p>{en('home.greeting', { name: 'Ada' })}</p>
      <p>{tr('home.greeting', { name: 'Ada' })}</p>
      <p>{en('home.items', { count: 1 })}</p>
      <p>{en('home.items', { count: 3 })}</p>
      <p>{tr('home.items', { count: 3 })}</p>
      <p>{en('home.choice', { role: 'admin' })}</p>
      <p>{tr('home.choice', { role: 'admin' })}</p>
      <p>
        {en.rich('web.rich', {
          name: 'Ada',
          link: (chunks) => <a href="/guide">{chunks}</a>,
        })}
      </p>
      <p>
        {tr.rich('web.rich', {
          name: 'Ada',
          link: (chunks) => <a href="/guide">{chunks}</a>,
        })}
      </p>
    </main>
  );
}
