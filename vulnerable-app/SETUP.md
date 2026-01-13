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

For production mode:

```bash
npm install
npm run build
npm start
```

## Access

Open http://localhost:3000 in your browser.
