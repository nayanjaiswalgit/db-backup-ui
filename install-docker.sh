#!/bin/bash

# Docker Installation Script for DB Backup Platform
# Supports Ubuntu/Debian-based systems

set -e

echo "================================================"
echo "Docker Installation Script"
echo "================================================"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo "Please do not run this script as root"
    echo "Run with: ./install-docker.sh"
    exit 1
fi

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VERSION=$VERSION_ID
else
    echo "Cannot detect OS. This script supports Ubuntu/Debian only."
    exit 1
fi

echo "Detected OS: $OS $VERSION"
echo ""

# Check if Docker is already installed
if command -v docker &> /dev/null; then
    echo "Docker is already installed:"
    docker --version
    echo ""
    read -p "Do you want to reinstall Docker? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Installation cancelled."
        exit 0
    fi
fi

echo "Starting Docker installation..."
echo ""

# Remove old versions
echo "Removing old Docker versions..."
sudo apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# Update package index
echo "Updating package index..."
sudo apt-get update

# Install prerequisites
echo "Installing prerequisites..."
sudo apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Add Docker's official GPG key
echo "Adding Docker GPG key..."
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/$OS/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Set up repository
echo "Setting up Docker repository..."
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Update package index again
sudo apt-get update

# Install Docker Engine
echo "Installing Docker Engine..."
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add current user to docker group
echo "Adding user to docker group..."
sudo usermod -aG docker $USER

# Enable and start Docker
echo "Enabling Docker service..."
sudo systemctl enable docker
sudo systemctl start docker

echo ""
echo "================================================"
echo "Docker Installation Complete!"
echo "================================================"
echo ""
echo "Installed versions:"
docker --version
docker compose version
echo ""
echo "IMPORTANT: You need to log out and log back in for group changes to take effect!"
echo "Alternatively, run: newgrp docker"
echo ""
echo "After that, you can start the application with:"
echo "  docker compose up -d"
echo ""
echo "To verify Docker is working:"
echo "  docker run hello-world"
echo ""
