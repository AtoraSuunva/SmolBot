type AutomodParameterPrimitiveValue = string | number | boolean
type AutomodParameterValue =
  | AutomodParameterPrimitiveValue
  | AutomodParameterPrimitiveValue[]
  | null
type AutomodParameters = Record<string, AutomodParameterValue>
type AutomodIgnoredChannels = string[]
type AutomodIgnoredRoles = string[]
type AutomodIgnoredUsers = string[]

declare global {
  namespace PrismaJson {
    export { AutomodParameters, AutomodIgnoredChannels, AutomodIgnoredRoles, AutomodIgnoredUsers }
  }
}

export {
  AutomodParameterPrimitiveValue,
  AutomodParameterValue,
  AutomodParameters,
  AutomodIgnoredChannels,
  AutomodIgnoredRoles,
  AutomodIgnoredUsers,
}
