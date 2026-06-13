import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

type PhashFunction = (image?: Uint8Array<ArrayBuffer>, options?: unknown) => Promise<string>
type DistanceFunction = (a: string, b: string) => number

const compute = require('sharp-phash') as PhashFunction
const distance = require('sharp-phash/distance') as DistanceFunction

export async function computeImagePhash(image: Uint8Array<ArrayBuffer>): Promise<string> {
  const phash = await compute(image)

  if (phash === '0000000000000000000000000000000000000000000000000000000000000000') {
    throw new Error(
      'The computed phash is all zeroes, your image is likely too large or in an unsupported format',
    )
  }

  return phash
}

export function phashDistance(a: string, b: string): number {
  return distance(a, b)
}
