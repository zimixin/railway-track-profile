# Contributing

## Branching Model (Git Flow)

### Long-lived branches
| Branch | Purpose |
|--------|---------|
| `main` | Production-ready code |
| `develop` | Integration branch for features |

### Temporary branches
| Prefix | Source | Merge into | Purpose |
|--------|--------|------------|---------|
| `feature/*` | `develop` | `develop` | New features |
| `release/*` | `develop` | `main` + `develop` | Release preparation |
| `hotfix/*` | `main` | `main` + `develop` | Urgent fixes |

### Naming rules
- ASCII only, no Cyrillic
- No spaces — use hyphens or slashes
- Examples: `feature/edit-profile`, `hotfix/crash-on-load`

---

## Commit Messages

### Best practices
- **Header:** up to **50 characters**, imperative mood
- **Body:** explain *why* the change was made, not just *what*

### Conventional Commits
```
<type>(<scope>): <short summary>

[optional body]
[optional footer]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`

Examples:
```
feat(editor): add track profile scaling
fix(render): correct axis label overflow
docs(readme): update installation steps
```

---

## Pull Requests

### Description template
- **Goal:** what problem does this solve?
- **Changes:** list of key changes
- **Screenshots / screencasts:** if UI is affected
- **Checklist:**
  - [ ] Tested locally
  - [ ] No debug/console.log leftover
  - [ ] `.gitignore` updated if new artifacts added

### Review culture
- Review is help, not criticism
- Be constructive and specific
- Approve only when satisfied

---

## Reminders
- Always check `git status` before committing/pushing
- Keep `.gitignore` up to date
- Write clear, self-explanatory PR descriptions