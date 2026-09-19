/**
 * Theme identifiers are part of the content contract: a snapshot records
 * which theme a publication selected. The stylesheets themselves belong to
 * the presentation owner, `packages/publication`.
 */
export const themeIds = ['editorial', 'signal'] as const

export type ThemeId = (typeof themeIds)[number]

export function isThemeId(value: string): value is ThemeId {
  return (themeIds as readonly string[]).includes(value)
}
