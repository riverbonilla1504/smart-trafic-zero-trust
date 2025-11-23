FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
COPY node_modules ./node_modules

COPY src ./src

CMD ["node", "src/index.js"]
