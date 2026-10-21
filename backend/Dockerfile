FROM node:20-alpine

WORKDIR /app

# Install ffmpeg for MKV audio transcoding (AC3/EAC3/DTS -> AAC)
RUN apk add --no-cache ffmpeg

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source
COPY . .

# Expose port (Render/Railway sets PORT dynamically)
ENV PORT=3001
EXPOSE 3001

CMD ["node", "server.js"]
