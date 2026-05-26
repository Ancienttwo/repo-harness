# Best Practices Reference

## 8. Development Protocol (Multi-Agent Philosophy)

> **核心哲学**: Token 无限 = 人力无限 = 代码即厕纸 = 重写优于修补

### The Layered Truth

```
┌─────────────────────────────────────────────────────┐
│                 IMMUTABLE LAYER (资产)               │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐       │
│  │   Spec    │  │ Contract  │  │   Tests   │       │
│  │ (What)    │  │ (Interface)│  │ (Truth)   │       │
│  └───────────┘  └───────────┘  └───────────┘       │
├─────────────────────────────────────────────────────┤
│                 MUTABLE LAYER (厕纸)                 │
│  ┌───────────────────────────────────────────┐     │
│  │              Implementation               │     │
│  │        (可随时删掉重写的代码)               │     │
│  └───────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────┘
```

### Response Protocol

```yaml
NEW_FEATURE_FLOW:
  trigger: When user says "new feature" or "新功能"
  steps:
    1. Output Spec first (功能描述、边界条件、异常处理)
    2. STOP and wait for confirmation
    3. Output Interface Contract (types, function signatures)
    4. STOP and wait for confirmation
    5. Output Implementation + Tests together
  rule: Test code quantity ≥ Implementation quantity

MODIFICATION_FLOW:
  trigger: When user says "改" or "modify"
  steps:
    1. Ask: "Change Spec or just Implementation?"
    2. If Spec changes → Regenerate everything from Spec
    3. If only Impl changes → Delete and rewrite module, keep interface

BUG_FIX_FLOW:
  trigger: When user says "bug"
  steps:
    1. Write a test that reproduces the bug FIRST
    2. Delete the affected module entirely
    3. Rewrite from scratch (never patch)
    4. Verify all tests pass
```

### Forbidden Actions

- ❌ Patching code to fix bugs (must rewrite)
- ❌ Changing interface without Spec update
- ❌ Writing code without corresponding tests
- ❌ Modifying tests to make buggy code pass

### Test Structure

```
project/
├── tests/               # Cross-package tests
│   ├── e2e/             # End-to-end tests
│   └── integration/     # Integration tests
├── packages/
│   └── {package}/
│       └── tests/       # Package-specific tests
└── vitest.config.ts     # Root test config
```

---

## 9. Observability

**Principle**: Never deploy without monitoring. Use open-source/free tiers for complete observability.

### Error Tracking
- **Sentry**: Industry standard. Developer-first with generous Free Plan
- **GlitchTip**: Open-source Sentry alternative (self-hosted)

### Product Analytics & Replay
- **PostHog**: Geek's choice. Open-source, all-in-one (analytics + session replay + feature flags)
  - Cloud version has generous free tier
  - Supports Docker self-hosted deployment

### Infrastructure Monitoring
- **Cloudflare Analytics**: Free monitoring for Workers and Pages
- **Vercel Analytics**: Built-in for Vercel deployments

---

## 10. Testing Strategy

**Principle**: Follow the **"Testing Trophy"** model. Prioritize integration tests over unit tests.

### Layered Strategy

| Layer | Purpose | Tools | Priority |
|-------|---------|-------|----------|
| Static Analysis | Catch 80% errors before runtime | TypeScript + Biome | Highest |
| Unit Tests | Test pure logic functions (utils/helpers) | Vitest | Medium |
| Integration Tests | Test component + hook interactions | Vitest + React Testing Library | **Highest** |
| E2E Tests | Test critical business flows (login, checkout) | Playwright | High |

### Tool Recommendations

```bash
# Unit + Integration testing
bun add -d vitest @testing-library/react @testing-library/jest-dom jsdom

# E2E testing (Playwright npm package — for project tests)
bun add -d @playwright/test
bunx playwright install
```

> **agent-browser vs Playwright**: `agent-browser` (npm i -g agent-browser) is for **Claude automation** — browsing, scraping, interacting with web UIs during development. `@playwright/test` is for **project E2E tests** — automated test suites that run in CI/CD. Both use Chromium, different purposes.

### AI Collaboration Prompt
> "Write Vitest test cases for this Hook covering Happy Path and Edge Cases"

---

## 11. State Management Philosophy

**Principle**: State must be strictly classified by lifecycle and scope.

### Priority Order

