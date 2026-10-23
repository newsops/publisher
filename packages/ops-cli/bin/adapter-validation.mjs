export class AdapterValidationInputError extends Error {
  /** @param {'MALFORMED_RESPONSE' | 'ADAPTER_REVISION_CONFLICT'} code */
  constructor(code) {
    super(code)
    this.code = code
  }
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Capture the exact installed public configuration, not an unverified response
 * or a newer revision than the operator selected. Validation remains prospective
 * on the API; no configuration/state mutation is implicit in this read.
 * @param {import('@publisher/admin-client').PublisherAdminClient} api
 * @param {string} siteId
 * @param {string} adapterId
 * @param {number} revision
 * @returns {Promise<Record<string, unknown>>}
 */
export async function installedAdapterConfiguration(
  api,
  siteId,
  adapterId,
  revision,
) {
  const { data } = await api.getAdapter(siteId, adapterId)
  if (
    !isRecord(data) ||
    data.siteId !== siteId ||
    !isRecord(data.adapter) ||
    data.adapter.siteId !== siteId ||
    data.adapter.adapterId !== adapterId ||
    typeof data.adapter.revision !== 'number' ||
    !Number.isSafeInteger(data.adapter.revision) ||
    data.adapter.revision < 1 ||
    !isRecord(data.adapter.configuration)
  )
    throw new AdapterValidationInputError('MALFORMED_RESPONSE')
  if (data.adapter.revision !== revision)
    throw new AdapterValidationInputError('ADAPTER_REVISION_CONFLICT')
  return data.adapter.configuration
}
