'use client';
import { accents, templates, appearanceOf, type Appearance } from '@/lib/card-appearance';

export function AppearanceEditor({ draft, saved, onChange, onSave, disabled, fields }: { draft: Appearance; saved: Appearance; onChange: (value: Appearance) => void; onSave: () => void; disabled: boolean; fields: Record<string, string[]> }) {
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const errors = ['template_key', 'theme_settings', 'theme_settings.mode', 'theme_settings.accent'].flatMap(key => fields[key] ?? []);
  return <section className="editor-section appearance-editor" aria-labelledby="appearance-heading">
    <h2 id="appearance-heading" tabIndex={-1}>Appearance</h2>
    <p className="section-help">Try a new look in the preview. Select Save appearance to apply it. Profile edits are saved separately. On a published card, saved appearance changes are public immediately.</p>
    <button type="button" className="button button-secondary preview-jump" onClick={() => document.getElementById('preview-heading')?.focus()}>Show live preview</button>
    <form onSubmit={event => { event.preventDefault(); onSave(); }}>
      <fieldset disabled={disabled} aria-describedby={errors.length ? 'appearance-errors' : undefined}>
        <fieldset className="appearance-group"><legend>Template</legend><div className="template-choices">{templates.map(template => <label className="template-choice" key={template.key}>
          <input type="radio" name="template" value={template.key} checked={draft.template_key === template.key} onChange={() => onChange({ ...draft, template_key: template.key })} />
          <span><strong>{template.label}</strong><span className="template-description">{template.description}</span></span>
        </label>)}</div></fieldset>
        <fieldset className="appearance-group"><legend>Appearance mode</legend><div className="appearance-options">{(['light', 'dark'] as const).map(mode => <label key={mode}><input type="radio" name="appearance-mode" checked={draft.theme_settings.mode === mode} onChange={() => onChange({ ...draft, theme_settings: { ...draft.theme_settings, mode } })} /><span>{mode === 'light' ? 'Light' : 'Dark'}</span></label>)}</div></fieldset>
        <fieldset className="appearance-group"><legend>Accent colour</legend><div className="appearance-options">{accents.map(accent => <label key={accent}><input type="radio" name="accent" checked={draft.theme_settings.accent === accent} onChange={() => onChange({ ...draft, theme_settings: { ...draft.theme_settings, accent } })} /><span className={`accent-swatch swatch-${accent}`} aria-hidden="true" /><span>{accent[0].toUpperCase() + accent.slice(1)}</span></label>)}</div></fieldset>
        {errors.length > 0 && <p id="appearance-errors" className="field-error">{errors.join(' ')}</p>}
        <div className="editor-actions"><button type="submit" className="button button-primary">Save appearance</button><button type="button" className="button button-secondary" onClick={() => onChange(appearanceOf())}>Reset appearance</button><button type="button" className="button button-secondary" disabled={!dirty} onClick={() => onChange(saved)}>Discard appearance changes</button></div>
        <p className="field-hint">{dirty ? 'Unsaved appearance changes' : 'Appearance up to date'}</p>
      </fieldset>
    </form>
  </section>;
}
