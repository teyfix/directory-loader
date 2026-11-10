import { createTranslator } from 'next-intl';
import messages from './generated/en.json';

const t = createTranslator({ locale: 'en', messages });
t('home.greeting', { name: 'Ada' });
// @ts-expect-error Interpolation arguments cannot be omitted.
t('home.greeting');
// @ts-expect-error Generated literals require the named argument.
t('home.greeting', { other: 'Ada' });
// @ts-expect-error Unknown message keys are rejected.
t('home.missing');
// @ts-expect-error Plurals require a numeric argument.
t('home.items', { count: 'three' });
// @ts-expect-error Rich tags must be supplied.
t.rich('web.rich', { name: 'Ada' });