1. **URL State (First Priority)**
   - **Definition**: Shareable state via links (Search, Filter, Tab, Pagination)
   - **Tools**: nuqs (next-use-query-state) or TanStack Router Search Params
   - **Benefits**: Survives refresh, shareable, SEO-friendly

2. **Server State (Second Priority)**
   - **Definition**: Data from database
   - **Tools**: TanStack Query (React Query)
   - **Benefits**: Auto caching, deduping, revalidation
   - **Anti-pattern**: Never use `useEffect` to fetch data into global store

3. **Client/Global State (Third Priority)**
   - **Definition**: Pure frontend interaction state (sidebar open/close, theme, user session)
   - **Tools**: Zustand (minimal, Hooks-style) or Jotai (atomic, for complex dependencies)

### State Decision Tree

```
Is it shareable via URL?
├─ Yes → URL State (nuqs / TanStack Router)
└─ No → Is it from the server?
         ├─ Yes → Server State (TanStack Query)
         └─ No → Client State (Zustand / Jotai)
```

---

## 12. Engineering Standards

**Principle**: Faster toolchain, less configuration.

### Linting & Formatting

**Biome (Strongly Recommended)**
- Rust-based next-gen toolchain
- Replaces Prettier + ESLint
- Zero config, 30x faster

```bash
# Install Biome
npm install -D @biomejs/biome

# Initialize config
npx @biomejs/biome init
```

### Git Conventions

- Follow **Conventional Commits**:
  ```
  feat: add login page
  fix: button style issue
  docs: update README
  refactor: extract utils
  test: add unit tests
  chore: update dependencies
  ```

- Use `simple-git-hooks` for pre-commit checks:
  ```bash
  npm install -D simple-git-hooks
  ```

### CI/CD (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1  # or setup-node
      - run: bun install
      - run: bun run biome check .
      - run: bun run tsc --noEmit
      - run: bun run vitest run
```

---

## 13. Security Checklist

### Environment Variables
- Never commit `.env` files
- Use `.env.example` as template
- Validate required vars at startup

### API Security
- Use Row Level Security (RLS) with Supabase
- Validate inputs with Zod
- Rate limit public endpoints

### Dependencies
- Regular `npm audit` / `bun audit`
- Use Dependabot or Renovate for updates

---

## 14. Performance Checklist

### Bundle Size
- Analyze with `vite-bundle-visualizer`
- Dynamic imports for heavy components
- Tree-shake unused code

### Runtime Performance
- Virtualize long lists (virtua, react-virtual)
- Memoize expensive computations
- Lazy load images below fold

### Core Web Vitals
- LCP < 2.5s (Largest Contentful Paint)
- FID < 100ms (First Input Delay)
- CLS < 0.1 (Cumulative Layout Shift)

---

## 15. Documentation Standards

### Required Files
- `README.md` - Project overview, quick start
- `AGENTS.md` / `CLAUDE.md` - concise agent routing contract for Codex and Claude
- `docs/spec.md` - stable product intent
- `docs/architecture/index.md` - architecture status and module pointers
- `tasks/todo.md` - active execution checklist
- `tasks/lessons.md` - correction-derived rules
- `tasks/research.md` - deep repo findings and hidden contracts
- `docs/CHANGELOG.md` - version history when release history is relevant

Optional docs such as `docs/brief.md`, `docs/tech-stack.md`, and `docs/decisions.md`
should be created only from concrete repo evidence or explicit user request.
`docs/PROGRESS.md` is a legacy migration input, not a required generated surface;
durable progress belongs under `tasks/workstreams/`.

### Code Comments
- Comment "WHY", not "WHAT"
- English for code comments
- JSDoc for public APIs

### Architecture Decision Records (ADR)
Store in `docs/architecture/decisions/`:
```
docs/architecture/decisions/
├── 001-choose-vite-over-webpack.md
├── 002-supabase-as-backend.md
└── 003-tanstack-router-adoption.md
```

---

## 16. Deployment Checklist

### Pre-deployment
- [ ] All tests passing
- [ ] Type check passing
- [ ] Biome check passing
- [ ] Environment variables configured
- [ ] Database migrations applied

### Post-deployment
- [ ] Smoke test critical paths
- [ ] Monitor error rates (Sentry)
- [ ] Check performance metrics
- [ ] Verify analytics events

### Rollback Plan
- Document rollback procedure
- Keep previous 3 versions accessible
- Test rollback process regularly
