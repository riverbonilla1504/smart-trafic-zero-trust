FROM node:18-alpine

WORKDIR /app

# Solo copiamos package.json para referencia
COPY package.json package-lock.json* ./

# Copiamos node_modules ya resueltas en el host
COPY node_modules ./node_modules

# Copiamos el resto del código
COPY . .

# Generamos el certificado self-signed dentro del contenedor
RUN apk add --no-cache openssl && \
    openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout key.pem -out cert.pem \
    -subj "/CN=auth-server" -days 365

EXPOSE 443

CMD ["node", "server.js"]
