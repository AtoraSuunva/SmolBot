import { toSnakeCase } from '../format.js'

/**
 * Maps permission human-readable keys to their bit values.
 */
export const Permission = {
  /** POST /token/create */
  CreateToken: 1 << 0,
  /** GET /action-log/:guildId/:userId */
  ReadActionLog: 1 << 1,
}

/**
 * Maps permission bits to their human-readable descriptions.
 */
export const PermissionDescription: Record<(typeof Permission)[keyof typeof Permission], string> = {
  [Permission.CreateToken]: 'Create a new token (POST /api/token/create)',
  [Permission.ReadActionLog]: 'Read action log (GET /api/action-log/:guildId/:userId)',
}

/**
 * Maps permission keys to their command options to easily create slash commands.
 */
export const PermissionCommandOptions = Object.entries(Permission).map(([key, value]) => ({
  permissionKey: key as keyof typeof Permission,
  name: toSnakeCase(key),
  description: PermissionDescription[value],
}))

/**
 * Maps permission bitfields to their human-readable names.
 */
export function permissionBitfieldToStrings(bitfield: number): string[] {
  return Object.entries(Permission)
    .filter(([, value]) => bitfield & value)
    .map(([key]) => key)
}
