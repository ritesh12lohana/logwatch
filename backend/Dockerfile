FROM node:20-alpine

WORKDIR /app

# copy deps first so docker layer cache works
COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]
