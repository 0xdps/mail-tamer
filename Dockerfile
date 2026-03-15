# Build Frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install
COPY frontend .
RUN npm run build

# Build Backend Image
FROM python:3.12-alpine
WORKDIR /app

# System deps (req. for some python packages like aiosqlite, cryptography, etc)
RUN apk add --no-cache gcc musl-dev libffi-dev

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy Backend Code
COPY backend /app/backend
WORKDIR /app/backend

# Copy Built React app
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# The DB will live in /app/data via the mount
RUN mkdir -p /app/data

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
