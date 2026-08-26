import { isMainThread, type MessagePort, parentPort, Worker } from 'node:worker_threads'

import functionTimeout, { isTimeoutError } from 'function-timeout'

/**
 * Perform a regex match with a timeout. If the match takes longer than the timeout, it will return false.
 *
 * Lifted from https://github.com/sindresorhus/super-regex because the web-worker dependency was giving a mysterious error:
 * > TypeError: Cannot destructure property 'mod' of 'threads.workerData' as it is undefined.
 *
 * I wrote my own worker implementation anyway for more control and `isMatch` was the only function I used (which was a simple wrapper around `functionTimeout`) so I just lifted it out
 *
 * @param regex The regex to match with
 * @param text The string to match against
 * @param options The timeout before considering the match a failure
 * @returns True if the string matches the regex, false if it does not or times out
 */
function isMatch(regex: RegExp, text: string, options: { timeout: number }): boolean {
  try {
    return functionTimeout(() => structuredClone(regex).test(text), {
      timeout: options.timeout,
    })()
  } catch (e) {
    if (isTimeoutError(e)) {
      return false
    }
    throw e
  }
}

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
      port.postMessage({ success: true, result } satisfies WorkerResult)
    } catch (e) {
      const error = Error.isError(e) ? e : new Error(String(e))
      port.postMessage({ success: false, error } satisfies WorkerResult)
    } finally {
      port.close()
    }
  })
}

/**
 * Use a worker thread to perform the regex match to avoid stopping the main thread event loop.
 *
 * !!! IMPORTANT !!!
 * Until this is merged https://github.com/vitejs/vite/pull/21160 you MUST import this function using an import function, like:
 *
 * ```ts
 * const { workerMatch } = await import('../helpers/regexWorker.js')
 * ```
 *
 * Otherwise, Vite does not handle the worker splitting correctly and can put the worker in the same chunk as other code.
 *
 * This can lead to the worker thread created containing non-worker code, which can include the entrypoint code itself, effectively running the entire application twice!!!
 *
 * Using an import function forces Vite to split the worker into a separate chunk, ensuring that the worker thread only contains worker code.
 *
 * @param regex The regex to run the match with
 * @param text The text to match against
 * @param timeout The timeout (in ms) before aborting the match. The match will return false.
 * @returns true if the regex matches the text within the given timeout, false if the match fails or times out.
 */
export function workerMatch(regex: RegExp, text: string, timeout = 500): Promise<boolean> {
  if (!worker) {
    worker = new Worker(new URL(import.meta.url))
  }

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
      worker = new Worker(new URL(import.meta.url))
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
