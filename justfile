set allow-duplicate-recipes := true

# List all available recipes
default:
    @just --list

# Install all dependencies (backend venv + frontend npm)
setup:
    ./scripts/setup.sh

# Run development servers (FastAPI + Vite) concurrently
dev:
    ./scripts/dev.sh

# Build the frontend and docker image for production
build:
    docker compose build

# Run the production docker container
up:
    docker compose up -d

# Stop the production docker container
down:
    docker compose down

# View docker logs
logs:
    docker compose logs -f

# Run database migrations / seed script
seed:
    @cd backend && source venv/bin/activate && python seed.py

# Clean up dev artifacts and python cache
clean:
    rm -rf backend/venv
    rm -rf frontend/node_modules
    rm -rf frontend/dist
    find backend -name "*.pyc" -delete
    find backend -name "__pycache__" -delete
    echo "Cleaned up venv, node_modules, dist, and pycache."
