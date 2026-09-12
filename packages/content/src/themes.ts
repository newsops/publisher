import themeData from './data/themes.json'

export interface ThemeDefinition {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly css: string
}

export const themes = Object.fromEntries(
  themeData.map((theme) => [theme.id, theme]),
) as Readonly<Record<string, ThemeDefinition>>

export function getTheme(themeId: string): ThemeDefinition {
  return themes[themeId] ?? themes.editorial
}

export function isThemeId(value: string): boolean {
  return value in themes
}
