/**
 * Country flags (F138, designer decision: real flags). The pictures come from
 * the `flag-icons` package (MIT licence; the flag designs are public domain),
 * 4:3 SVG files. Vite copies each one into the build as its own file
 * (`assetsInlineLimit` in `vite.config.ts` keeps them out of the code), so a
 * flag is only downloaded when it is shown. Which flag each country shows is
 * data: `data/country_flags.json`.
 */
const FLAG_FILES = import.meta.glob<string>('../../../../node_modules/flag-icons/flags/4x3/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
});

/** Flag code ("de") → URL of its picture. */
const FLAG_URLS: ReadonlyMap<string, string> = new Map(
  Object.entries(FLAG_FILES).map(([path, url]) => [
    path.slice(path.lastIndexOf('/') + 1, -'.svg'.length),
    url,
  ]),
);

/** The URL of a flag's picture, or undefined for an unknown code. */
export function flagUrl(code: string): string | undefined {
  return FLAG_URLS.get(code);
}

/**
 * A country's flag. Falls back to the country's map color when there is no
 * picture for its code (the data checks make sure every country has a code).
 */
export function Flag({
  code,
  color,
  className,
  testId,
}: {
  /** The flag code from `data/country_flags.json`, for example "de". */
  readonly code: string | undefined;
  /** The country's map color, shown when there is no picture. */
  readonly color: string;
  readonly className?: string;
  readonly testId?: string;
}) {
  const url = code ? flagUrl(code) : undefined;
  const classes = `flag ${className ?? ''}`.trim();
  if (!url)
    return (
      <span
        className={`${classes} flag-fallback`}
        style={{ backgroundColor: color }}
        data-testid={testId}
        aria-hidden="true"
      />
    );
  return (
    <img
      className={classes}
      src={url}
      alt=""
      draggable={false}
      data-testid={testId}
      data-flag={code}
    />
  );
}
