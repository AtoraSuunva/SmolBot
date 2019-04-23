//set a random playing game every X whatever
module.exports.config = {
  name: 'activity',
  invokers: ['activity'],
  help: 'Allows to randomly/manually set an activity',
  expandedHelp: 'Format is `{TYPE} ACTIVITY MESSAGE`\nPLAYING, STREAMING, LISTENING, WATCHING\nBot owner only.',
  usage: ['Random one', 'activity', 'Manual', 'activity something blah', 'Manual and custom', '{streaming} the bee movie'],
  invisible: true
}

const statuses = ['with boorus!', '{streaming} christian anime!', 'send nudes', '{streaming} some lewd stuff',
                  'Gla-ahn~', '{streaming} handholding~', '{streaming} pawholding', '{streaming} some furry stuff',
                  'alone', 'with Atlas!', 'with RobotOtter!', 'with BulbaTrivia!', 'with Haram-- wait he\'s dead', 'with Dito~', 'with Ava!',
                  'probably something lewd', 'aaa', 'with shit code.', '{streaming} the entire bee movie, but r34', 'with NekoBotBeta',
                  'with Alexia', '{streaming} memes.', '{streaming} Atlas Dying.', 'Japanese Anime Schoolgirl Sim', 'nya', 'as a flareon',
                  '{streaming} Jolt hugs!', '{streaming} the Twitch logout page.', '{streaming} Playing', 'Streaming', 'send dudes',
                  '{streaming} Atlas crying while debugging', '{watching} atlas cry', '{watching} the eevees!', '{listening} the screams of the damned',
                  '{watching} probably something lewd', '{watching} RobotOtter and Bulba fight', '{listening} the moans of the damned']

//strings starting with '{streaming}' will be shown as "Streaming X"
const appendMsg = ' | s!help' //use this to keep a constant message after
const interval = 60 * 15 //in seconds
const twitch = 'https:\/\/twitch.tv/logout' //memes
let interv

module.exports.events = {}

module.exports.events.ready = bot => {
  bot.user.setActivity(...getPlaying())

  interv = setInterval(() => bot.user.setActivity(...getPlaying()), interval * 1000)
}

module.exports.events.message = (bot, message) => {
  if (message.author.id !== bot.sleet.config.owner.id)
    return message.channel.send('Nah, how about I do what I want.')

  let [cmd, ...playing] = bot.sleet.shlex(message)
  playing = playing.join(' ')

  let activity = playing ? getPlayingFrom(playing) : getPlaying()

  bot.user.setActivity(...activity)

  if (playing) {
    clearInterval(interv)
  } else {
    interv = setInterval(() => bot.user.setActivity(...getPlaying()), interval * 1000)
  }

  bot.user.setActivity(...activity)

  message.channel.send(`Now *${activity[1].type.toLowerCase()}* **${activity[0]}**`)
}

function getPlaying() {
  return getPlayingFrom(randomChoice(statuses), true)
}

// Returns [name, {url, type}]
function getPlayingFrom(str, append = false) {
  let choice = str.match(/(?:{(\w+)})?(.*)/)

  let name = (choice[2] + (append ? appendMsg : '')).trim()
  let type = (choice[1] || 'PLAYING').toUpperCase()
  let url = (type === 'STREAMING') ? twitch : undefined

  return [name, {url, type}]
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

