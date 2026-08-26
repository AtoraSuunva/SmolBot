import path from 'node:path'

import { User, type ChatInputCommandInteraction } from 'discord.js'
import env from 'env-var'

/**
 * Convert a binary string (e.g. a 64-bit phash string) into its hex representation.
 *
 * This mirrors `_binary_array_to_hex` from python-imagehash for flattened bit arrays.
 *
 * @param binaryString String containing only `0` and `1` characters.
 * @returns Lowercase hex string, left-padded to the expected nibble width.
 */
export function bitstringToHex(binaryString: string): string {
  const bitString = binaryString.trim()

  if (!bitString) {
    throw new Error('binaryString is empty')
  }

  if (!/^[01]+$/.test(bitString)) {
    throw new Error('binaryString must contain only 0 and 1 characters')
  }

  const width = Math.ceil(bitString.length / 4)
  const value = BigInt(`0b${bitString}`)

  return value.toString(16).padStart(width, '0')
}

/**
 * Internal function to convert a hex string back into a binary array.
 *
 * Does the inverse of `_binary_array_to_hex` from here: https://github.com/JohannesBuchner/imagehash/blob/master/imagehash/__init__.py
 *
 * Can be used to import these hashes: https://github.com/multiplicitypoe/discord-crypto-spam-destroyer/blob/main/data/bad_hashes.txt
 *
 * @param hexString Hex string (with or without `0x` prefix).
 * @param nBits Original number of bits before hex nibble-padding.
 *              If omitted, returns all bits represented by the hex string (len * 4).
 * @param shape Optional 2D shape for reshaping the flat bit array.
 * @returns Array of 0/1 bits (flat or 2D if shape is provided).
 */
export function hexToBitstring(hexString: string, nBits?: number): string {
  let hs = hexString.trim().toLowerCase()
  if (hs.startsWith('0x')) hs = hs.slice(2)
  if (!hs) throw new Error('hexString is empty')
  if (!/^[0-9a-f]+$/i.test(hs)) throw new Error('hexString contains invalid characters')

  const totalBits = hs.length * 4

  // Build full padded bit string nibble-by-nibble to preserve leading zeros.
  let bitString = ''
  for (const ch of hs) {
    const nibble = parseInt(ch, 16).toString(2).padStart(4, '0')
    bitString += nibble
  }

  // Remove left-padding introduced by hex width rounding, if requested.
  if (nBits !== undefined) {
    if (!Number.isInteger(nBits) || nBits < 0 || nBits > totalBits) {
      throw new Error(`nBits must be an integer between 0 and ${totalBits}`)
    }
    bitString = bitString.slice(totalBits - nBits)
  }

  const flat = Array.from(bitString, (b) => (b === '1' ? 1 : 0))

  return flat.join('')
}

/**
 * Takes a string that might be either a hex phash or a binary phash and returns a binary phash
 *
 * If the input is a hex string, it will be converted to binary. If it's already a binary string, it will be returned as is.
 *
 * @param phash The input phash string, either in hex or binary format.
 * @returns A binary string representation of the phash.
 * @throws An error if the input string is not a valid hex or binary phash.
 */
export function ensureBitstringPhash(phash: string): string {
  const trimmed = phash.trim()

  if (/^[0-9a-fA-F]+$/.test(trimmed)) {
    return hexToBitstring(trimmed)
  } else if (/^[01]+$/.test(trimmed)) {
    return trimmed
  } else {
    throw new Error('Invalid phash format: must be a hex string or a binary string')
  }
}

/**
 * Check if the user who triggered the interaction is an owner of the application, either directly or through being a team member.
 * @param interaction The interaction to check
 * @returns If the user who triggered the interaction is an owner of the application
 */
export function isAppOwner(interaction: ChatInputCommandInteraction) {
  const appOwner = interaction.client.application?.owner

  if (!appOwner) {
    return false
  }

  if (appOwner instanceof User) {
    return interaction.user.id === appOwner.id
  }

  // If the owner is a team, check if the user is a member of the team
  return (
    appOwner.owner?.id === interaction.user.id ||
    appOwner.members.some((member) => member.user.id === interaction.user.id)
  )
}

/**
 * Convert a MIME type to a file extension.
 * @param contentType MIME type
 * @returns The file extension for the MIME type or "unknown" if it can't be determined
 */
export function contentTypeToExtension(contentType: string | null): string {
  if (!contentType) {
    return 'unknown'
  }

  const ext = contentType.split(';')[0]

  switch (ext) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    case 'image/bmp':
      return 'bmp'
    case 'image/png':
      return 'png'
    default:
      return contentType.split('/')[1] || 'unknown'
  }
}

/**
 * Sanitize a filename by replacing any non-alphanumeric characters (except for ., _, and -) with underscores.
 * The sanitized filename will be truncated to a maximum of 120 characters.
 * If the filename is null or only composed of invalid characters, null will be returned.
 * @param fileName The file name to sanitize
 * @returns The file name with any non-alphanumeric/._- replaced with _, or null if the filename is null or only composed of invalid characters
 */
export function sanitizeFileName(fileName: string | null): string | null {
  if (!fileName) {
    return null
  }

  const cleaned = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
  return cleaned.length > 0 ? cleaned : null
}

const PHASH_IMAGE_PATH = env.get('PHASH_IMAGE_PATH').asString()

/**
 * Get the path to the image file associated with a given phash.
 * @param phash The phash of the image
 * @returns The path to the image
 */
export function getPhashImagePath(phash: string, contentType: string): string | null {
  if (!PHASH_IMAGE_PATH) {
    return null
  }

  const extension = contentTypeToExtension(contentType)

  return path.join(PHASH_IMAGE_PATH, `${phash}.${extension}`)
}

export function getFileName(filePath: string): string {
  return path.basename(filePath)
}
