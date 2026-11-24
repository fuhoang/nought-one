export const templates = [
  { key: 'minimal', label: 'Minimal', description: 'The original. Quiet details and generous space.' },
  { key: 'centered', label: 'Centered', description: 'A balanced introduction with a centered portrait.' },
  { key: 'compact', label: 'Compact', description: 'A concise header with your details close at hand.' },
] as const;
export const accents = ['neutral', 'slate', 'forest', 'navy'] as const;
export type TemplateKey = typeof templates[number]['key'];
export type ThemeSettings = { mode: 'light' | 'dark'; accent: typeof accents[number] };
export type Appearance = { template_key: TemplateKey; theme_settings: ThemeSettings };

// Treat missing, older and unsupported API values as the original appearance.
export function appearanceOf(card?: { template_key?: unknown; theme_settings?: unknown } | null): Appearance {
  const theme = card?.theme_settings && typeof card.theme_settings === 'object' && !Array.isArray(card.theme_settings)
    ? card.theme_settings as Record<string, unknown> : {};
  return {
    template_key: templates.some(item => item.key === card?.template_key) ? card!.template_key as TemplateKey : 'minimal',
    theme_settings: {
      mode: theme.mode === 'dark' ? 'dark' : 'light',
      accent: accents.includes(theme.accent as ThemeSettings['accent']) ? theme.accent as ThemeSettings['accent'] : 'neutral',
    },
  };
}

export function safeWebsite(value: string | null | undefined): string | null {
  if (!value || /[\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
