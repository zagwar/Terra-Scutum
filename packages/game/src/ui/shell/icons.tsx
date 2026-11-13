/**
 * Simple icons for the UI shell, drawn in code (no image files, section 12.6):
 * a few geometric shapes per icon on a 16 × 16 grid, filled with the text
 * color. Placeholders [DEFAULT] until the icon generator (F137).
 */
const PATHS: Readonly<Record<string, string>> = {
  // Top bar
  treasury:
    'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9ZM7 5h2v6H7Z',
  politicalCapital: 'M2 14h12v-2H2Zm1-3h10V9H3Zm1-3 4-6 4 6Z',
  influence: 'M2 6h3l6-4v12L5 10H2Zm11-.5h2v5h-2Z',
  legitimacy: 'M8 1 14 3.5v4c0 3.5-2.6 6.3-6 7.5C4.6 13.8 2 11 2 7.5v-4Z',
  stability: 'M1 13h14v2H1Zm2-2h10L8 2Z',
  manpower: 'M8 1.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3.5 15c0-3.5 2-6 4.5-6s4.5 2.5 4.5 6Z',
  pilots: 'M1 9.5 15 4l-3 9-3.5-3L6 13V9.7Z',
  research: 'M6 1h4v1.5H9.3v4L14 14H2l4.7-7.5v-4H6Z',
  food: 'M7 1h2v4c2 0 4 1.5 4 4.5S10.5 15 8 15s-5-2.5-5-5.5S5 5 7 5Z',
  ammo: 'M5 4c0-2 1.5-3 1.5-3S8 2 8 4v10H5Zm4 0c0-2 1.5-3 1.5-3S12 2 12 4v10H9Z',
  fuel: 'M8 1s5 5.5 5 9a5 5 0 0 1-10 0c0-3.5 5-9 5-9Z',
  steel: 'M1 11 4 5h8l3 6Zm0 1h14v2H1Z',
  swarmControl:
    'M8 3a3 3 0 0 1 3 3v4a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3ZM2 5l3 2-3 1Zm12 0-3 2 3 1ZM2 12l3-2v2Zm12 0-3-2v2Z',
  arrival:
    'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9ZM7.2 4.5h1.6v3.2l2.3 2.3-1.1 1.1-2.8-2.8Z',
  // Lenses
  economy: 'M2 14V9h3v5Zm4.5 0V5h3v9Zm4.5 0V2h3v12Z',
  politics: 'M8 1 15 4.5H1Zm-6 4.5h12V7H2Zm1 2.5h2v5H3Zm4 0h2v5H7Zm4 0h2v5h-2ZM1 14h14v1.5H1Z',
  military:
    'M8 1 14 3.5v4c0 3.5-2.6 6.3-6 7.5C4.6 13.8 2 11 2 7.5v-4Zm0 3-1.2 2.5H4l2.3 1.7-.9 2.8L8 9.3 10.6 11l-.9-2.8L12 6.5H9.2Z',
  diplomacy: 'M1 7.5 4 5h3l2 1.5L7 8l1 1 3-2.5 4 1V11l-5 3-3-1.5-6-1Z',
  society:
    'M5 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM1 13c0-3 1.8-5.5 4-5.5S9 10 9 13Zm7 0c0-1.5.5-3 1.2-4 .5-.3 1.1-.5 1.8-.5 2.2 0 4 2.5 4 5.5Z',
  science:
    'M8 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM8 1c1.7 0 3 3.1 3 7s-1.3 7-3 7-3-3.1-3-7 1.3-7 3-7Zm0 1.5C7.2 2.5 6.5 5 6.5 8s.7 5.5 1.5 5.5S9.5 11 9.5 8 8.8 2.5 8 2.5Z',
  space:
    'M9 1c3 0 5 1 6 1-1 0 0 3-1 6l-3 3 .5 3-2 1-1.5-3L5 9.5 2 8l1-2 3 .5 3-3c-1 0 0-2.5 0-2.5Z',
  swarm:
    'M8 3a3 3 0 0 1 3 3v4a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3ZM2 5l3 2-3 1Zm12 0-3 2 3 1ZM2 12l3-2v2Zm12 0-3-2v2Z',
  // Shell buttons
  settings:
    'M7 1h2l.4 2 1.6.7 1.7-1.2 1.4 1.4-1.2 1.7.7 1.6 2 .4v2l-2 .4-.7 1.6 1.2 1.7-1.4 1.4-1.7-1.2-1.6.7L9 15H7l-.4-2-1.6-.7-1.7 1.2-1.4-1.4 1.2-1.7L2.4 9 1 9V7l2-.4.7-1.6-1.2-1.7 1.4-1.4L5.6 3.1 7.2 2.4ZM8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
  messageLog: 'M2 2h12v9H6l-4 3Zm2 2.5v1.5h8V4.5Zm0 3v1.5h6V7.5Z',
  problem: 'M8 1 15 14H1Zm-1 4.5v4.5h2V5.5Zm0 5.5v2h2v-2Z',
  opportunity: 'M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm-1 3h2v5H7Zm0 6h2v2H7Z',
  outliner: 'M2 3h12v2H2Zm0 4h12v2H2Zm0 4h12v2H2Z',
};

export function Icon({ name, className }: { readonly name: string; readonly className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className ?? 'icon'} aria-hidden="true">
      <path d={PATHS[name] ?? PATHS.opportunity} fillRule="evenodd" />
    </svg>
  );
}
