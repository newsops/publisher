import type { DashboardActions, DashboardState } from './AdminDashboardView'
import type { DashboardSetters } from './useAdminDashboard'
import type { AdminArticleVariant } from './admin-model'
import * as articleAction from './article-actions'

function updateVariantAction(
  state: DashboardState,
  setters: DashboardSetters,
): DashboardActions['updateVariant'] {
  return (field, value) => {
    if (field === 'locale' && typeof value === 'string')
      setters.setActiveLocale(value)
    setters.setArticle((current) => {
      if (!current) return current
      const variants = current.variants.map((variant) =>
        variant.locale === state.activeLocale
          ? { ...variant, [field]: value }
          : variant,
      )
      return { ...current, variants }
    })
  }
}

function addVariantAction(
  setters: DashboardSetters,
): DashboardActions['addVariant'] {
  return () => {
    setters.setArticle((current) => {
      if (!current) return current
      const now = new Date().toISOString()
      const variant: AdminArticleVariant = {
        locale: 'new',
        slug: '',
        title: '',
        excerpt: '',
        bodyMarkdown: '',
        bodyHtml: '',
        seoTitle: '',
        seoDescription: '',
        status: 'draft',
        revision: 0,
        publishedAt: now,
        updatedAt: now,
      }
      setters.setActiveLocale('new')
      return { ...current, variants: [...current.variants, variant] }
    })
  }
}

function saveVariantAction(
  state: DashboardState,
  setters: DashboardSetters,
): DashboardActions['saveVariant'] {
  return async () => {
    const variant = state.article?.variants.find(
      (item) => item.locale === state.activeLocale,
    )
    if (state.article && variant)
      await articleAction.saveArticleVariant(
        state.article,
        variant,
        setters.setArticle,
        setters.setMessage,
      )
  }
}

function removeVariantAction(
  state: DashboardState,
  setters: DashboardSetters,
): DashboardActions['removeVariant'] {
  return async () => {
    if (state.article && state.activeLocale)
      await articleAction.removeArticleVariant(
        state.article,
        state.activeLocale,
        setters.setArticle,
        setters.setMessage,
      )
  }
}

export function variantActions(
  state: DashboardState,
  setters: DashboardSetters,
): Pick<
  DashboardActions,
  | 'setActiveLocale'
  | 'updateVariant'
  | 'addVariant'
  | 'saveVariant'
  | 'removeVariant'
> {
  return {
    setActiveLocale: setters.setActiveLocale,
    updateVariant: updateVariantAction(state, setters),
    addVariant: addVariantAction(setters),
    saveVariant: saveVariantAction(state, setters),
    removeVariant: removeVariantAction(state, setters),
  }
}
