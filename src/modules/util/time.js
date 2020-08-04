const MS_SEC  = 1000,
      MS_MIN  = MS_SEC * 60,
      MS_HOUR = MS_MIN * 60,
      MS_DAY  = MS_HOUR * 24,
      MS_WEEK = MS_DAY * 7,
      MS_YEAR = MS_WEEK * 52

const toShrt = (str) => (str === 'milli' ? 'ms' : str[0])
const plural = (num, str, post) => num + ' ' + str + (num===1?'':'s') + (post||'')

const timeStr = (time, mod, str, short, post = ', ') => (!short ?
    (time ? plural(time % mod, str, post) : '') :
    (time ? (time % mod) + toShrt(str) + post : '')
  )

const Time = {
  since(date) {
    return {
      get millis () { return Date.now() - date },
      get seconds() { return Math.floor(this.millis / MS_SEC  )},
      get minutes() { return Math.floor(this.millis / MS_MIN  )},
      get hours  () { return Math.floor(this.millis / MS_HOUR )},
      get days   () { return Math.floor(this.millis / MS_DAY  )},
      get weeks  () { return Math.floor(this.millis / MS_WEEK )},
      get years  () { return Math.floor(this.millis / MS_YEAR )},

      format({short = false, trim = false} = {}) {
        const t = timeStr(this.years  , this.years + 1, 'year', short) +
                  timeStr(this.weeks  , 52, 'week', short) +
                  timeStr(this.days   , 7, 'day', short) +
                  timeStr(this.hours  , 24, 'hour', short) +
                  timeStr(this.minutes, 60, 'minute', short) +
                  timeStr(this.seconds, 60, 'second', short) +
                  timeStr(this.millis , 1000, 'milli', short, '')

        return (trim === false) ? t : Time.trim(t, trim)
      }
    }
  },

  trim(time, places = 3) {
    return time.split(',').filter((v, i) => i < places).join(',')
  }
}

module.exports = Time
