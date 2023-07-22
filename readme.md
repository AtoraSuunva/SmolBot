# Smol Bot (& RobotOtter)

Various (mostly) moderation- or utility-focused commands I've needed, in a Discord bot.

Technically "Yet Another Mod Bot Nobody Asked For," but all the utils here were made because of my own requirements. You are free to invite and use the "public" version [RobotOtter](https://discordapp.com/oauth2/authorize?client_id=189078347207278593&scope=bot&permissions=0). You cannot invite Smol Bot.

> ⚠️ This is currently still a WIP. Most things are pretty stable, but nothing's guaranteed.

## RobotOtter?

**tl;dr: This repo *IS* RobotOtter's source code!**

RobotOtter used to be an ancient mod-like bot with misc commands that I maintained. I've partially given up on maintaining it, instead investing my work into Smol Bot, which then ended up superseding RobotOtter in literally every feature. In the end I decided might as well just run RobotOtter off Smol Bot's codebase (which supported all the exact same mod features) and only have to maintain 3 bots instead of 4. Smol Bot is also significantly more advanced in a bunch of ways.

# [Add RobotOtter to Server](https://discordapp.com/oauth2/authorize?client_id=189078347207278593&scope=bot&permissions=0)

[Support Server](https://discord.gg/8K3uCfb) - [Privacy Policy](./privacy.md) - [Terms of Service](./tos.md)

## Setup

While open-source, Smol Bot isn't really designed to be ran anywhere. If you're familiar with nodejs or docker, you can get it running yourself, but documentation isn't a big priority.

### .env requirements
```sh
NODE_ENV=development # or production
TOKEN=<discord bot token>
APPLICATION_ID=<discord application id>
USE_PINO_PRETTY=true # or false for default pino logs
DATABASE_URL="file:./db/dev.db" # or anywhere else you want an sqlite db to be
ACTIVITIES_FILE="./resources/activities-smol.txt" # path to a text file with the activities you want the bot to show
```

### Running

```sh
# Migrate the database if needed
pnpx prisma migrate deploy
```

```sh
pnpm run build
pnpm run main
```

Docker can also be used, automatically building, migrating, and running
```sh
docker-compose up
```
