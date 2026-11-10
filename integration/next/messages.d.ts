import type { Messages } from './generated';

declare module 'next-intl' {
  interface AppConfig {
    Locale: 'en' | 'tr';
    Messages: Messages;
  }
}
