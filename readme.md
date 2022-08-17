# Smol Bot

Various (mostly) moderation- or utility-focused commands I've needed, in a Discord bot.

Acts somewhat as a staging enviroment for some features, but mostly for more niche commands I've needed.

> ⚠️ This is currently a very WIP version. Many things will break, setup will be hard. It's best to just look at the codebase for now

## Setup

While open-source, Smol Bot isn't really designed to be ran anywhere. If you're familiar with nodejs or docker, you can get it running yourself, but documentation isn't a big priority.

### .env requirements
```sh
NODE_ENV=development # or production
TOKEN=discord bot token
APPLICATION_ID=discord application id
USE_PINO_PRETTY=true # or false for default pino logs
DATABASE_URL="file:./db/dev.db" # or anywhere else you want an sqlite db to be
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
