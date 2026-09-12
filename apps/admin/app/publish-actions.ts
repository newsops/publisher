import type { Dispatch, SetStateAction } from 'react'
import { adminFetch } from './admin-client'

export async function publishSnapshot(
  setMessage: Dispatch<SetStateAction<string>>,
): Promise<void> {
  const response = await adminFetch('/api/publish', {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  })
  const data = (await response.json()) as {
    snapshotId?: string
    error?: string
  }
  setMessage(
    response.ok
      ? `발행 스냅샷 생성: ${data.snapshotId}`
      : `발행 실패: ${data.error ?? response.status}`,
  )
}
