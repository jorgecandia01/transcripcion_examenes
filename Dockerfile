# FROM node:18
FROM --platform=linux/amd64 node:18

# Install necessary packages
RUN apt-get update && \
    apt-get install -y graphicsmagick ghostscript imagemagick && \
    apt-get clean

# Verify installation
RUN gm -version && convert -version

# Create app directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./
COPY src ./src

# Creo la carpeta uploads
RUN mkdir -p uploads

# Instala exactamente las versiones registradas en package-lock.json
# --omit=dev evita instalar dependencias de desarrollo
RUN npm ci --omit=dev

# Expose the port your app runs on
EXPOSE 8080

# Define the command to run your app
CMD [ "node", "src/index.js" ]
# Construcción y despliegue: make deploy-PROD
