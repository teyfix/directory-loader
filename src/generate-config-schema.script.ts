import { z } from 'zod';
import { configSchema } from './pipeline-config.schema';

await Bun.write(
  new URL('../config.schema.json', import.meta.url),
  `${JSON.stringify(z.toJSONSchema(configSchema), null, 2)}\n`,
);
