#!/bin/bash

# Setup Script for DB Backup Platform
# This script helps you get started quickly

set -e

echo "================================================"
echo "DB Backup Platform - Setup Script"
echo "================================================"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" &> /dev/null
}

# Check Docker installation
echo "Checking prerequisites..."
echo ""

if ! command_exists docker; then
    echo "❌ Docker is not installed"
    echo ""
    echo "Options:"
    echo "  1. Run the installation script: ./install-docker.sh"
    echo "  2. Install Docker manually: https://docs.docker.com/engine/install/"
    echo "  3. Run locally without Docker (see QUICK_START.md Option 3)"
    echo ""
    read -p "Do you want to install Docker now? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if [ -f "./install-docker.sh" ]; then
            chmod +x ./install-docker.sh
            ./install-docker.sh
            echo ""
            echo "Docker installed! Please log out and log back in, then run this script again."
            exit 0
        else
            echo "install-docker.sh not found. Please install Docker manually."
            exit 1
        fi
    else
        echo "Please install Docker and try again, or see QUICK_START.md for alternatives."
        exit 1
    fi
fi

# Check if docker compose works
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose plugin is not installed"
    echo "Please install Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker is installed: $(docker --version)"
echo "✅ Docker Compose is installed: $(docker compose version)"
echo ""

# Check if user can run docker without sudo
if ! docker ps &> /dev/null; then
    echo "⚠️  You don't have permission to run Docker without sudo"
    echo "Run: sudo usermod -aG docker $USER"
    echo "Then log out and log back in"
    echo ""
    read -p "Do you want to add yourself to the docker group now? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo usermod -aG docker $USER
        echo "Added to docker group. Please log out and log back in, then run this script again."
        exit 0
    fi
fi

# Create backend .env if it doesn't exist
if [ ! -f "backend/.env" ]; then
    echo "Creating backend/.env from example..."
    cp backend/.env.example backend/.env
    echo "✅ Created backend/.env"
    echo "⚠️  Remember to update SECRET_KEY and ENCRYPTION_KEY for production!"
    echo ""
else
    echo "✅ backend/.env already exists"
fi

# Check if any containers are already running
if docker compose ps | grep -q "Up"; then
    echo "⚠️  Some containers are already running"
    echo ""
    docker compose ps
    echo ""
    read -p "Do you want to restart all services? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Stopping existing containers..."
        docker compose down
    else
        echo "Keeping existing containers running"
        exit 0
    fi
fi

# Pull latest images
echo "Pulling Docker images..."
docker compose pull

# Build custom images
echo "Building application images..."
docker compose build

# Start services
echo "Starting all services..."
docker compose up -d

# Wait for services to be ready
echo ""
echo "Waiting for services to be ready..."
sleep 5

# Check service health
echo ""
echo "Checking service health..."
echo ""

# Function to check service health
check_health() {
    local service=$1
    local url=$2
    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if curl -f -s "$url" > /dev/null 2>&1; then
            echo "✅ $service is healthy"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 2
    done
    echo "⚠️  $service might not be ready yet"
    return 1
}

# Check PostgreSQL
if docker compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
    echo "✅ PostgreSQL is ready"
else
    echo "⚠️  PostgreSQL is not ready yet"
fi

# Check Redis
if docker compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis is ready"
else
    echo "⚠️  Redis is not ready yet"
fi

# Check MinIO
if curl -f -s http://localhost:9000/minio/health/live > /dev/null 2>&1; then
    echo "✅ MinIO is ready"
else
    echo "⚠️  MinIO is not ready yet"
fi

# Wait a bit more for backend
echo ""
echo "Waiting for backend to start..."
sleep 10

# Check Backend
if curl -f -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "✅ Backend API is ready"
else
    echo "⚠️  Backend API is not ready yet (this is normal on first start)"
    echo "   Run 'docker compose logs backend' to check progress"
fi

# Check Frontend
if curl -f -s http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ Frontend is ready"
else
    echo "⚠️  Frontend is not ready yet"
fi

echo ""
echo "================================================"
echo "Setup Complete!"
echo "================================================"
echo ""
echo "Service Status:"
docker compose ps
echo ""
echo "Access Points:"
echo "  🌐 Frontend:      http://localhost:3000"
echo "  🔧 Backend API:   http://localhost:8000"
echo "  📚 API Docs:      http://localhost:8000/api/v1/docs"
echo "  📦 MinIO Console: http://localhost:9001"
echo ""
echo "Default Login:"
echo "  Username: admin"
echo "  Password: admin123"
echo ""
echo "Useful Commands:"
echo "  View logs:        docker compose logs -f"
echo "  Stop services:    docker compose down"
echo "  Restart services: docker compose restart"
echo "  View status:      docker compose ps"
echo ""
echo "Next Steps:"
echo "  1. Open http://localhost:3000 in your browser"
echo "  2. Login with the default credentials"
echo "  3. Read USAGE_GUIDE.md for detailed usage instructions"
echo "  4. Check PRACTICAL_SCENARIOS.md for real-world examples"
echo ""

# Offer to show logs
read -p "Do you want to view the logs now? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker compose logs -f
fi
