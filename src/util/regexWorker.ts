import {
  type MessagePort,
  Worker,
  isMainThread,
  parentPort,
} from 'node:worker_threads'

import { isMatch } from 'super-regex'

interface WorkerData {
  port: MessagePort
  regex: RegExp
  text: string
  timeout: number
}

type WorkerResult =
  | {
      success: true
      result: boolean
    }
  | {
      success: false
      error: Error
    }

let worker: Worker | null = null

if (isMainThread) {
  worker = new Worker(new URL(import.meta.url))
} else {
  parentPort?.on('message', (data: WorkerData) => {
    const { port, regex, text, timeout } = data

    try {
      const result = isMatch(regex, text, { timeout })
      port.postMessage({ success: true, result } as WorkerResult)
    } catch (e) {
      port.postMessage({ success: false, error: e } as WorkerResult)
    } finally {
      port.close()
    }
  })
}

/**
 * Use a worker thread to perform the regex match to avoid stopping the main thread event loop.
 * @param regex The regex to run the match with
 * @param text The text to match against
 * @param timeout The timeout (in ms) before aborting the match. The match will return false.
 * @returns true if the regex matches the text within the given timeout, false if the match fails or times out.
 */
export function workerMatch(
  regex: RegExp,
  text: string,
  timeout = 500,
): Promise<boolean> {
  if (!worker) throw new Error('Worker is not initialized')

  return new Promise<boolean>((resolve, reject) => {
    const subChannel = new MessageChannel()

    subChannel.port2.on('message', (data: WorkerResult) => {
      subChannel.port2.close()

      if (data.success) {
        resolve(data.result)
      } else {
        reject(data.error)
      }
    })

    subChannel.port2.on('error', (error) => {
      subChannel.port2.close()
      // Old worker died, create a new one
      worker = new Worker(import.meta.url)
      reject(error)
    })

    worker?.postMessage(
      {
        port: subChannel.port1,
        regex,
        text,
        timeout,
      },
      [subChannel.port1],
    )
  })
}
