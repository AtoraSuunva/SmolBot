module.exports.config = {
  name: 'strawpoll',
  invokers: ['strawpoll', 'sp'],
  help: 'Grabs the result of a strawpoll',
  expandedHelp: 'The id is the number after strawpoll.me/',
  usage: ['Get results', 'strawpoll 1234']
}

const fetch = require('node-fetch')
const endOfLine = require('os').EOL

module.exports.events = {}
module.exports.events.message = async (bot, message) => {
  let [cmd, pollId] = bot.sleet.shlex(message.content)

  if (pollId === undefined)
    return message.channel.send('I need a poll ID to work with.')

  if (Number.isNaN(parseInt(pollId, 10)))
    return message.channel.send('Poll IDs are usually only numbers.')

  const url = `http://www.strawpoll.me/api/v2/polls/${pollId}`

  const headers = {
    'User-Agent': 'Strawpoll for Terminal (By AtlasTheBot)'
  }

  const res = await fetch(url, { headers })

  if (res.statusCode === 404) {
    return message.channel.send('There is no strawpoll for that ID')
  }

  if (!res.ok) {
    bot.sleet.logger.error(await res.text())
    return message.channel.send('Strawpoll returned an error while trying to fetch that')
  }

  message.channel.send(sortVotes(await res.json()))
}

function sortVotes(data) {
  let results = []
  for (let i = 0; i < data.options.length; i++) {
    results[i] = {'title': data.options[i], 'votes': data.votes[i]}
  }

  results = results.sort((a, b) => b.votes - a.votes)
  let sortedByVotes = {}

  for (let thing of results) {
    if (sortedByVotes[thing.votes] === undefined) sortedByVotes[thing.votes] = []
    sortedByVotes[thing.votes].push(thing.title)
  }

  let position = 1
  let totalVotes = data.votes.reduce((a,b)=>a+b)
  let list = '```py\n'

  for (let foo of Object.keys(sortedByVotes).reverse()) {
    list += `[${position}] ${sortedByVotes[foo][0]} # ${foo} vote${foo==1?'':'s'}\n`

    for (let j = 1; j < sortedByVotes[foo].length; j++) {
      list += `  L ${sortedByVotes[foo][j]} # ${foo} vote${foo==1?'':'s'}\n`
    }

    position++
  }

  list += '```'
  return {embed: {author: {name: data.title, url: `http:\/\/www.strawpoll.me/${data.id}`},
          description: list, footer: {text: `${totalVotes} vote${totalVotes==1?'':'s'}`} }}
}
