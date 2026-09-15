import presentationData from './data/theme-presentation.json'
import themeData from './data/themes.json'

const xPostEmbedCss = `
.publisher-x-post { margin: 32px 0; padding: 22px 24px; border: 1px solid var(--rule); border-radius: 4px; background: var(--wash); }
.publisher-x-post blockquote { margin: 0; padding: 0; border: 0; color: var(--ink); font: 600 20px/1.5 var(--serif); }
.publisher-x-post blockquote p { margin: 0; }
.publisher-x-post figcaption { margin-top: 14px; color: var(--meta); font: 700 12px/1.4 var(--sans); letter-spacing: .03em; }
.publisher-x-post figcaption a { color: var(--accent); }
@media (max-width: 560px) { .publisher-x-post { padding: 18px; } .publisher-x-post blockquote { font-size: 18px; } }
`

const presentationCss = `${presentationData.rules.join('\n')}\n${xPostEmbedCss}`

export interface ThemeDefinition {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly css: string
}

export const themes = Object.fromEntries(
  themeData.map((theme) => [
    theme.id,
    { ...theme, css: `${theme.css}\n${presentationCss}` },
  ]),
) as Readonly<Record<string, ThemeDefinition>>

export function getTheme(themeId: string): ThemeDefinition {
  return themes[themeId] ?? themes.editorial
}

export function isThemeId(value: string): boolean {
  return value in themes
}
