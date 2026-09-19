import { isThemeId, themeIds, type ThemeId } from '@publisher/content'
import type { ThemeDefinition } from './themes/definition'
import { editorial } from './themes/editorial'
import { signal } from './themes/signal'

export type { ThemeDefinition } from './themes/definition'

/**
 * Registry of deployable visual themes; each entry owns its full stylesheet.
 * The ids are the content contract's `themeIds`; a theme without a
 * stylesheet, or a stylesheet without an id, fails at module load.
 */
export const themes: Readonly<Record<ThemeId, ThemeDefinition>> = Object.freeze(
  Object.fromEntries(
    themeIds.map((id) => {
      const theme = [editorial, signal].find((entry) => entry.id === id)
      if (!theme) throw new Error(`Theme ${id} has no stylesheet`)
      return [id, theme]
    }),
  ) as Record<ThemeId, ThemeDefinition>,
)

export function getTheme(themeId: string): ThemeDefinition {
  return isThemeId(themeId) ? themes[themeId] : themes.editorial
}
