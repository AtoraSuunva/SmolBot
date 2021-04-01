module.exports.config = {
  name: 'loudness',
  help: 'Checks video loudness',
  expandedHelp:
    'Reacts to videos based on the loudness of them, using LUFS.\n-7 = lil loud\n-5 = pretty loud\n-3 = loud\n-2 = louder\n-1 = loud!\n 0 = LOUD\n + = VERY LOUD',
}

const util = require('util')
const fs = require('fs').promises
const path = require('path')
const execFile = util.promisify(require('child_process').execFile)

const audioExt = ['.mp4', '.mov', '.webm', '.ogg', '.mp3', '.wav']

module.exports.events = {}
module.exports.events.everyMessage = async (bot, message) => {
  const attachmentsLoudness = message.attachments
    .filter(a => audioExt.includes(path.extname(a.url).toLowerCase()))
    .map(a => detectLoudness(a.url))

  const embedsLoudness = message.embeds
    .filter(
      e => e.video && audioExt.includes(path.extname(e.url).toLowerCase()),
    )
    .map(e => detectLoudness(e.url))

  const allAudio = [...attachmentsLoudness, ...embedsLoudness]

  if (allAudio.length === 0) return

  try {
    const loudness = await Promise.all(allAudio)
    const loudest = loudness.map(l => l.integrated).sort((a, b) => b - a)[0]

    if (loudest === null) return

    const emoji = getLoudnessEmoji(loudest)

    if (emoji === null) return
    message.react(emoji)
  } catch (e) {
    // failed, just ignore it
  }
}

// loudness:
// -7 = lil speaker
const LIL_LOUD = '\uD83D\uDD09'
// -3 = bigger speaker
const LOUD = '\uD83D\uDD0A'
//  0 = loudspeaker
const VERY_LOUD = '\uD83D\uDCE2'

function getLoudnessEmoji(loudness) {
  if (loudness >= 0) {
    return VERY_LOUD
  } else if (loudness >= -3) {
    return LOUD
  } else if (loudness >= -7) {
    return LIL_LOUD
  } else {
    return null
  }
}

async function detectLoudness(file) {
  let stdout, stderr
  try {
    ;({ stdout, stderr } = await execFile('ffmpeg', [
      '-i',
      file,
      '-vn',
      '-sn',
      '-dn',
      '-af',
      'loudnorm=I=-16:dual_mono=true:TP=-1.5:LRA=11:print_format=summary',
      '-f',
      'null',
      '/dev/null',
    ]))
  } catch (e) {
    if (e.stderr.includes('does not contain any stream')) {
      // no audio in file
      return {
        integrated: null,
        truePeak: null,
        lra: null,
        threshold: null,
      }
    }

    throw e
  }

  const output = stderr.split('[Parsed_loudnorm_')[1]
  if (!output) return -Infinity

  const volume = output
    .split(/\r?\n/g)
    .filter(v => v.startsWith('Input'))
    .map(v => {
      const m = v.match(/Input ([\w\s]+):\s+([-+]?\d+\.\d+)/)
      return [
        m[1] === 'True Peak' ? 'truePeak' : m[1].toLowerCase(),
        parseInt(m[2]),
      ]
    })

  return Object.fromEntries(volume)
}
