function createAutoHandler(defaultObj = 0) {
  return {
    get(t, p, r) {
      if (!t.hasOwnProperty(p))
        t[p] = defaultObj
      return t[p]
    }
  }
}


module.exports = (obj, def = 0) => new Proxy(obj, createAutoHandler(def))
