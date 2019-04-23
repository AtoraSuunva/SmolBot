//wew
module.exports.config = {
  name: 'japanese',
  invokers: ['japanese', 'jp'],
  help: 'translates to japanese',
  expandedHelp: 'magic',
  usage: ['translate', 'japanese weee!'],
  invisible: true
}

const alphabetEN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const alphabetJP = [
  '\u{5342}', // A
  '\u{4e43}', // B
  '\u{531a}', // C
  '\u{5200}', // D
  '\u{4e47}', // E
  '\u{4e0b}', // F
  '\u{53b6}', // G
  '\u{5344}', // H
  '\u{5de5}', // I
  '\u{4e01}', // J
  '\u{957f}', // K
  '\u{4e5a}', // L
  '\u{4ece}', // M
  '\u{20628}', // N
  '\u{53e3}', // O
  '\u{5c38}', // P
  '\u{353f}', // Q
  '\u{5c3a}', // R
  '\u{4e02}', // S
  '\u{4e05}', // T
  '\u{51f5}', // U
  '\u{30ea}', // V
  '\u{5c71}', // W
  '\u{4e42}', // X
  '\u{4e2b}', // Y
  '\u{4e59}'  // Z
]

const reg = alphabetEN.map(v => new RegExp(v, 'g'))

module.exports.events = {}
module.exports.events.message = (bot, message) => {
  const [arg, ...msg] = bot.sleet.shlex(message)

  let m = msg.join(' ').toUpperCase()

  reg.forEach((v, i) => m = m.replace(v, alphabetJP[i]))

  message.channel.send(m)
}

