#!/usr/bin/env bash
set -e

echo "=> Setting up Mail Tamer development environment..."

# Ensure pyenv is available and use Python 3.12
export PYENV_ROOT="${PYENV_ROOT:-$HOME/.pyenv}"
export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init -)"

echo "=> Installing Python 3.12 via pyenv (if not already installed)..."
pyenv install -s 3.12
pyenv shell 3.12

# Backend setup
echo "=> Setting up backend virtual environment..."
cd backend
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python -m venv .venv
    echo "Created .venv."
fi
source .venv/bin/activate
pip install -r requirements.txt

# Frontend setup
echo "=> Setting up frontend dependencies..."
cd ../frontend
npm install --legacy-peer-deps

echo "=> Setup complete. Run 'just dev' to start the servers."
