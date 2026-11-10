import { getTranslations } from 'next-intl/server';

export default async function Page() {
  const en = await getTranslations({ locale: 'en' });
  const tr = await getTranslations({ locale: 'tr' });
  const de = await getTranslations({ locale: 'de' });
  return (
    <main>
      <p>{en('home.greeting', { name: 'Ada' })}</p>
      <p>{tr('home.greeting', { name: 'Ada' })}</p>
      <p>{de('home.greeting', { name: 'Ada' })}</p>
      <p>{en('home.items', { count: 1 })}</p>
      <p>{en('home.items', { count: 3 })}</p>
      <p>{tr('home.items', { count: 3 })}</p>
      <p>{de('home.items', { count: 1 })}</p>
      <p>{de('home.items', { count: 3 })}</p>
      <p>{en('home.choice', { role: 'admin' })}</p>
      <p>{tr('home.choice', { role: 'admin' })}</p>
      <p>{de('home.choice', { role: 'other' })}</p>
      <p>
        {en.rich('web.rich', {
          name: 'Ada',
          link: (chunks) => <a href="/guide">{chunks}</a>,
        })}
      </p>
      <p>
        {de.rich('web.rich', {
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
