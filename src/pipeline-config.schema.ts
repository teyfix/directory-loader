import { z } from 'zod';

const strings = z.array(z.string().min(1));
const path = z.array(
  z.union([
    z.strictObject({ strip: strings.min(1) }),
    z.strictObject({
      recase: z.strictObject({
        casing: z.enum(['camel', 'kebab', 'pascal', 'snake']),
        skip: z.number().int().nonnegative().default(0),
      }),
    }),
    z.strictObject({ redirect: z.record(z.string().min(1), z.string()) }),
  ]),
);
const validation = z.strictObject({
  icu: z.strictObject({
    referenceLocale: z.string().min(1),
    locales: strings.min(1).optional(),
  }),
});
const operations = {
  files: strings.min(1).optional(),
  exclude: strings.optional(),
  path: path.optional(),
  metadata: z.enum(['preserve', 'omit']).optional(),
  validation: validation.optional(),
};
const output = z.union([
  z.strictObject({
    ...operations,
    format: z.literal('json'),
    directory: z.string().min(1),
    types: z.boolean().default(false),
  }),
  z.strictObject({
    ...operations,
    format: z.literal('json'),
    file: z.string().min(1),
    types: z.boolean().default(false),
  }),
  z.strictObject({
    ...operations,
    format: z.literal('arb'),
    directory: z.string().min(1),
  }),
]);

export const configSchema = z.strictObject({
  $schema: z.string().optional(),
  root: z.string().min(1),
  ...operations,
  outputs: z
    .record(z.string().min(1), output)
    .refine(
      (outputs) => Object.keys(outputs).length > 0,
      'At least one output is required',
    )
    .meta({ minProperties: 1 }),
});

export type PipelineConfig = z.input<typeof configSchema>;
