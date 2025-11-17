FROM node:18-alpine

WORKDIR /app

# Copiamos el package.json solo como referencia
COPY package.json package-lock.json* ./

# Copiamos node_modules ya instalados en la VM
COPY node_modules ./node_modules

# Copiamos el resto del código y los certificados
COPY . .

EXPOSE 443

CMD ["node", "server.js"]
