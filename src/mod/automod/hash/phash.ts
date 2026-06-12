import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

type PhashFunction = (image?: Buffer, options?: unknown) => Promise<string>
type DistanceFunction = (a: string, b: string) => number

const compute = require('sharp-phash') as PhashFunction
const distance = require('sharp-phash/distance') as DistanceFunction

export function computeImagePhash(image: Buffer): Promise<string> {
  return compute(image)
}

export function phashDistance(a: string, b: string): number {
  return distance(a, b)
}
