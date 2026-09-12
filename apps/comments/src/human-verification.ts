import type { HumanVerifier } from './types'

interface VerificationResponse {
  success: boolean
}

export function createHumanVerifier(
  endpoint: string | undefined,
  secret: string | undefined,
  fetcher: typeof fetch = fetch,
): HumanVerifier {
  return {
    async verify(token, remoteIp) {
      if (!endpoint || !secret || !token) return false
      const url = new URL(endpoint)
      if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1')
        throw new Error('Human-verification endpoint must use HTTPS')
      const body = new URLSearchParams({ secret, response: token })
      if (remoteIp) body.set('remoteip', remoteIp)
      const response = await fetcher(url, { method: 'POST', body })
      if (!response.ok) return false
      const result = (await response.json()) as VerificationResponse
      return result.success === true
    },
  }
}
