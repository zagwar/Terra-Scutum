import { z } from 'zod';
import type { DataCrossCheck } from '../data/game-data';

/**
 * Government types (section 8.12), `data/government_types.json`. The list is
 * [DEFAULT]: the designer can change it in data. What each type changes
 * (who has to agree to a law, coup risk, mobilization…) comes with the
 * politics features; for now a type only has a kind.
 */
const id = z
  .string()
  .regex(/^[a-z0-9]+(_[a-z0-9]+)*$/, 'ids are lowercase letters, digits and single underscores');

/**
 * `democracy`: laws need parties' seats and elections are held; `autocracy`:
 * laws need the clout of the interest groups in power; `corporate`: run by
 * corporations (section 8.12, "Corporate governments").
 */
export const GOVERNMENT_KINDS = ['democracy', 'autocracy', 'corporate'] as const;
export type GovernmentKind = (typeof GOVERNMENT_KINDS)[number];

/** `data/government_types.json` */
export const governmentTypesFileSchema = z.strictObject({
  governmentTypes: z
    .array(z.strictObject({ id, kind: z.enum(GOVERNMENT_KINDS) }))
    .min(1, 'at least one government type is needed'),
});

export type GovernmentTypesFile = z.infer<typeof governmentTypesFileSchema>;
export type GovernmentTypeData = GovernmentTypesFile['governmentTypes'][number];

/** Translation key of a government type's name, for example `GOVERNMENT_TYPE_MILITARY_JUNTA`. */
export const governmentTypeNameKey = (governmentTypeId: string) =>
  `GOVERNMENT_TYPE_${governmentTypeId.toUpperCase()}`;

/** Every government type id appears once. */
export const checkGovernmentTypes: DataCrossCheck = (data, report) => {
  const seen = new Map<string, number>();
  data.governmentTypes.governmentTypes.forEach((g, index) => {
    const first = seen.get(g.id);
    if (first === undefined) seen.set(g.id, index);
    else
      report({
        file: 'government_types.json',
        path: `governmentTypes.${index}.id`,
        message: `duplicate id "${g.id}" (also at governmentTypes.${first})`,
      });
  });
};
