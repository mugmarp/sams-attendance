# Assignment alignment and JavaScript migration

Preserve the verified SAMS attendance rules and PostgreSQL schema while making the application explainable as plain JavaScript, HTML and CSS. Individual member contributions are excluded from this task at the user's request.

1. Convert backend, seed/import tools and tests to readable JavaScript ES modules. Run directly with Node; remove TypeScript compilation and type-only dependencies.
2. Replace React/JSX, Tailwind and Vite with HTML pages, authored CSS and browser JavaScript modules served by Express. Preserve the existing API and the lecturer, student and registrar journeys.
3. Preserve runtime validation, database transactions, rotating codes, audit history and honest offline behavior. Keep PostgreSQL/Prisma; Prisma supports JavaScript.
4. Deliver a runnable Postman collection with positive/negative cases, status/body assertions, sample responses and a separate presentation runbook. Verify it against an isolated live database.
5. Consolidate the proposal, users/features/benefits/scope and presentation rationale. Do not claim public institutional deployment or invent individual member contributions.
6. Re-run backend, browser, database and deployment verification. Use detailed commits and a separate review PR; preserve the earlier implementation branch.
