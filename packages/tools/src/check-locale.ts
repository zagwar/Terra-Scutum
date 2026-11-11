/**
 * Checks a locale file (`locales/en.json`): a flat list of translation keys
 * and their texts. Returns a list of problems (empty if the file is fine).
 */
const KEY_PATTERN = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

export function checkLocale(content: unknown): string[] {
  if (typeof content !== 'object' || content === null || Array.isArray(content)) {
    return ['the file must be a JSON object of "KEY": "text" pairs'];
  }
  const problems: string[] = [];
  for (const [key, text] of Object.entries(content)) {
    if (!KEY_PATTERN.test(key)) {
      problems.push(
        `${key}: keys are written in capitals with underscores, like NEWS_PROVINCE_FALLEN`,
      );
    }
    if (typeof text !== 'string') {
      problems.push(`${key}: the text must be a string`);
    } else if (text.trim() === '') {
      problems.push(`${key}: the text is empty`);
    } else if (!bracesAreBalanced(text)) {
      problems.push(`${key}: unbalanced { } in "${text}" (placeholders look like {name})`);
    }
  }
  return problems;
}

function bracesAreBalanced(text: string): boolean {
  return text.replace(/\{[A-Za-z][A-Za-z0-9]*\}/g, '').search(/[{}]/) === -1;
}
