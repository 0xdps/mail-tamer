#!/usr/bin/env bash
set -e

# Uses trap to ensure both servers die when you Ctrl+C
trap 'kill 0' SIGINT

echo "=> Starting backend server (uvicorn)..."
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

echo "=> Starting frontend dev server (vite)..."
cd ../frontend
npm run dev &
FRONTEND_PID=$!

echo "=> Servers running. Press Ctrl+C to stop."
wait
