const AutoProp = require('./AutoProp')
const Rule = require('./Rule')

/** Function that count occurrences of a substring in a string;
 * @param {String} string               The string
 * @param {String} subString            The sub string to search for
 * @param {Boolean} [allowOverlapping]  Optional. (Default:false)
 *
 * @author Vitim.us https://gist.github.com/victornpb/7736865
 * @see Unit Test https://jsfiddle.net/Victornpb/5axuh96u/
 * @see http://stackoverflow.com/questions/4009756/how-to-count-string-occurrence-in-string/7924240#7924240
 */
function occurrences(string, subString, allowOverlapping) {
    string += "";
    subString += "";
    if (subString.length <= 0) return (string.length + 1);

    var n = 0,
        pos = 0,
        step = allowOverlapping ? 1 : subString.length;

    while (true) {
        pos = string.indexOf(subString, pos);
        if (pos >= 0) {
            ++n;
            pos += step;
        } else break;
    }
    return n;
}

function countOcc(str, arr) {
  str = str.toLowerCase()
  return arr.map(v => occurrences(str, v)).reduce((a, b) => a + b, 0)
}

// longass arabic char, of char, halfwidth spacer
const defaultChars = ['\u{fdfd}', '\u{94c}', '\u{ffa0}']

 /**
 * A list of forebidden chars a user can't post
 * Recommended to blacklist client crashing chars, as messages are auto-deleted no matter the punishment
 * The punishment applies after maxChars in a message/maxChars over the last X messages in Y seconds
 */
module.exports = class BlacklistRule extends Rule {
  /**
   * @param {string|number} id The database id of this rule
   * @param {String} punishment The punishment to apply after violating too many forbidden chars
   * @param {String[]} charList An array of chars to blacklist & delete on sight
   * @param {Number} maxChars The max amount a user can post a blacklisted char in 1/over many messages
   * @param {Number} timeout The timeout (in seconds) before a violation expires
   */
  constructor(id, punishment, maxCount, timeout, blacklist = defaultChars) {
    super(id, 'blacklist', maxCount, timeout, blacklist)
    this.punishment = punishment
    this.maxCount = maxCount
    this.timeout = timeout * 1000
    this.parameters = blacklist

    this.blacklist = blacklist.map(v => v.toLowerCase())
    this.lastMessage = {}
    this.violations = AutoProp({})
    this.vioMessages = {}

    this.name = `Max blacklisted words (${maxCount}) reached.`
  }

  filter(message) {
    const uid = message.guild.id + message.author.id
    const occ = countOcc(message.content, this.blacklist)

    if (occ > 0) {
      this.violations[uid] += occ

      this.vioMessages[uid] = this.vioMessages[uid] || []
      this.vioMessages[uid].push(message)

      setTimeout((id, occ) => {
        this.violations[id] - occ
        this.vioMessages[id].shift()
      }, this.timeout, uid, occ)


      if (this.violations[uid] >= this.maxCount) {
        return [this.punishment, this.vioMessages[uid]]
      }

    }
  }
}
