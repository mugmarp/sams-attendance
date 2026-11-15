# Initial page-content flash: audit and correction

13 November 2026 · Group B

## Cause

The application serves complete static HTML before JavaScript finishes checking the signed-in account, role, health and workspace navigation. The site header was initially hidden, but each page's main element was visible. Pages such as My account, Account management, Programme course setup, My courses and Timetable therefore exposed headings/forms before the workspace initialized. Wrong-role navigation could show the destination page's static content before redirecting.

The existing `[hidden] { display: none !important; }` rule was correct. Some shared pages already hid their route-specific sections, but the root loading behavior was inconsistent. This was a visual initialization/redirect defect, not evidence that the API granted unauthorized data access.

## Reproduction evidence

With page scripts disabled in an isolated local browser, the original My account page showed its heading and two forms; Account management, Programme course setup, Timetable and My courses also showed headings immediately. The root main element remained visible even on shared pages whose internal views were hidden. Delaying `/auth/me` reproduces the initialization interval without changing the live service.

## Correction

All page main elements now start with native hidden markup. A neutral “Loading SAMS…” status is initially visible. Protected content is revealed only after the existing account/role/workspace initialization succeeds. The login form appears after its client handler is ready and the cached-session redirect decision is made. Redirected users do not see the wrong workspace content first.

A small external loading helper also recognizes the existing workspace-ready header state. This supports new markup with older cached modules during a service-worker transition, avoiding a permanently hidden page. The service-worker cache version is incremented and includes the helper. No forced reload, storage clearing, password change or API permission change is introduced. A no-JavaScript message explains why the application cannot initialize if scripts are disabled.

## Verification

The original 35 browser workflows plus four loading checks form the final 39-case suite:

- Every served page keeps main content hidden before scripts execute.
- A held identity response leaves only the neutral loading state; the account form and header become visible after initialization.
- A student visiting registrar account management does not see its heading before redirecting to the student workspace.
- Simulated older cached login/common modules still reveal the correct page with the new loading helper.

The backend/API behavior is unchanged. Consult VALIDATION.md and the dated machine-readable evidence for final run results and deployment status. The first pre-helper regression run passed 38 tests; final cache-transition verification is recorded separately after execution.

## Executed result

The final **39 browser tests** and frontend syntax checks passed. Release `f7626bfac94f7a24a3c3c35c950ccc6470474006` is deployed after a private pre-release backup. HTTPS role smoke checks and ten bounded health checks passed, with zero automatic restarts. In the Codex browser, My account had the new gated markup, visible content only in the initialized workspace and a hidden loading status after completion. No account settings or attendance were changed during acceptance. Existing open tabs need a normal reload to pick up the updated page.
