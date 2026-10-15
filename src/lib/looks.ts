export const LOOK_IDS = ['classic', 'forest', 'boho', 'modern', 'cypherpunk'] as const;
export type Look = (typeof LOOK_IDS)[number];

export type AccentColor = 'rose' | 'orange' | 'green';

export interface LookPreview {
  bg: string;
  fg: string;
  accent: string;
  muted: string;
  font: string;
  radius: string;
}

export interface LookMeta {
  id: Look;
  name: string;
  blurb: string;
  preview: LookPreview;
}

export const LOOKS: LookMeta[] = [
  {
    id: 'classic',
    name: 'Classic',
    blurb: 'The original stall. IBM Plex and rose.',
    preview: {
      bg: '#fafafa',
      fg: '#141414',
      accent: '#ff2d8a',
      muted: '#eaeaea',
      font: '"IBM Plex Mono", ui-monospace, monospace',
      radius: '8px',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    blurb: 'Moss, pine, and cream paper.',
    preview: {
      bg: '#f6f3ea',
      fg: '#1a2e24',
      accent: '#2f7558',
      muted: '#e6e0d0',
      font: '"Source Serif 4 Variable", Georgia, serif',
      radius: '12px',
    },
  },
  {
    id: 'boho',
    name: 'Boho',
    blurb: 'Linen, terracotta, and a warm serif.',
    preview: {
      bg: '#f7f1e9',
      fg: '#34251d',
      accent: '#c65d2e',
      muted: '#eadccb',
      font: '"Fraunces Variable", Georgia, serif',
      radius: '16px',
    },
  },
  {
    id: 'modern',
    name: 'Modern',
    blurb: 'Clean Inter, open space, indigo.',
    preview: {
      bg: '#fbfcfd',
      fg: '#14161c',
      accent: '#5b54e6',
      muted: '#e8eaf0',
      font: '"Outfit Variable", Inter, sans-serif',
      radius: '14px',
    },
  },
  {
    id: 'cypherpunk',
    name: 'Cypherpunk',
    blurb: 'Neon on black. Terminal energy. Best in dark.',
    preview: {
      bg: '#070d0b',
      fg: '#7aefb8',
      accent: '#00ff80',
      muted: '#12201a',
      font: '"JetBrains Mono Variable", ui-monospace, monospace',
      radius: '2px',
    },
  },
];

export function isLook(value: unknown): value is Look {
  return typeof value === 'string' && (LOOK_IDS as readonly string[]).includes(value);
}

/**
 * Named website look. A saved look always wins.
 * Older accent-only configs map green to Forest and orange to Boho.
 * Everyone else lands on Modern so the stall feels fresher by default.
 */
export function resolveLook(look?: Look, accentColor?: AccentColor): Look {
  if (isLook(look)) return look;
  if (accentColor === 'green') return 'forest';
  if (accentColor === 'orange') return 'boho';
  return 'modern';
}
