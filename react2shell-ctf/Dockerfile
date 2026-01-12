# React2Shell CTF Challenge
# Demonstrates CVE-2025-55182 - React Server Components RCE
#
# Build: docker build -t react2shell-ctf .
# Run: docker run -p 3000:3000 react2shell-ctf

FROM node:20-alpine

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json ./

# Install dependencies
# This installs VULNERABLE versions:
#   - Next.js 16.0.6 (patched in 16.0.7+)
#   - React 19.2.0 (patched in 19.0.1, 19.1.2, 19.2.1+)
RUN npm install

# Copy application code
COPY next.config.js ./
COPY app ./app

# Create the flag file
RUN echo "FLAG{r34ct_fl1ght_t0_rc3_2025}" > /flag.txt
RUN chmod 644 /flag.txt

# Build the Next.js app for production
RUN npm run build

# Expose port
EXPOSE 3000

# Run in production mode (still vulnerable!)
ENV NODE_ENV=production
CMD ["npm", "start"]
