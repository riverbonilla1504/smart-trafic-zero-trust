FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY node_modules ./node_modules
COPY src ./src

EXPOSE 8080

CMD ["node", "src/index.js"]
