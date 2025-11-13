# Quick Start Guide

## Issue: Docker Not Installed

This project requires Docker and Docker Compose to run. Currently, Docker is not installed in your environment.

## Solution Options

### Option 1: Install Docker (Recommended)

Run the installation script provided:

```bash
chmod +x install-docker.sh
./install-docker.sh
```

After installation, start the project:

```bash
docker compose up -d
```

### Option 2: Manual Docker Installation

#### For Ubuntu/Debian:

```bash
# Remove old versions
sudo apt-get remove docker docker-engine docker.io containerd runc

# Update package index
sudo apt-get update

# Install prerequisites
sudo apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Add Docker's official GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Set up repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add your user to docker group (to run without sudo)
sudo usermod -aG docker $USER

# Start Docker
sudo systemctl enable docker
sudo systemctl start docker

# Verify installation
docker --version
docker compose version
```

Log out and log back in for group changes to take effect, then:

```bash
docker compose up -d
```

### Option 3: Local Development Without Docker

If you cannot install Docker, you can run the services locally:

#### Prerequisites

Install these first:
- Python 3.11+
- Node.js 20+
- PostgreSQL 15+
- Redis 7+

#### Setup Steps

1. **Start PostgreSQL:**
```bash
# Install PostgreSQL
sudo apt-get install postgresql postgresql-contrib

# Start PostgreSQL
sudo systemctl start postgresql

# Create database
sudo -u postgres psql -c "CREATE DATABASE dbbackup;"
sudo -u postgres psql -c "CREATE USER postgres WITH PASSWORD 'postgres';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE dbbackup TO postgres;"
```

2. **Start Redis:**
```bash
# Install Redis
sudo apt-get install redis-server

# Start Redis
sudo systemctl start redis-server
```

3. **Set up MinIO (optional, for S3 storage):**
```bash
# Download MinIO
wget https://dl.min.io/server/minio/release/linux-amd64/minio
chmod +x minio
sudo mv minio /usr/local/bin/

# Create data directory
mkdir -p ~/minio/data

# Start MinIO
MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD=minioadmin \
  minio server ~/minio/data --console-address ":9001" &
```

4. **Set up Backend:**
```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env

# Run migrations
alembic upgrade head

# Start backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &

# Start Celery worker
celery -A app.celery.celery_app worker --loglevel=info &

# Start Celery beat
celery -A app.celery.celery_app beat --loglevel=info &
```

5. **Set up Frontend:**
```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

6. **Access the application:**
- Frontend: http://localhost:5173 (Vite dev server)
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/api/v1/docs
- MinIO Console: http://localhost:9001

## Verifying the Setup

### With Docker:
```bash
# Check all services are running
docker compose ps

# View logs
docker compose logs -f

# Check backend health
curl http://localhost:8000/health
```

### Without Docker:
```bash
# Check PostgreSQL
sudo systemctl status postgresql

# Check Redis
redis-cli ping

# Check backend
curl http://localhost:8000/health

# Check processes
ps aux | grep -E "(uvicorn|celery|minio)"
```

## Troubleshooting

### Docker Permission Denied
```bash
sudo usermod -aG docker $USER
# Log out and log back in
```

### Port Already in Use
```bash
# Check what's using the port
sudo lsof -i :8000
sudo lsof -i :3000

# Kill the process or change ports in docker-compose.yml
```

### Database Connection Issues
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check connection
psql postgresql://postgres:postgres@localhost:5432/dbbackup
```

### Redis Connection Issues
```bash
# Check Redis is running
sudo systemctl status redis-server

# Test connection
redis-cli ping
```

## Next Steps

After successful setup:

1. Access the frontend at http://localhost:3000
2. Login with default credentials:
   - Username: `admin`
   - Password: `admin123`
3. Follow the [USAGE_GUIDE.md](USAGE_GUIDE.md) for detailed usage instructions
4. Read [PRACTICAL_SCENARIOS.md](PRACTICAL_SCENARIOS.md) for real-world examples

## Need Help?

- Check [README.md](README.md) for detailed documentation
- See [DEPLOYMENT.md](DEPLOYMENT.md) for production deployment
- Review [ARCHITECTURE.md](ARCHITECTURE.md) to understand the system design
