FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=build /app/dist/index.html /usr/share/nginx/html/index.html
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
