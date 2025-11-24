FROM node:18-alpine

WORKDIR /app

# Copy the package.json only as a reference
COPY package.json package-lock.json* ./

# Copy the node_modules already installed on the VM
COPY node_modules ./node_modules

# Copy the rest of the code and the certificates
COPY . .

# Copy the key.pem and cert.pem files
COPY key.pem ./key.pem
COPY cert.pem ./cert.pem

# Expose the port 443
EXPOSE 443

CMD ["node", "server.js"]
