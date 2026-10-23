import type { ReactElement } from 'react'
import type {
  PublicAdapterContributions,
  PublicAdapterSlot,
} from '@publisher/content'

export function AdapterHeadContributions({
  contributions,
}: Readonly<{ contributions: PublicAdapterContributions }>): ReactElement {
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

export function AdapterSlot({
  slot,
  contributions,
}: Readonly<{
  slot: PublicAdapterSlot
  contributions: PublicAdapterContributions
}>): ReactElement | null {
  const tokens = contributions.slots.filter((token) => token.slot === slot)
  if (tokens.length === 0) return null
  return (
    <aside className="adapter-slot" data-adapter-slot={slot}>
      {tokens.map((token) => (
        <p key={token.key}>{token.label}</p>
      ))}
    </aside>
  )
}
