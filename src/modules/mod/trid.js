module.exports.config = {
  name: 'trid',
  invokers: ['trid', 'ext'],
  help: 'Attempts to identify files',
  expandedHelp: 'Attempts to identify files using trid. Either use a url to a file, an attachment, or call for it to lookup the first file it finds in the channel.',
  usage: ['Get file from url and try to identify it', 'trid https:\/\/some.file/meme.aaa', 'Get file from attachment and try to identify it', 'trid <Attachment in message>', 'Grab last attachment in chat and try to identify it', 'trid'],
  invisible: true,
  autoload: false
}

const request = require('request')
const fs = require('fs')
const util = require('util')
const execFile = util.promisify(require('child_process').execFile)

module.exports.events = {}
module.exports.events.message = async (bot, message) => {
  let [cmd, url] = bot.sleet.shlex(message)

  getFileToIdentify(message, url)
    .then(info => {
      const {file, url} = info

      execFile('./trid', [file], {cwd: __dirname})
        .then(out => {
          fs.unlink(file)
          message.channel.send(out.stdout.replace(file, url), {code: true})
        })
        .catch(e => {
          message.channel.send('An error occured while examining:\n' + e)
        })
    })
    .catch(e => message.channel.send((e+'') || 'Error!') || console.log(e))
}

async function getFileToIdentify(message, url) {
  return new Promise(async (resolve, reject) => {

  url = await (url || (message.attachments.first() ? message.attachments.first().url : getLatestFile(message)))

    if (url) {
      request(url)
        .on('error', reject)
        .pipe(fs.createWriteStream(__dirname + `/trid-tmp/tmp-${message.id}`))
        .on('close', () => resolve({file: __dirname + `/trid-tmp/tmp-${message.id}`, url}))
    } else {
      reject('No file found.')
    }
  })
}

async function getLatestFile(message) {
  return new Promise(async (resolve) => {
    message.channel.fetchMessages({limit: 100})
     .then(msgs => {
       const sMsgs = msgs.array().sort((a,b) => b.createdAt - a.createdAt)

        for (let m of sMsgs) {
          if (m.attachments.first()) resolve(m.attachments.first().url)
        }

        resolve(null)
     })

  })
}
