import { ApiRequestError } from './api-error'
import { objectValue } from './api-input'

function configurationValue(value: unknown): Record<string, unknown> {
  const object = objectValue(value)
  if (
    Object.keys(object).some(
      (key) => key !== 'pluginId' && key !== 'configuration',
    )
  )
    throw new ApiRequestError(
      'unknown_fields',
      'Unknown plugin input field',
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

export function parsePluginCreateInput(value: unknown): {
  pluginId: string
  configuration: Record<string, unknown>
} {
  const object = objectValue(value)
  if (typeof object.pluginId !== 'string' || !object.pluginId)
    throw new ApiRequestError('invalid_field', 'pluginId must be a string', 400)
  return {
    pluginId: object.pluginId,
    configuration: configurationValue(value),
  }
}

export function parsePluginConfiguration(
  value: unknown,
): Record<string, unknown> {
  return configurationValue(value)
}
