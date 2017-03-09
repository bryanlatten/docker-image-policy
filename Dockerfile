FROM mhart/alpine-node:7.7.2

# Ensure application code makes it into the /app directory
COPY ./ /app/

WORKDIR /app

RUN npm install

ENTRYPOINT ["/usr/bin/node", "index.js"]

