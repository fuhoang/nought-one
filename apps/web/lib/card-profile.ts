import type { ThemeSettings } from './card-appearance';

// Presentation-only data, shared by the server page and the owner's local preview.
export type CardProfile = {
  slug: string;
  display_name: string;
  job_title: string | null;
  company: string | null;
  bio: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  location: string | null;
  template_key: string;
  theme_settings?: ThemeSettings | null;
  links: { type: string; label: string; url: string }[];
  assets: { type: 'avatar' | 'logo'; url: string }[];
};
