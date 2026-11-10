import type { catalogues, Messages } from './generated';

declare module 'next-intl' {
  interface AppConfig {
    Locale: keyof typeof catalogues;
    Messages: Messages;
  }
}
