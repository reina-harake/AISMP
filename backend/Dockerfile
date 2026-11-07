FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p uploads
ENV NODE_ENV=development
EXPOSE 5000
# seed is idempotent: safe on every start
CMD ["sh", "-c", "node scripts/seed.js && node src/server.js"]
