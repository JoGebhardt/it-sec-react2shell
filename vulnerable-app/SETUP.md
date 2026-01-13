# Setup

## Option 1: Docker

```bash
docker-compose up --build
```

Or manually:

```bash
docker build -t vulnerable-app .
docker run -p 3000:3000 vulnerable-app
```

## Option 2: Local Development

```bash
npm install
npm run dev
```

With HTTPS (auto-generates local certificates):

```bash
npm run dev:https
```

For production mode:

```bash
npm install
npm run build
npm start
```

## Access

- HTTP: http://localhost:3000
- HTTPS: https://localhost:3000 (when using `dev:https`)
