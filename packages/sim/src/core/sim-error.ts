/**
 * An error the sim can explain to the player. Carries a translation key and
 * parameters (never a finished sentence); the UI turns it into text.
 */
export type TextParams = Readonly<Record<string, string | number>>;

export class SimError extends Error {
  readonly key: string;
  readonly params: TextParams;

  constructor(key: string, params: TextParams = {}, detail?: string) {
    super(detail ? `${key}: ${detail}` : key);
    this.name = 'SimError';
    this.key = key;
    this.params = params;
  }
}
