#!/usr/bin/env bash
set -e

echo "=> Setting up Mail Tamer development environment..."

# Backend setup
echo "=> Setting up backend virtual environment..."
cd backend
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "Created venv."
fi
source venv/bin/activate
pip install -r ../requirements.txt

# Frontend setup
echo "=> Setting up frontend dependencies..."
cd ../frontend
npm install

echo "=> Setup complete. Run 'just dev' to start the servers."
