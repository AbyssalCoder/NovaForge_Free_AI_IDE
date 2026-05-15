FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY dist ./dist
EXPOSE 8787
CMD ["node", "dist/index.js"]
