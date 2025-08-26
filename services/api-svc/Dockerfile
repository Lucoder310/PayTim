FROM node:20-alpine
WORKDIR /app

# nur was wir wirklich brauchen kopieren (schnelleres Caching)
COPY services/api-svc/package.json ./
RUN npm install --omit=dev

# API-Quellcode
COPY services/api-svc/src ./src

# Deine bestehende UI in den Public-Ordner der API legen
# (wir serven sie später unter /ui/)
COPY services/web-ui/src ./public

EXPOSE 3000
CMD ["node", "src/server.mjs"]
