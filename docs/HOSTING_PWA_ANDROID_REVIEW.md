# SAMS web, PWA, 1 GB hosting and Android packaging review

Reviewed 11 November 2026. This document distinguishes inspected repository facts, documented platform capabilities, recommendations and unverified deployment conditions. No hosting deployment, Android build or Android device test was performed.

## 1. What SAMS is today

SAMS is a client-server web application. Express serves HTML/CSS/browser JavaScript and `/api`; the API connects to PostgreSQL using Prisma. The browser never connects directly to PostgreSQL. An Android package would be another client of the same API, not another copy of the production database or Express server.

It also contains Progressive Web App (PWA) features:

- `frontend/public/manifest.webmanifest`: name, standalone display, `/login` start URL, colors and one SVG icon.
- `frontend/public/sw.js`: static application-shell caching and navigation fallback.
- `frontend/public/js/offline.js`: IndexedDB student snapshots and pending attempts.
- `frontend/public/js/common.js`: service-worker registration after authenticated-page initialization.

“PWA” is the relevant term; “PWD” ordinarily means something different. The presence of these features does not establish that installation, updates and offline behavior have been verified on every target Android browser. The current manifest has one SVG icon; add tested launcher assets, including compatible 192/512 PNG and maskable variants, explicit identity/scope and a device installation test. First-time offline login is not supported. Registration after authentication means simply opening the login page is not the same as preparing the application for offline use.

