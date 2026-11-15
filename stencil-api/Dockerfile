# Standard-library Node, no dependencies: nothing to install but tini.
FROM node:22-alpine
RUN apk add --no-cache tini
WORKDIR /app
COPY package.json ./package.json
COPY src ./src
ENV NODE_ENV=production PORT=8080 STENCIL_CACHE_DIR=/data/stencils TRUST_PROXY=1
# The cache volume is mounted here; without it the service still runs and
# simply forgets finished stencils on restart.
RUN mkdir -p /data/stencils && chown -R node:node /data
USER node
EXPOSE 8080
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
