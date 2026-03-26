# Stage 1: Build the frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# Stage 2: Build the backend and serve the application
FROM node:20-alpine
WORKDIR /app/backend

# Install necessary build tools for better-sqlite3 and stockfish (which might need them)
RUN apk add --no-cache python3 make g++

COPY backend/package*.json ./
RUN npm install

COPY backend/ ./

# Copy built frontend from Stage 1
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Expose backend port
EXPOSE 3001

# Start the application
CMD ["node", "server.js"]
