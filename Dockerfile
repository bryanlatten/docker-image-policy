FROM mhart/alpine-node:10 as base

# Ensure application code makes it into the /app directory
COPY ./ /app/
WORKDIR /app

RUN export NODE_ENV=production && npm install

####

FROM scratch
COPY --from=base / .

WORKDIR /app
ENTRYPOINT ["/usr/bin/node", "index.js"]



