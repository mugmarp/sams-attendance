# GitHub PRs, Merges & Conflicts — Practical Guide for Group B

## The Workflow (What You'll Actually Do)

```
main branch (protected, always working)
    ↑
    │  1. Create feature branch
    │  2. Make changes, commit
    │  3. Push branch → Open Pull Request
    │  4. Team reviews, you fix comments
    │  5. Merge PR → branch deleted
    └── main updated
```

---

## Step-by-Step for Each Member

### 1. Start Fresh Every Time
```bash
git checkout main
git pull origin main          # Get latest
git checkout -b your-name/short-task-description
# Example: git checkout -b lewis/add-student-model
```

### 2. Work & Commit Locally
```bash
# Edit files...
git add .
git commit -m "feat: add Student model with validation"
# Use conventional commits: feat/fix/docs/refactor/chore
```

### 3. Push & Open PR
```bash
git push -u origin your-name/short-task-description
# Then go to GitHub → "Compare & pull request" → Create PR
```

### 4. PR Template (Use This)
```markdown
## What
Brief description of changes

## Why
Link to issue or task

## Testing
- [ ] Unit tests pass
- [ ] Manual test: describe steps

## Screenshots (if frontend)
```

### 5. Review Process
- **At least 1 other member reviews** (assign them in PR)
- Reviewer: checks logic, naming, tests, no console.logs
- You: address comments → push new commits (auto-updates PR)

### 6. Merge
- **Squash and merge** (default) → 1 clean commit on main
- Delete branch after merge (GitHub button)

---

## Merge Conflicts — Prevention First

| Prevention | How |
|------------|-----|
| **Small PRs** | One logical change per PR (< 300 lines) |
| **Sync often** | `git pull origin main` before starting & daily |
| **Talk to team** | Claim tasks in group chat — don't overlap |
| **File ownership** | One person owns a file at a time |

---

## If Conflict Happens (It Will)

**Scenario:** You and Brian both edited `server.js`

```bash
# 1. You're on your branch, main has moved
git checkout main
git pull origin main
git checkout your-branch
git merge main        # ← CONFLICT HERE

# 2. Git marks conflicts in files:
# <<<<<<< HEAD (your changes)
# your code
# =======
# main's code
# >>>>>>> main

# 3. Edit file → keep what's correct, delete markers
# 4. Then:
git add server.js
git commit -m "resolve: merge main into feature"
git push
# PR auto-updates, conflict resolved
```

**VS Code makes this visual** — use "Accept Current / Accept Incoming / Accept Both" buttons.

---

## Branch Naming Convention (Enforce This)

| Type | Format | Example |
|------|--------|---------|
| Feature | `name/feat-short-desc` | `lewis/feat-student-crud` |
| Bug fix | `name/fix-short-desc` | `brian/fix-login-validation` |
| Docs | `name/docs-short-desc` | `markpaul/docs-readme-setup` |
| Refactor | `name/refactor-short-desc` | `charles/refactor-db-connection` |

---

## Protection Rules (Set These Now)

In GitHub → Settings → Branches → Add rule for `main`:
- ✅ Require PR before merge
- ✅ Require 1 approval
- ✅ Dismiss stale reviews on new commits
- ✅ Require status checks (add CI later)
- ✅ **Do NOT allow force push**
- ✅ **Do NOT allow deletion**

---

## Daily Commands Cheat Sheet

```bash
# Morning sync
git checkout main && git pull

# Start task
git checkout -b lewis/feat-new-endpoint

# Work...
git add -A && git commit -m "feat: add GET /students"

# Push & PR
git push -u origin lewis/feat-new-endpoint

# After review + merge → cleanup
git checkout main && git pull
git branch -d lewis/feat-new-endpoint
git push origin --delete lewis/feat-new-endpoint  # optional
```

---

## For Your Team — First Session (30 min)

1. **Everyone clones** the repo
2. **Pair up** — one creates a dummy PR, other reviews
3. **Practice conflict**: both edit same line in `README.md`, merge, resolve
4. **Set up GitHub notifications** (watch repo → "All activity")

---

## Key Principle

> **Main is always deployable.** If your PR breaks main, you revert immediately and fix in a new PR.