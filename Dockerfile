# Step that pulls in everything needed to build the app and builds it
FROM node:18-alpine as ts-compiler
WORKDIR /usr/app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml tsconfig.json ./
RUN pnpm fetch
RUN pnpm install -r --offline
COPY . ./
RUN pnpm run build

# Step that only pulls in (production) deps required to run the app
FROM node:18-alpine as ts-remover
WORKDIR /usr/app
RUN npm install -g pnpm
COPY --from=ts-compiler /usr/app/package.json /usr/app/pnpm-lock.yaml ./
COPY --from=ts-compiler /usr/app/dist ./dist
RUN pnpm fetch --prod
RUN pnpm install -r --offline --prod
# TODO: Error: @prisma/client did not initialize yet. Please run "prisma generate" and try to import it again
RUN pnpx prisma generate

# Minimal Linux runtime, with effectively only the absolute basics needed to run Node.js
# https://github.com/GoogleContainerTools/distroless/blob/main/nodejs/README.md
FROM gcr.io/distroless/nodejs:18
WORKDIR /usr/app
COPY --from=ts-remover /usr/app ./
USER 1000
CMD [ "dist/index.js" ]
