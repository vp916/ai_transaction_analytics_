FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY scripts ./scripts
COPY seed ./seed
EXPOSE 5000
CMD ["node", "src/index.js"]
