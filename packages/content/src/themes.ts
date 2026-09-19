import type { ThemeDefinition } from './themes/definition'
import { editorial } from './themes/editorial'
import { signal } from './themes/signal'

export type { ThemeDefinition } from './themes/definition'

/** Registry of deployable visual themes; each entry owns its full stylesheet. */
export const themes: Readonly<Record<string, ThemeDefinition>> = Object.freeze(
  Object.fromEntries([editorial, signal].map((theme) => [theme.id, theme])),
)

export function getTheme(themeId: string): ThemeDefinition {
  return themes[themeId] ?? themes.editorial
}

export function isThemeId(value: string): boolean {
  return value in themes
}
