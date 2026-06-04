/**
 * A keyed mutex implementation. Useful for ensuring that only one operation is performed on a given key at a time.
 *
 * Can be used with `using` to always ensure that locks are released
 *
 * @example
 * const mutex = new KeyedMutex<GuildMember>()
 *
 * async function processMember(member: GuildMember) {
 *   using lock = mutex.tryAcquire(member)
 *
 *   if (!lock) {
 *     // Another operation is already processing this member, skip it
 *     return
 *   }
 *
 *   // We are the only one processing this member, safe to do stuff with them
 *   await doSomethingWith(member)
 *
 *  // lock is automatically released at the end of scope
 * }
 */
export class KeyedMutex<Key> {
  private mutexes = new Set<Key>()

  acquire(key: Key): MutexLock {
    const lock = this.tryAcquire(key)
    if (lock) {
      return lock
    }

    throw new Error('Failed to acquire mutex lock')
  }

  tryAcquire(key: Key): MutexLock | null {
    if (this.mutexes.has(key)) {
      return null
    }

    this.mutexes.add(key)
    return new MutexLock(() => this.mutexes.delete(key))
  }
}

export class MutexLock implements Disposable {
  constructor(private readonly release: () => void) {}

  dispose() {
    this.release()
  }

  [Symbol.dispose] = this.dispose.bind(this)
}
