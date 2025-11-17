FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# Generate self-signed cert (inside container)
RUN apk add --no-cache openssl && \
    openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout key.pem -out cert.pem \
    -subj "/CN=auth-server" -days 365

EXPOSE 443

CMD ["node", "server.js"]
