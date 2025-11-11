# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-11-11

### Added
- Initial open source release
- Multi-database backup support (PostgreSQL, MySQL, MongoDB, Redis)
- Multi-environment deployment (Docker, Kubernetes/K3s, bare-metal)
- Server management with secure credential storage
- Multiple backup types (full, incremental, differential)
- AES-256-GCM encryption and compression (gzip/lz4/zstd)
- S3-compatible storage integration
- Cron-based backup scheduling
- Cross-environment restore with data masking
- Remote command automation
- Real-time monitoring with WebSocket
- Notification channels (Slack, Email, webhooks)
- Complete audit trail
- Role-based access control (Admin, Operator, Viewer)
- FastAPI backend with async/await
- React 18 + TypeScript frontend with Tailwind CSS
- Celery task queue for async operations
- Comprehensive documentation
- Docker and Kubernetes deployment configurations
- Security hardening features
- CI/CD workflows with GitHub Actions

### Security
- Input validation and sanitization
- Command injection prevention
- Rate limiting
- Credential encryption with Fernet
- JWT authentication
- Security headers middleware

## [Unreleased]

### Planned
- Support for additional databases (Oracle, SQL Server)
- Built-in data masking rules
- Backup verification and integrity checks
- Multi-tenancy support
- Grafana dashboard integration
- Terraform provider
- Ansible playbooks
- Mobile monitoring app
