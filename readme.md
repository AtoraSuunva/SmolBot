# Smol Bot (& RobotOtter)

## [Add RobotOtter to Server](https://discordapp.com/oauth2/authorize?client_id=189078347207278593&scope=bot%20applications.commands&permissions=0)

## [Support Server](https://discord.gg/8K3uCfb) - [Privacy Policy](./privacy.md) - [Terms of Service](./tos.md)

Various (mostly) moderation- or utility-focused commands I've needed, in a Discord bot.

Technically "Yet Another Mod Bot Nobody Asked For," but all the utils here were made because of my own requirements. You are free to invite and use the "public" version [RobotOtter](https://discordapp.com/oauth2/authorize?client_id=189078347207278593&scope=bot&permissions=0). You cannot invite Smol Bot.

> [!WARNING]  
> Most parts of the bot are stable but I maintain this bot as a solo dev in my spare time for mainly my own use. I make no promises about the stability or uptime on the bot. Any bug reports or feature requests will be done when (and if) I can get to it. Issues are open for bug reports and feature requests. PRs are okay but I might take a while to get to them (make sure they pass `pnpm run lint:fix`).

## RobotOtter?

**tl;dr: This repo *IS* RobotOtter's source code!**

RobotOtter used to be an ancient mod-like bot with misc commands that I maintained. I had partially given up on maintaining it, instead investing my work into Smol Bot, which then ended up superseding RobotOtter in literally every feature. In the end I decided might as well just run RobotOtter off Smol Bot's codebase (which supported all the exact same mod features) and only have to maintain 3 bots instead of 4. Current-day RobotOtter uses the identical codebase to Smol Bot and both bots are actively maintained.

## Setup

While open-source, Smol Bot isn't really designed to be easy for everyone to run. If you're familiar with Node.js or Docker, you can get it running yourself, but documentation isn't a big priority. Everything below is *mainly* written for my own reference. You will be on your own for selfhosted instances.

### .env requirements

```sh
NODE_ENV=development # or production
TOKEN=<discord bot token>
APPLICATION_ID=<discord application id>
USE_PINO_PRETTY=true # or false for default pino logs
DATABASE_URL="file:./db/data.db" # or anywhere else you want an sqlite db to be
ACTIVITIES_FILE="./resources/activities-smol.txt" # path to a text file with the activities you want the bot to show
HEALTHCHECK_PORT=8000 # the port to run an http server on, which will respond to http://localhost:PORT/healthcheck with HTTP 200 once the bot is ready and the database works
SENTRY_DSN=<access token> # A sentry DSN for error reporting, optional
```

## Running

You can either run the bot via the pre-built Docker image, Docker, or installing the dependencies yourself.

### Pre-built Docker image

A pre-built image is available from [GitHub](https://github.com/AtoraSuunva/SmolBot/pkgs/container/smolbot), currently building off the latest development commit.

Create a `.env` file and a `docker-smolbot.yml` file (or whatever name you want):

```yml
services:
  bot:
    image: 'ghcr.io/atorasuunva/smolbot:development'
    restart: always
    init: true
    env_file:
      - .env
    volumes:
      - db-data:/home/node/app/prisma/db
    healthcheck:
      test: [ "CMD-SHELL", "wget --no-verbose --tries=1 -O- http://bot:$$HEALTHCHECK_PORT/healthcheck || exit 1" ]
      interval: 10s
      timeout: 30s
      retries: 5
      start_period: 5s
  # Optional, if you want litestream to replicate the DB
  # You will need to config litestream if you include this
  # Use `docker compose --profile production up` to run with litestream
  litestream:
    image: litestream/litestream
    command: replicate
    restart: always
    volumes:
      - db-data:/data
      - ./litestream.yml:/etc/litestream.yml
    depends_on:
      bot:
        condition: service_healthy
        restart: true
    profiles:
      - production

volumes:
  db-data:
```

Then run it via `docker compose -f docker-smolbot.yml`. This avoids needing to clone the repo and wait for builds. A `docker run` will work as well, but require copy-pasting the command to keep the config.

> [!NOTE]  
> Currently, the activities file (`activities-smol.txt`) is baked into the image. If you want to setup custom activities, you can make your own .txt file (check the existing file for reference), load it into the container using a volume, then edit `ACTIVITIES_FILE` to point to your file.

### Docker

If you prefer/need to re-build the image (i.e. you've changed the code), you can use the provided `docker-compose.yml` and `docker compose up -d --build` to handle it all for you.

### Installing dependencies yourself

You'll need Node.js (At **least** >=22.0.0), pnpm, and patience.

Assuming you have Node.js and pnpm installed and working:

```sh
# Install dependencies
pnpm install
# Generate prisma client
pnpm run generate

# Either
pnpm run build
pnpm run start:prod
# Or, doing both steps in 1 command
pnpm run start:dev
```
