# Contributing to Lumina AI

Thank you for your interest in contributing to Lumina AI! To ensure a smooth collaboration and maintain code quality, please follow the guidelines below.

## Git Commit Convention

We use a lightweight adaptation of [Conventional Commits](https://www.conventionalcommits.org/), and we encourage the use of emojis in commit messages to make the history more visual and lively.

### 1. Commit Message Format

```text
<type>(<scope>): <emoji> <description>
```

**Rule**: Keep the first line of the commit message (the subject line) **under 72 characters** so it doesn't get truncated in GitHub or terminal logs. If more context is needed, add an empty line after the subject, followed by a detailed body.

### 2. Allowed Types

- `feat`: A new feature
- `fix`: A bug fix
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `style`: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc.)
- `docs`: Documentation only changes
- `chore`: Changes to the build process or auxiliary tools and libraries (e.g., updating dependencies)
- `perf`: A code change that improves performance

### 3. Common Scopes

Indicate the module your commit primarily affects. Common scopes include:

- `tauri`: Backend Rust logic and IPC (`src-tauri` directory)
- `ui`: Frontend React components, styling (`src/components`, `src/panel`)
- `dsl`: JSON engine and parser logic
- `store`: State management (`src/stores`)
- `config`: Project configuration files (`vite.config.ts`, `tauri.conf.json`)
- `deps`: Dependency updates

### 4. Examples

- `feat(ui): 🎨 optimize visual feedback during timeline dragging`
- `fix(tauri): 🐛 fix engine crash when handling overlapping tracks`
- `refactor(dsl): ♻️ refactor JSON parsing logic to support deeper nesting`
- `docs(readme): 📝 add project demonstration GIFs`

## Branching & Merging Strategy

- **Direct Commits to `main` are STRICTLY FORBIDDEN.**
- **Create Branches**: All feature development and bug fixes must be done on a new branch checked out from `main` (e.g., `feat/timeline-drag`, `fix/overlap-crash`).
- **Use Pull Requests**: Once your work is complete, open a Pull Request (PR) to merge your branch back into `main`.