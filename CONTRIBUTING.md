# Contributing to Topix

Thank you for your interest in contributing to Topix! This document provides guidelines for contributing to the project.

## Getting Started

1. **Fork the repository**
2. **Clone your fork:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/topix.git
   cd topix
   ```
3. **Install dependencies:**
   ```bash
   npm install
   ```
4. **Run tests:**
   ```bash
   npm test
   ```

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### 2. Make Your Changes

- Write clear, documented code
- Follow the existing code style
- Add tests for new features
- Update documentation as needed

### 3. Test Your Changes

```bash
# Run tests
npm test

# Run linter
npm run lint

# Type check
npm run typecheck

# Build
npm run build
```

### 4. Commit Your Changes

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
git commit -m "feat: add new plugin for GitHub notifications"
git commit -m "fix: resolve OAuth2 token refresh issue"
git commit -m "docs: update plugin development guide"
```

**Commit types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### 5. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## Code Style

### TypeScript

- Use TypeScript strict mode
- Prefer `interface` over `type` for object shapes
- Use explicit return types for functions
- Avoid `any` - use `unknown` if type is truly unknown

### Formatting

We use Prettier for code formatting. Run:

```bash
npm run format
```

### Linting

We use ESLint. Run:

```bash
npm run lint
npm run lint:fix  # Auto-fix issues
```

## Testing

- Write tests for new features
- Maintain test coverage >80%
- Use descriptive test names
- Mock external dependencies

```typescript
describe('ExamplePlugin', () => {
  it('should fetch headlines successfully', async () => {
    const plugin = new ExamplePlugin();
    const headlines = await plugin.fetchHeadlines(mockContext);
    expect(headlines).toHaveLength(1);
  });
});
```

## Plugin Development

See [docs/plugin-development.md](docs/plugin-development.md) for detailed guide.

### Quick Start

1. Create file in `src/plugins/your-plugin.ts`
2. Implement `TopixPlugin` interface
3. Export plugin instance: `export default new YourPlugin();`
4. Add tests in `test/unit/plugins/your-plugin.test.ts`
5. Document in README.md

## Pull Request Guidelines

### Before Submitting

- [ ] Tests pass (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] Code is formatted (`npm run format`)
- [ ] Documentation is updated
- [ ] Commit messages follow conventional commits
- [ ] Branch is up to date with `main`

### PR Description

Include:
- **What:** Brief description of changes
- **Why:** Reason for changes
- **How:** Implementation approach
- **Testing:** How you tested the changes
- **Screenshots:** If UI changes (TUI)

### Review Process

1. Automated checks must pass (CI/CD)
2. At least one maintainer approval required
3. All review comments addressed
4. Squash and merge to `main`

## Project Structure

```
topix/
├── src/
│   ├── index.ts           # CLI entry point
│   ├── plugins/           # Built-in plugins
│   ├── managers/          # Core managers
│   ├── models/            # Data models and types
│   ├── utils/             # Utility functions
│   ├── tui/               # Terminal UI (ink)
│   ├── api/               # REST API
│   ├── llm/               # LLM providers
│   └── auth/              # Authentication
├── test/
│   ├── unit/              # Unit tests
│   └── integration/       # Integration tests
├── docs/                  # Documentation
└── scripts/               # Build/release scripts
```

## Documentation

- Update README.md for user-facing changes
- Update code comments for implementation details
- Create/update docs/ files for guides
- Include JSDoc comments for public APIs

## Questions?

- Open an issue for questions
- Join discussions on GitHub
- Check existing issues/PRs first

## Code of Conduct

Be respectful and constructive. We're all here to build something great together.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
