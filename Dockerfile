# Step that pulls in everything needed to build the app and builds it
FROM node:20-bookworm-slim as dev-build
WORKDIR /home/node/app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY src/ ./src/
COPY tsconfig.json ./
COPY /prisma ./prisma/
COPY /patches ./patches/
RUN pnpx prisma generate && pnpm run build


# Step that only pulls in (production) deps required to run the app
FROM node:20-bookworm-slim as prod-build
WORKDIR /home/node/app
RUN npm install -g pnpm
COPY --from=dev-build /home/node/app/package.json /home/node/app/pnpm-lock.yaml ./
COPY --from=dev-build /home/node/app/dist ./dist/
COPY --from=dev-build /home/node/app/prisma ./prisma/
COPY --from=dev-build /home/node/app/patches ./patches/
RUN pnpm install --prod --frozen-lockfile


# The actual runtime itself
FROM node:20-bookworm-slim as prod-runtime
# See https://github.com/prisma/prisma/issues/19729, watch in case this changes
RUN apt-get update -y
RUN apt-get install -y openssl
WORKDIR /home/node/app
COPY --from=prod-build /home/node/app ./
USER node
CMD [ "npm", "run", "start:prod" ]
