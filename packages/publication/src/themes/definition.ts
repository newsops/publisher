export interface ThemeDefinition {
  readonly id: string
  readonly name: string
  readonly version: string
  /** Complete, self-hosted stylesheet: tokens followed by presentation rules. */
  readonly css: string
}
