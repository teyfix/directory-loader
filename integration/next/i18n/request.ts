import { getRequestConfig } from 'next-intl/server';
import { catalogues } from '../generated';

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = (await requestLocale) === 'tr' ? 'tr' : 'en';
  return { locale, messages: catalogues[locale] };
});
