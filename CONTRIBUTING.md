# Contributing to DB Backup Platform

Thank you for your interest in contributing to DB Backup Platform! We welcome contributions from the community.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Enhancements](#suggesting-enhancements)

## Code of Conduct

This project adheres to a Code of Conduct. By participating, you are expected to uphold this code. Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before contributing.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/db-backup-ui.git`
3. Add upstream remote: `git remote add upstream https://github.com/nayanjaiswalgit/db-backup-ui.git`
4. Create a new branch: `git checkout -b feature/your-feature-name`

## Development Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker and Docker Compose (for local development)
- PostgreSQL 15+ (if not using Docker)
- Redis 7+ (if not using Docker)

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your configuration
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
# Edit .env with your configuration
npm run dev
```

### Docker Setup (Recommended)

```bash
docker-compose up -d
```

## How to Contribute

### Types of Contributions

We welcome various types of contributions:

- **Bug fixes**: Fix existing issues
- **New features**: Add new functionality
- **Documentation**: Improve or add documentation
- **Tests**: Add or improve test coverage
- **Performance**: Optimize existing code
- **Security**: Improve security aspects

### Before You Start

1. Check existing [issues](https://github.com/nayanjaiswalgit/db-backup-ui/issues) to avoid duplicates
2. For major changes, open an issue first to discuss your proposal
3. Ensure your changes align with the project's goals

## Coding Standards

### Python (Backend)

- Follow [PEP 8](https://pep8.org/) style guide
- Use type hints for function signatures
- Write docstrings for classes and functions
- Use `black` for code formatting: `black app/`
- Use `isort` for import sorting: `isort app/`
- Run `pylint` for linting: `pylint app/`
- Aim for 80% or higher test coverage

### TypeScript/React (Frontend)

- Follow the existing code style
- Use TypeScript for type safety
- Use functional components with hooks
- Use meaningful variable and function names
- Run `npm run lint` before committing
- Run `npm run format` to format code

### General Guidelines

- Write clean, readable, and maintainable code
- Add comments for complex logic
- Keep functions small and focused
- Follow DRY (Don't Repeat Yourself) principle
- Handle errors gracefully
- Validate all user inputs
- Never commit secrets, API keys, or credentials

## Commit Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements
- `ci`: CI/CD changes

### Examples

```bash
feat(backup): add support for MariaDB backups
fix(restore): handle connection timeout errors
docs(readme): update installation instructions
test(api): add integration tests for backup endpoints
```

## Pull Request Process

1. **Update your fork**:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Make your changes**:
   - Write or update tests
   - Update documentation if needed
   - Follow coding standards

3. **Test your changes**:
   ```bash
   # Backend tests
   cd backend
   pytest

   # Frontend tests
   cd frontend
   npm test
   ```

4. **Commit your changes**:
   ```bash
   git add .
   git commit -m "feat: your feature description"
   ```

5. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request**:
   - Go to the original repository
   - Click "New Pull Request"
   - Select your fork and branch
   - Fill in the PR template with:
     - Description of changes
     - Related issue number (if applicable)
     - Screenshots (for UI changes)
     - Testing details

7. **Address review feedback**:
   - Make requested changes
   - Push updates to your branch
   - Reply to comments

8. **Merge requirements**:
   - All tests must pass
   - Code review approval from maintainers
   - No merge conflicts
   - Documentation updated (if needed)

## Reporting Bugs

### Before Submitting

1. Check if the bug has already been reported
2. Verify you're using the latest version
3. Collect relevant information

### Bug Report Template

When creating a bug report, include:

- **Description**: Clear description of the bug
- **Steps to Reproduce**: Detailed steps to reproduce the issue
- **Expected Behavior**: What should happen
- **Actual Behavior**: What actually happens
- **Environment**:
  - OS and version
  - Python/Node.js version
  - Docker version (if applicable)
  - Browser (for frontend issues)
- **Logs**: Relevant error messages or logs
- **Screenshots**: If applicable

## Suggesting Enhancements

### Before Submitting

1. Check if the enhancement has been suggested
2. Consider if it aligns with project goals
3. Think about implementation details

### Enhancement Request Template

- **Feature Description**: Clear description of the enhancement
- **Use Case**: Why is this feature needed?
- **Proposed Solution**: How could it be implemented?
- **Alternatives**: Other approaches you've considered
- **Additional Context**: Any other relevant information

## Security Issues

**Do not open public issues for security vulnerabilities!**

Instead, please email security concerns to the maintainers or use GitHub's private security advisory feature. See [SECURITY.md](SECURITY.md) for more details.

## Questions?

If you have questions:

1. Check the [documentation](README.md)
2. Search [existing issues](https://github.com/nayanjaiswalgit/db-backup-ui/issues)
3. Ask in [GitHub Discussions](https://github.com/nayanjaiswalgit/db-backup-ui/discussions)
4. Open a new issue with the "question" label

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Recognition

Contributors will be recognized in:
- The project README
- Release notes
- GitHub contributors page

Thank you for contributing to DB Backup Platform! 🎉
