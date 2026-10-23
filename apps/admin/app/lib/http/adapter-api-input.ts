import { ApiRequestError } from './api-error'
import { objectValue } from './api-input'

function configurationValue(value: unknown): Record<string, unknown> {
  const object = objectValue(value)
  if (
    Object.keys(object).some(
      (key) => key !== 'adapterId' && key !== 'configuration',
    )
  )
    throw new ApiRequestError(
      'unknown_fields',
      'Unknown adapter input field',
      400,
    )
  if (
    !object.configuration ||
    typeof object.configuration !== 'object' ||
    Array.isArray(object.configuration)
  )
    throw new ApiRequestError(
      'invalid_field',
      'configuration must be a JSON object',
      400,
    )
  return object.configuration as Record<string, unknown>
}

export function parseAdapterCreateInput(value: unknown): {
  adapterId: string
  configuration: Record<string, unknown>
} {
  const object = objectValue(value)
  if (typeof object.adapterId !== 'string' || !object.adapterId)
    throw new ApiRequestError(
      'invalid_field',
      'adapterId must be a string',
      400,
    )
  return {
    adapterId: object.adapterId,
    configuration: configurationValue(value),
  }
}

export function parseAdapterConfiguration(
  value: unknown,
): Record<string, unknown> {
  return configurationValue(value)
}
