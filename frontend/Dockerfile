FROM node:20-slim

WORKDIR /app
COPY package*.json /app/
RUN npm ci
COPY . /app
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start", "--", "-p", "3000"]

