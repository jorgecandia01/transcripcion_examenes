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

# Install app dependencies
RUN npm install

# Copy the rest of your app's source code
# COPY . .

# Expose the port your app runs on
EXPOSE 8080

# Define the command to run your app
CMD [ "node", "src/index.js" ]



# docker build -t gcr.io/cosas-formantia/backend:latest .
# docker push gcr.io/cosas-formantia/backend:latest
# gcloud run deploy backend --image gcr.io/cosas-formantia/backend:latest --platform managed --region europe-southwest1 --allow-unauthenticated --memory 4Gi --cpu 1 --timeout 30m --max-instances 5 --min-instances 0 --concurrency 80


