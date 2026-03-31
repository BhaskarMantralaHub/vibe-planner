# Testing Reference

## Output Formats
- **Console**: verbose pass/fail per test with logs
- **JUnit XML**: `test-results/junit-report.xml` (CI-compatible)
- **HTML Coverage**: `test-results/coverage/index.html` (open in browser)

## Test Structure

| File | Coverage |
|------|----------|
| `tests/unit/auth-helpers.test.ts` | `lib/auth.ts` — error sanitization, password validation, rate limiting |
| `tests/unit/auth-store-init.test.ts` | Auth store init(), token flows, onAuthStateChange, checkProfileAndSetUser |
| `tests/unit/welcome-messages.test.ts` | Welcome message generation and @mention captions |
| `tests/unit/cricket-store-core.test.ts` | Players, seasons, expenses, settlements, fees, sponsorships (local mode) |
| `tests/unit/cricket-store-gallery.test.ts` | Gallery posts, comments, likes, reactions, notifications (local mode) |
| `tests/unit/cricket-store-cloud.test.ts` | All cricket store Supabase cloud-mode paths + ID reconciliation |
| `tests/unit/vibe-store.test.ts` | Vibe planner CRUD, timer, trash, views (local mode) |
| `tests/unit/vibe-store-cloud.test.ts` | Vibe store Supabase cloud-mode paths |
| `tests/unit/id-tracker-store.test.ts` | ID document CRUD (local mode) |
| `tests/unit/id-tracker-store-cloud.test.ts` | ID tracker Supabase cloud-mode paths |
| `tests/unit/lib-storage.test.ts` | localStorage load/save utilities |
| `tests/unit/lib-nav.test.ts` | Navigation config and role assignments |
| `tests/unit/lib-supabase-client.test.ts` | Supabase client singleton and null guards |
| `tests/integration/signup-flows.test.ts` | All 6 signup/access flows + login + password + edge cases |

## Mock Setup
- Supabase client is mocked via `vi.mock('@/lib/supabase/client')` — stores run in local-only mode
- Fixtures in `tests/mocks/fixtures.ts` — shared test data for all suites
- Supabase query builder mock in `tests/mocks/supabase.ts`
- Store state is reset in `beforeEach` using fixtures
