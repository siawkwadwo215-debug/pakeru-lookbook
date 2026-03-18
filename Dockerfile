FROM node:20-alpine

WORKDIR /app

# Copy application files
COPY package.json ./
COPY server.js ./
COPY index.html ./
COPY css/ ./css/
COPY js/ ./js/
COPY assets/ ./assets/

# Create data directories (volume will be mounted here)
RUN mkdir -p /app/data/uploads /app/data/media

EXPOSE 3000

CMD ["node", "server.js"]