A PWA can be installed from a supporting browser without an APK. It remains a web application. Installability varies across browsers; an installed window also does not establish that the attendance workflow is fully offline. See [MDN installability guidance](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) and [web.dev manifest guidance](https://web.dev/learn/pwa/web-app-manifest).

## 2. What is known about the proposed server

The user reports a 1 GB server. Its available RAM, CPU, disk, swap, existing workloads, database size, domain, operating system and expected simultaneous class activity have not been verified. An attempted read-only SSH connection using `myvps` could not resolve the hostname in this environment. Local workstation memory is not evidence about VPS memory. No server capacity claim or concurrency guarantee follows from this review.

The repository is comparatively simple to host: one Node application, one PostgreSQL database and an HTTPS reverse proxy. The frontend needs no separate runtime server. PDF generation uses PDFKit, not a resident browser. Compose has persistent PostgreSQL storage and loopback-only host bindings. There is no required Redis, React development server or Android emulator in production.

My assessment is that **1 GB is a plausible candidate for a small, controlled deployment, subject to measurement**. It is not an established capacity for a class, department or university. Packaging Android clients will not remove API or database workload; synchronized check-in bursts can still overload a small server.

Recommended topology:

```text
Browser / installed PWA / Android client
                    |
                  HTTPS
                    |
       Reverse proxy on the user's VPS
                    |
       One Express process, including static web files
                    |
              Private PostgreSQL
```

The database can be on the same VPS if measured resources permit, or separately hosted if memory/operations justify it. A managed database is an option, not an automatic requirement. The existing VPS means Render/Railway/Heroku are not prerequisites.

### Resource controls to evaluate

1. Inventory actual available memory and cohosted services. Keep headroom for the operating system, proxy, PostgreSQL background work, Prisma engine, report generation and bursts. Node heap size alone is not total application memory.
2. Run one application instance initially. Set and measure a small Prisma connection pool and compatible PostgreSQL connection budget; do not allow CPU-derived defaults to decide the entire memory budget. Existing Prisma is 5.x with an engine-managed pool; do not apply Prisma 7 adapter instructions blindly. The documented older-engine pool uses `connection_limit`; see [Prisma's versioned pool documentation](https://www.prisma.io/docs/orm/v6/prisma-client/setup-and-configuration/databases-connections/connection-pool).
3. Review PostgreSQL `shared_buffers`, per-query `work_mem`, connections and maintenance settings together. Per-query memory can multiply with concurrent work. Do not paste settings intended for a larger dedicated database server. See [PostgreSQL 16 resource settings](https://www.postgresql.org/docs/16/runtime-config-resource.html).
4. Build/test application images and Android packages outside the small runtime VPS. The current Dockerfile runs `npm ci`, including development tools, and generation/migration steps have a separate peak footprint. Evaluate a prepared runtime image rather than building during a class.
5. Treat swap as a possible OOM buffer, not a way to provide predictable database latency. Containers still share the host's RAM. Add measured resource limits rather than assuming Docker either solves memory usage or is inherently too expensive.
6. Keep reports bounded. Current eligibility reporting loads a course's completed sessions and attendances into JavaScript and searches those arrays per student; PDF generation buffers pages/output. For larger histories or concurrent exports, aggregate counts in the database, paginate lists and bound PDF concurrency.
7. Avoid needless polling in hidden/background pages. The current lecturer class screen makes two requests every five seconds: 24 requests per minute per open class screen, before user actions. The dashboard polls every ten seconds. Those are request-count calculations, not throughput measurements.
8. Review shared-network rate limiting. The global limit is currently 600 API requests/minute per IP. Multiple lecturers and students behind one campus NAT can hit it collectively. Correct proxy trust and a deliberate mix of account-based and IP-based limits matter independently of RAM capacity.
9. Keep PostgreSQL private, enable HTTPS, retain backups off the VPS, cap/rotate logs and verify a restore. One server hosting both app and database is one failure domain; a named volume is not a backup.

Before claiming that 1 GB is sufficient, measure steady-state memory, peak memory, swap activity, CPU, disk, database connections, OOM/restarts, request latency and error rates. Test the actual intended number of simultaneous students checking into the same class, delayed operations reconnecting together, lecturers polling, login/password hashing, report exports and migration/startup peaks. Existing per-session row locks serialize changes to one class; include that contention in the test. Agree acceptance thresholds from the intended pilot, not an invented user count.

## 3. Android options compared

| Option | Where UI comes from | API/database | Offline startup | Update model | Fit |
|---|---|---|---|---|---|
| Browser-installed PWA | Hosted website; saved service-worker assets | Existing hosted API/PostgreSQL | Requires prepared cache and data | Website plus controlled service-worker lifecycle | First deployment target |
| Trusted Web Activity (TWA) | Hosted web app rendered by a supporting browser | Same origin as website | Depends on prepared web cache/data | Web content updates; native shell updates separately | Preferred lightweight APK route when website-equivalent functionality is sufficient |
| Custom hosted WebView | Hosted URL inside app-owned WebView | Same hosted API | Must verify WebView cache/service-worker behavior; initial install has no guaranteed prepared web data | Website plus wrapper lifecycle | Feasible, but more browser responsibilities to implement |
| Capacitor bundled client | HTML/CSS/JS packaged in Android application | Remote HTTPS API, local saved data/outbox | Packaged shell can open without network; login/roster still require preparation | Signed application releases for bundled code | Stronger candidate if packaged offline startup or native integrations are actual requirements |

A TWA opens the web application using the browser and verifies the app/site relationship with Digital Asset Links. It is not a custom WebView. Bubblewrap can generate the Android project from a web manifest. A stable HTTPS origin and `/.well-known/assetlinks.json` linked to the actual signing certificate are needed. Package signing and Play signing certificates must be handled correctly. See [Android's TWA overview](https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities) and [quick start](https://developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2).

A custom WebView uses app-owned browser storage rather than assuming the existing phone browser's signed-in state. Test login, persistence and app upgrades separately. It needs trusted-origin navigation checks, external-link handling, Android back navigation, loading/error/offline screens, HTTPS enforcement, appropriate storage/JavaScript configuration and PDF download/share handling. Current PDF export uses a blob URL and an anchor download; normal browser success does not establish WebView download success. See [Android's WebView guide](https://developer.android.com/develop/ui/views/layout/webapps/webview) and [URI-loading guidance](https://developer.android.com/privacy-and-security/risks/unsafe-uri-loading).

Capacitor provides a native runtime around web assets and optional plugins; it does not require rewriting screens in React, Ionic UI or TypeScript. JavaScript configuration can be used. Generated Android build/platform files are additional infrastructure. Native custom work may require Java/Kotlin, but existing application UI and business JavaScript can remain. See [Capacitor Android](https://capacitorjs.com/docs/android) and [development workflow](https://capacitorjs.com/docs/basics/workflow).

Do not use Capacitor's remote `server.url` as the normal production architecture: its official configuration marks that setting as intended for live reload rather than production. Use bundled assets when choosing that route. See [Capacitor configuration](https://capacitorjs.com/docs/config).

## 4. Corrections to the supplied advice

### Hosted URL strategy

The basic architecture is sound. Hosting Express and PostgreSQL and loading the HTTPS website preserves same-origin API calls. The exact current login route is `/api/auth/login`, not `/api/login`. The website must first be verified on a real phone; hosting does not imply it will work flawlessly.

The Kotlin snippet is a minimal starting point, not a complete application. Assigning `WebViewClient()` alone does not restrict navigation to SAMS. Enable JavaScript only for trusted content, validate scheme and full host, open external sites appropriately, never bypass TLS errors, and avoid exposing unnecessary native JavaScript bridges. Android UI/lifecycle, storage and PDF tests remain necessary.

For an Android shell whose sole purpose is to show the hosted PWA, evaluate TWA before maintaining a custom WebView.

### Bundled frontend strategy

Feasible, but changing a fetch URL is not sufficient for this repository:

- Actual deployable assets are under `frontend/public`, not the entire `frontend` directory, which also has development/test material.
- There is no current `index.html`. Express redirects `/` to `/login` and maps friendly URLs to `login.html`, `examiner.html`, `student.html` and `admin.html`.
- Scripts inspect `location.pathname`; links use `/examiner/session/:id`, `/student/summary`, `/admin/eligibility/:id` and similar paths. A local asset directory does not automatically reproduce Express routing. Introduce a deliberate client-side route layer or an explicitly supported local-server mapping, and test direct links/back navigation.
- `api.js` centralizes `/api` requests. Introduce a trusted per-target API base configuration and preserve endpoint paths. Calling only `fetch('https://backend.example')` drops the requested endpoint and is not an equivalent replacement.
- A packaged client has a different origin, service-worker/cache behavior, token store and release lifecycle. Keep storage origins stable across app upgrades. A local app's `localhost` is on the phone, not the VPS.
- Test network failure, database/version compatibility, queued work through updates, and PDF export on the packaged runtime.

Use a maintained packaging runtime or Android's `WebViewAssetLoader` instead of adopting `file:///android_asset/...` as the default. Android documents the limitations of file/data origins and recommends HTTP(S)-style asset loading. Do not bypass them with universal file access. See [Android in-app content guidance](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content).

### CORS

The statement “Express blocks these requests by default” is inaccurate. Browsers enforce cross-origin response access; Express does not inherently refuse a request simply because its origin differs. Preflights can prevent the actual request when the policy is not satisfied.

SAMS already imports and uses `cors`, configured for `FRONTEND_URL`. A packaged client using browser fetch would need its actual origin added to a deliberate allowlist, together with the hosted web origin. Verify that origin in the selected runtime; do not guess it, allow `null`, or use a wildcard to make the problem disappear. Native HTTP plugins have different browser-CORS behavior, but still require authentication and server authorization. CORS is not an authentication boundary. See [MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).

### Storage flag

Enable `javaScriptEnabled` and `domStorageEnabled` for this trusted application in a custom WebView: SAMS uses JavaScript and localStorage. Android documents DOM storage as disabled by default. However, the claim that this flag alone enables every IndexedDB/offline capability and prevents an inevitable immediate crash is too strong. IndexedDB, service workers, secure origins, runtime support, quota, upgrades and lifecycle require separate checks. Do not add obsolete Web SQL/database flags as a substitute. See [Android WebSettings](https://developer.android.com/reference/android/webkit/WebSettings#setDomStorageEnabled(boolean)).

## 5. Packaging does not solve offline attendance

All options still need the earlier [offline reconciliation design](OFFLINE_REALISM_REVIEW.md). An APK does not make an expired code valid, prove physical presence or place the central database on the phone.

Bundling assets improves availability of the initial screen. A useful offline register additionally requires prepared identity, dated classes, rosters, durable local marks, operation IDs, replay receipts and explicit conflict handling. First-time offline login or access to a roster never downloaded remains unavailable.

PWA and TWA depend on web capabilities and prepared caches. A custom WebView or Capacitor wrapper does not automatically replay JavaScript work after Android kills the application. A native WorkManager component could schedule persistent synchronization, but would need an intentionally designed storage/authentication bridge; a native worker cannot simply read the page's IndexedDB/localStorage and run the current window-dependent module unchanged. Android schedules work subject to system constraints, not an exact reconnect deadline. See [Android persistent background work](https://developer.android.com/develop/background-work/background-tasks/persistent).

For the first version, promise synchronization when the user opens/resumes the app and explicitly show pending counts. Background synchronization should be a tested enhancement, not a packaging claim. Shared sync rules can serve both web and packaged clients while local-storage/native adapters remain distinct where required.

## 6. Recommended decision and implementation sequence

1. Keep one attendance backend and one official PostgreSQL dataset. Deploy the same-origin web application on the existing VPS only after checking its resources and load. Use a stable HTTPS domain; do not bake an unverified host into an APK.
2. Complete PWA installation assets, update handling and phone tests, alongside the scoped lecturer-offline register and durable reconciliation protocol. Preserve pending work during updates and separate provisional marks from official totals.
3. If the objective is an Android launcher/application package for the hosted experience, use TWA as the first candidate. It preserves the present routing/API design and avoids writing a miniature browser container.
4. If the requirement is specifically a shell available on first launch without downloading the website, or concrete native integrations, use a bundled Capacitor client. Budget the routing, API origin, storage, download and release work. First offline launch still cannot authenticate a new user or invent missing roster data.
5. Keep any native project separate from the Express runtime and exclude Android SDK/Gradle/emulator workloads from the 1 GB production server. Produce signed artifacts on a workstation or CI. APK distribution and Play publication are separate delivery choices; producing an APK does not establish store approval.

Acceptance must include physical Android tests: install/launch online and offline, sign in, app restart, token expiry, account switching, prepared roster access, delayed uploads, lost responses, navigation/back button, PDF download, app upgrade with pending marks, server outage and recovery. Server load must include reconnect bursts and shared-network rate limits.

Remaining facts to establish before implementation: actual VPS endpoint/resources and cohosted workload; intended class sizes and simultaneous sessions; domain control; Android distribution choice; and whether bundled startup/native functionality is required or an installed web experience is sufficient. These are open decisions, not assumptions made by this review.
