import type { ReactElement } from 'react'
import type {
  PublicPluginContributions,
  PublicPluginSlot,
} from '@publisher/content'

export function PluginHeadContributions({
  contributions,
}: Readonly<{ contributions: PublicPluginContributions }>): ReactElement {
  return (
    <>
      {contributions.head.map((token) =>
        token.kind === 'meta' ? (
          <meta key={token.key} name={token.name} content={token.content} />
        ) : (
          <script
            async={token.async !== false}
            key={token.key}
            src={token.src}
          />
        ),
      )}
    </>
  )
}

export function PluginSlot({
  slot,
  contributions,
}: Readonly<{
  slot: PublicPluginSlot
  contributions: PublicPluginContributions
}>): ReactElement | null {
  const tokens = contributions.slots.filter((token) => token.slot === slot)
  if (tokens.length === 0) return null
  return (
    <aside className="plugin-slot" data-plugin-slot={slot}>
      {tokens.map((token) => (
        <p key={token.key}>{token.label}</p>
      ))}
    </aside>
  )
}
