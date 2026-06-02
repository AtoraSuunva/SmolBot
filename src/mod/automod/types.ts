type AutomodParameterPrimitiveValue = string | number | boolean
type AutomodParameterValue =
  | AutomodParameterPrimitiveValue
  | AutomodParameterPrimitiveValue[]
  | null
type AutomodParameters = Record<string, AutomodParameterValue>

declare global {
  namespace PrismaJson {
    export { AutomodParameters }
  }
}

export { AutomodParameterPrimitiveValue, AutomodParameterValue, AutomodParameters }
