import { getRequestConfig } from 'next-intl/server';
import { catalogues } from '../generated';

function isLocale(value: unknown): value is keyof typeof catalogues {
  return typeof value === 'string' && Object.hasOwn(catalogues, value);
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isLocale(requested) ? requested : 'en';
  return { locale, messages: catalogues[locale] };
});
