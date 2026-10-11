# Private Feedback Widget implementation plan

Status: approved by parent after two delegated review rounds on 2026-10-11; parent corrections below are authoritative. Implements the confirmed design in [private-feedback-design.md](private-feedback-design.md) (Q33, 2026-10-11), with [CONTEXT.md](../CONTEXT.md) terms and ADRs [0001](adr/0001-separate-reporter-and-dashboard-identities.md), [0002](adr/0002-let-applications-control-submission-access.md), and [0003](adr/0003-separate-private-feedback-records.md). This plan does not reopen product decisions. GitHub, video, reporter emails, persistent drafts, content revisions, durable email retries, and any new queue stay out of scope.

## Ground rules for every phase

- Branch from an updated `main` as `feat/private-feedback-widget`; use Conventional Commits. Do not merge.
- Public behavior stays unchanged except for the narrow extensions this plan names: the private access grant on invites and members, invite acceptance no longer downgrading a stronger membership, status deletion counting private reports, and the orphan sweep recognizing private keys.
- Do not add test files or change test suites. Run existing checks and verify new helpers through disposable inline probes outside the repository, plus real browser/API checks.
- Reuse what exists: `createDb`, `db.batch` (D1 batches and libsql batches each run as one transaction), the `UPLOADS` bucket helpers in `apps/web/src/lib/attachment-db.ts`, image rules in `apps/web/src/lib/attachments.ts`, `rateLimit`/`uploadAllowed` and the existing `UPLOAD_USER_LIMIT`/`UPLOAD_IP_LIMIT` bindings in `apps/web/src/lib/rate-limit.ts`, statuses in `apps/web/src/lib/status-db.ts`, `deliver`/`inBackground`/`pickRecipients` in `apps/web/src/lib/notify.ts`, `emailLayout`/`escapeHtml` in `apps/web/src/lib/email.ts`, `OpCtx`/`OpError`, `parseEmbedOrigins`/`frameAncestors`, the dashboard `Panel` shell, and `packages/ui` components.
- No private API/MCP surface in this version. `apps/web/src/routes/api/v1/$.ts` and `apps/web/src/lib/mcp/*` stay unchanged.
- Server-only modules load through dynamic `import()` in route files, as existing routes do.
- Object keys keep the `${workspaceId}/${id}` shape (`objectKey`) accepted by the local bucket (`^[a-z0-9-]+/[A-Za-z0-9_-]+$`). Private objects use server-issued, distinct id namespaces (Phase 2): `pf_<newId>` for report images and `pl_<newId>` for private logos. Both are 25 characters, so they never equal an existing 22-character attachment or logo id. Clients never supply a report-image key.
- No new infrastructure bindings, so `packages/infra/alchemy.run.ts` is unchanged.

## Phase 1: Data, migration, and team access

### Schema (`packages/db/src/schema/feedback.ts`)

Add three columns:

- `membership.private_access` integer boolean, default `false`, not null. It is the explicit teammate grant. Admin role already implies access, and ordinary public signups stay `false`.
- `membership.notify_private_feedback` integer boolean, nullable. `null` means the role default: admins get email, authorized teammates do not. `true`/`false` is an explicit choice.
- `invite.private_access` integer boolean, default `false`, not null. The invitation carries the grant.

Add three tables:

- `private_feedback`
  - Columns: `id` text PK (`newId`, exported from `attachment-db.ts`); `workspace_id` FK `workspace` on delete cascade; `submission_id` text; `content_hash` text; `type` enum `bug|feature`; `title`; `message`; `reporter_name`; `reporter_email`; `metadata` text (nullable, canonical compact JSON); `images` JSON array of `{ id, contentType, size, width, height }` (≤4, each `id` is `pf_…`, key derived as `objectKey(workspace_id, id)`); `images_size` integer; `status` text (a status key); `assignee_id` FK `user` on delete set null (nullable); `created_at`, `updated_at`, `status_changed_at` as integer ms.
  - Indexes: unique `(workspace_id, submission_id)`, `(workspace_id, created_at, id)` for the list cursor and the daily byte sum, `(workspace_id, status)`, and `(assignee_id)`.
- `private_feedback_activity`
  - Columns: `id` integer autoincrement; `feedback_id` FK `private_feedback` on delete cascade; `actor_id` FK `user` on delete set null; `type` enum `note|status|assign`; `body` (nullable); `from_value`, `to_value` (nullable); `created_at`.
  - Index: `(feedback_id)`. Notes and status/assignment history only; not an audit framework.
- `private_widget`
  - Columns: `workspace_id` text PK, FK `workspace` on delete cascade; `settings` JSON (nullable = defaults); `origins` text (nullable, same format as `widget_origins`); `logo_id` text (nullable, always `pl_…`); `updated_at`; `updated_by` FK `user` on delete set null.
  - A separate table, not `workspace` columns: `getWorkspace` returns the whole `workspace` row to every visitor through the root loader (`apps/web/src/functions/workspace.ts`).

Add matching drizzle `relations`.

### Migrations

- **Cloudflare:** hand-write `packages/db/migrations/0021_private_feedback.sql` (`ALTER TABLE ... ADD`, `CREATE TABLE`, `CREATE INDEX`, separated by `--> statement-breakpoint` as in `0016_notifications.sql`). Alchemy applies this flat directory on deploy. Do not run `bun run db:generate`: its snapshots in `packages/db/src/migrations/meta` stop at 0007 and it would emit an unwanted catch-up migration.
- **Local:** `bun run db:push:local` applies the TS schema. During verification it only ever targets a fresh scratch database through `DATABASE_URL` (see commands). The TS schema and the 0021 SQL must describe the same columns, defaults, and indexes.
- No backfill.

### Session and authorization (`apps/web/src/lib/session.ts`, `apps/web/src/lib/ops/session.ts`)

- Add `privateAccess: boolean` to `SessionUser`. `resolveSession` selects `membership.private_access` with the role and sets `privateAccess = role === "admin" || private_access`. Widget-token sessions always get `false`.
- Public exposure: the root loader already returns `user: context.user`, so this adds only the current viewer's own boolean. Edge-cached pages are served only without a session cookie, so their payload has `user: null`. No team lists, grants, counts, or private settings are added to `getWorkspace`, the `workspace:${id}` KV cache, or any public route.
- Add `requirePrivateAccess(user)` ("No access") and `privateOps(context)`, which returns an `OpCtx` like `adminOps`. Private dashboard operations always use `context.workspace` and filter by `workspace_id = ctx.workspace.id`. They never take a workspace ID from the caller.
- Export the existing `localDev()` from `session.ts` (server env `OPENHEARD_LOCAL === "1"`) for Phase 2. Nothing private uses `import.meta.env.DEV`.

### Every path that grants or removes access

All membership writes in the repo were reviewed: `createWorkspace` (inserts admin), the signup hook in `packages/auth/src/index.ts` (insert-or-nothing, member), `seed.ts`/`demo-db.ts` (demo or local only), `saveNotificationPrefs` (zod-limited to notify columns), `acceptInvite`, `setRole`, `removeMember`, plus the new `setPrivateAccess`. Only the last four can change access:

| Path | Change |
| --- | --- |
| `createInvite` (`lib/ops/workspace.ts`, `functions/invites.ts`) | Optional `privateAccess`, default `false`. API/MCP callers keep current behavior. |
| `acceptInvite` | Never weakens an existing membership. On conflict: `role = CASE WHEN membership.role = 'admin' THEN 'admin' ELSE excluded.role END`, `private_access = max(membership.private_access, excluded.private_access)`. Acceptance therefore can never remove access, so it needs no assignment clearing. This is the one stated change to public behavior: an old member invitation can no longer demote an admin. |
| `setPrivateAccess({ userId, on })` (new, `functions/admin.ts`) | `requireAdmin`, `assertNotDemo`, refuses `DEMO_ADMIN_ID`. Turning off runs the revocation batch below. |
| `setRole` | Unchanged upsert, now in the revocation batch so an admin demoted without a grant loses assignments in the same transaction. |
| `removeMember` | Delete membership inside the revocation batch. |

**Revocation batch** (one `db.batch`, so one transaction): (1) the membership write; (2) `INSERT INTO private_feedback_activity (feedback_id, actor_id, type, from_value, to_value, created_at) SELECT id, :admin, 'assign', assignee_id, NULL, :now FROM private_feedback WHERE workspace_id = :ws AND assignee_id = :user AND NOT EXISTS (<user still authorized>)`; (3) `UPDATE private_feedback SET assignee_id = NULL, updated_at = :now WHERE workspace_id = :ws AND assignee_id = :user AND NOT EXISTS (<user still authorized>)`. `<user still authorized>` is `SELECT 1 FROM membership m WHERE m.workspace_id = :ws AND m.user_id = :user AND (m.role = 'admin' OR m.private_access = 1)`, evaluated after statement (1). Past activity keeps `actor_id`. Account deletion already nulls `assignee_id`/`actor_id` through the FK.

- `listMembers` and the Team page show and toggle "Private feedback access" per member. The invite form gets a checkbox.

### Status deletion reference

`deleteStatus` (`apps/web/src/lib/ops/setup.ts`) counts `private_feedback` rows with that key and refuses with "N private reports use this status. Move them first." The delete itself adds `AND NOT EXISTS (SELECT 1 FROM private_feedback WHERE workspace_id = :ws AND status = :key)`; zero rows deleted returns the same message, which closes the count-then-delete race. `listStatusesWithCounts` and the cached `statusCounts` stay public-post-only.

### Phase 1 acceptance

- 0021 replays cleanly after 0000–0020 into a new SQLite file; `db:push:local` succeeds against a new scratch database.
- Existing members and signups have no private access. An invite with the checkbox grants it on acceptance; accepting a later member invite keeps an admin an admin and keeps a grant.
- Toggling access off, removing the member, or demoting an ungranted admin denies the next request and clears their assignments with matching `assign` activity rows.
- A status used by a private report cannot be deleted.

## Phase 2: Private collector, images, and team email

### Explicit receiver (new server-only `apps/web/src/lib/private-receiver.ts`; pure parts in `apps/web/src/lib/private-feedback.ts`)

- Pure `receiverDecision({ param, hostSlug, marketing, local })` returns `ok` or `reject`:
  - `param` missing or failing the slug regex: reject.
  - Production (`local === false`): `param` must equal `workspaceSlugFromHost(host, ROOT_DOMAIN)`, and the host must not be a marketing host. So `acme` is collected only on `acme.<root>`, `default` only on its own host (`app.<root>` in the cloud, the origin when self-hosted).
  - Local (`OPENHEARD_LOCAL=1` read through the exported server `localDev()`): the host is always `default`, so any valid `param` is accepted. The `ws` query/cookie is never read or set.
- `privateReceiver(request)` applies the decision, then loads the workspace row by `param`. Unknown is `null`. It never falls back to `default`. The loader, config, frame, collector, and logo routes use only this.
- Pure `privateReportUrl(origin, workspaceId, id, local)` returns `${origin}/dashboard/private/${id}`, adding `?ws=${workspaceId}` only when `local` and `workspaceId !== "default"` (the dashboard honors `?ws=` locally). With the strict production match, `origin` is always the receiver's own host.

### Collector: `POST /api/private-feedback?workspace=<id>` (`apps/web/src/routes/api/private-feedback.ts`)

The route is under `/api`, so `server.ts` already forces `private, no-store`. Steps, in order:

1. **Origin and receiver.** Refuse a cross-origin browser `Origin` with 403, as `/api/uploads` does (the frame is same-origin with Heardsy, so no CORS). Resolve the receiver: 404 if rejected or unknown. Demo workspace: 403.
2. **Rate limit before reading the body.** `UPLOAD_IP_LIMIT.limit({ key: "private:" + ip })`, failing closed (no binding, no IP, or a throw means 429/503). The per-workspace aggregate bound is the atomic daily byte cap in step 6; there is no `ws:ip` limiter.
3. **Bounded body.** `MAX_PRIVATE_BODY = MAX_IMAGES * MAX_IMAGE_BYTES + 1 MiB` (21 MiB). Declared `content-length` above it: 413. Move `readCapped` from `routes/api/uploads.ts` into `attachment-db.ts` and reuse it, so a missing or false length still stops at the cap. Parse with `new Response(bytes, { headers: { "content-type": ... } }).formData()`, never `request.formData()`. Non-multipart: 415.
4. **Validate everything.** Shared zod schema in `apps/web/src/lib/private-feedback.ts` (pure, browser-safe):

   | Field | Rule |
   | --- | --- |
   | `submissionId` | UUID |
   | `type` | `bug` or `feature` |
   | `title` | trimmed, 4–140 characters |
   | `message` | trimmed, 1–5000 characters |
   | `name` | trimmed, 1–100 characters |
   | `email` | zod email, ≤254 characters |
   | `metadata` | Optional. The raw part is ≤8 KiB UTF-8; it must `JSON.parse` to a plain object (not an array or primitive). Nested objects, arrays, and any JSON values are allowed. Stored as canonical compact JSON (keys sorted recursively), which must also be ≤8 KiB. No key, depth, or value-type schema. |
   | `images` | 0–4 `File` parts, each 1 byte to 5 MiB, type sniffed with `sniffImageType` (no SVG), dimensions via `imageSize`. |

   Unknown fields are ignored. Errors carry the user-facing message the widget shows.
5. **Idempotency precheck.** `content_hash` = SHA-256 over the normalized fields, canonical metadata, and each image's sniffed type plus SHA-256 of its bytes. Look up `(workspace_id, submission_id)`: same hash returns the original receipt with 200 and no email; a different hash returns 409 "This submission was already sent with different content." Nothing is written in either case.
6. **Status and quota precheck, before any storage write.**
   - Initial status = the workspace's first `open`-kind status by `position`. If none exists, log it and return 503 "This inbox isn't ready to receive reports." (Workspaces are seeded with one and `deleteStatus` keeps one, so this is a guard, not a flow.)
   - Daily byte cap: `coalesce(sum(images_size), 0)` for the receiver over the last 24 h plus the new bytes must be ≤ 500 MiB, otherwise 429. This refuses most over-quota requests before R2 is touched.
7. **Storage.** Write each image to `objectKey(ws, "pf_" + newId())` with its sniffed content type.
8. **One conditional insert** (same shape as `storeUpload`):
   ```sql
   INSERT INTO private_feedback (id, workspace_id, submission_id, content_hash, ..., images, images_size, status, created_at, updated_at, status_changed_at)
   SELECT :id, :ws, :sid, :hash, ..., :images, :size, s.key, :now, :now, :now
   FROM status s
   WHERE s.workspace_id = :ws AND s.kind = 'open'
     AND (SELECT coalesce(sum(images_size), 0) FROM private_feedback WHERE workspace_id = :ws AND created_at > :since) + :size <= :cap
   ORDER BY s.position LIMIT 1
   ON CONFLICT (workspace_id, submission_id) DO NOTHING
   RETURNING id
   ```
   The `WHERE` before `ON CONFLICT` also satisfies SQLite's upsert parsing rule. If it returns no row, delete the objects just written (best effort, logged), then re-select by `(workspace_id, submission_id)`: a row with the same hash is a concurrent duplicate (200, same receipt); a different hash is 409; no row means the cap or the open status failed, so re-run the step 6 checks for the 429 or 503 message.
   If any R2 write or the insert throws, delete what was written (best effort), log, and return 500 "Couldn't send. Try again." with no receipt. Survivors are unreferenced `pf_` objects for the orphan sweep. There is no cross-storage transaction.
9. **Receipt.** `201 { received: true, submissionId }`, with no report content or ID.

### Team email after a new save only

- `sendPrivateFeedbackEmail(db, { workspace, origin, report }, send = sendEmail)` in `apps/web/src/lib/notify.ts`, mirroring `deliver`'s injectable sender. The collector calls it through `inBackground("private-feedback-email", ...)` after building the 201, so a failure can never change the response.
- Recipients are selected at send time: admins with `notify_private_feedback IS NOT 0`, plus members with `private_access = 1 AND notify_private_feedback = 1`. They pass through `pickRecipients` and then `deliver` (existing short rate-limit retries and logging).
- Template `privateFeedbackEmail({ workspaceName, type, title, url })` in `notify-email.ts` uses `emailLayout`, `emailButton`, and `escapeHtml`. `url = privateReportUrl(requestOrigin, ws.id, id, localDev())`. Only title, Bug/Feature label, and link: never the message, contact details, metadata, or images. No outbox or retry table.

### Private image reads: `GET /api/private-feedback/$id/images/$imageId`

- `getSessionContext`, then `requirePrivateAccess`. `imageId` must match `^pf_[A-Za-z0-9_-]{22}$` and be in the `images` of report `id` with `workspace_id = context.workspace.id`; read `objectKey(context.workspace.id, imageId)`. Anything else is 404.
- Headers: stored sniffed `content-type`, `cache-control: private, no-store`, `x-content-type-options: nosniff`, `content-security-policy: default-src 'none'; sandbox`, `cross-origin-resource-policy: same-origin`, `content-disposition: inline`. No ETag or 304. Access is rechecked on every request.
- `/uploads/$id` never serves these objects (no `attachment` row), and `/logo/$id` reads only `workspace.logo_url`.

### Cleanup recognition (`sweepOrphans` in `attachment-db.ts`)

- Known keys gain (a) report images: per chunk of old keys under `D1_CHUNK`, `SELECT pf.workspace_id || '/' || json_extract(j.value, '$.id') FROM private_feedback pf, json_each(pf.images) j WHERE pf.workspace_id || '/' || json_extract(j.value, '$.id') IN (...)`; (b) every current `private_widget` logo key, `objectKey(workspace_id, logo_id)`.
- Retained reports' screenshots never expire. Unreferenced objects older than a day are removed: failed submissions, failed report deletions, and replaced or unsaved logos.
- `sweepUnclaimed` only touches `attachment` rows and is unchanged.

### Phase 2 acceptance

- A visitor POST with four 5 MiB images saves one report and four `pf_` objects, and the admin email file appears with only title, type, and link.
- Oversized, mislabeled, or invalid input is refused before any object is written.
- Same ID and content returns the same receipt with no new row or email; changed content returns 409.
- Missing, unknown, and host-mismatched receivers are refused and never land in `default`; a report to a second local workspace emails `/dashboard/private/<id>?ws=<that workspace>`.
- Private images are readable only by currently authorized reviewers of that workspace.

## Phase 3: Private dashboard inbox and workflow

### Server functions (`apps/web/src/functions/private-feedback.ts`; ops in `apps/web/src/lib/ops/private-feedback.ts`)

Every function uses `sessionMiddleware` and `privateOps` unless marked admin-only. Status and assignment inputs include the expected previous value from the displayed report; stale browser saves must be refused rather than rereading a fresh value and overwriting it. Every workflow change runs in one `db.batch` whose activity insert comes first and is guarded by the same predicate as the update, so both apply or neither does:

| Function | Behavior |
| --- | --- |
| `listPrivateFeedback({ status?, type?, assignee?: "me" \| "none" \| userId, cursor? })` | `ORDER BY created_at DESC, id DESC`, page of 50. The cursor is the last row's `(created_at, id)`; the next page uses `created_at < :c OR (created_at = :c AND id < :id)`, so same-millisecond rows are never skipped. Returns title, type, status, assignee, reporter name, created time, image count. |
| `getPrivateFeedback({ id })` | Original fields, contact details, metadata, image views pointing at the private image route, activity with actor names. |
| `addPrivateNote({ id, body })` | Body 1–5000 characters. `INSERT ... SELECT ... WHERE EXISTS (report id in this workspace)`. |
| `setPrivateStatus({ id, status })` | Read the current status `from`. If `from === to`, return without writing (no activity). Otherwise batch: (1) insert `status` activity `from → to` `WHERE EXISTS (SELECT 1 FROM private_feedback WHERE id = :id AND workspace_id = :ws AND status = :from) AND EXISTS (SELECT 1 FROM status WHERE workspace_id = :ws AND key = :to)`; (2) `UPDATE ... SET status = :to, status_changed_at, updated_at WHERE id = :id AND workspace_id = :ws AND status = :from AND EXISTS (<same status row>)`. Zero rows updated means a concurrent change or deleted status: "This report changed. Reload and try again." Never touches public posts, integrations, `purgeWorkspaceCache`, or status emails. |
| `assignPrivateFeedback({ id, assigneeId \| null })` | Same pattern with `assignee_id IS :from` as the compare value, plus, for a non-null target, `EXISTS (SELECT 1 FROM membership WHERE workspace_id = :ws AND user_id = :to AND (role = 'admin' OR private_access = 1))` in both statements. Revocation's batch and this batch are serialized by SQLite, so either the assignment lands first and revocation clears it, or revocation lands first and this predicate fails ("That person no longer has access."). No-op returns without writing. |
| `deletePrivateFeedback({ id })` | Admin-only (`adminOps`), confirmation dialog in the UI. `DELETE ... RETURNING images` (activity cascades), then best-effort `uploadsBucket().delete(keys)` with logged failures; the sweep takes leftovers. |
| `listPrivateAssignees()` | Currently authorized members, for the picker. |

None of these can edit the original title, message, name, email, or metadata.

### Routes and navigation

- Dashboard guard (`apps/web/src/routes/dashboard.tsx`): allow `role === "admin" || privateAccess`. Teammates are redirected to `/dashboard/private` from anything except `/dashboard/private*`, `/dashboard/settings/private-widget`, and `/dashboard/settings/notifications`. `routes/dashboard/settings.tsx` applies the same rule; the settings nav shows only those items to teammates.
- Every existing dashboard server function keeps `requireAdmin`. Server checks are the boundary; redirects are UX.
- `routes/dashboard/private.tsx` (list, filters, "Load more" with the cursor, empty state) and `routes/dashboard/private.$id.tsx` (detail):
  - Original submission read-only; contact details labeled as supplied, not verified.
  - Metadata rendered as `JSON.stringify(value, null, 2)` text inside a `<pre>` (React escapes it; no links, no HTML).
  - Thumbnails use the existing attachment component.
  - Status select with status colors, assignee select, notes timeline, note composer, admin-only Delete with confirmation.
- "Private feedback" in `AdminSidebar`/`AdminRail`; teammates see only the private items.
- "New private feedback" toggle on the Notifications page, shown only when `privateAccess`; the effective value reflects the role default. `saveNotificationPrefs` accepts the optional field only for users with access.

### Phase 3 acceptance

- Admins and granted teammates can read, add notes, change status, and assign. Teammates cannot delete reports, manage the team, edit origins, or reach public-admin pages or server functions.
- Ordinary members and guests get redirects or errors.
- Same-status saves write nothing; a stale status or assignment save is refused with no activity row.
- Paging through more than 50 reports created in the same millisecond returns each exactly once.
- Closed and Shipped reports keep content and history; nothing private appears on `/`, `/roadmap`, `/p/*`, `/widget.json`, or in public counts.

## Phase 4: Private widget loader, frame, config, and appearance settings

### Appearance settings (pure `apps/web/src/lib/private-widget-settings.ts`)

- Zod schema and defaults: `theme` (`dark|light|auto`), `accent` hex, `launcher` (`icon|label|hidden`), `launcherLabel` ≤24 characters, `position` (`bottom-right|bottom-left`), `size` (`small|medium|large`), and bounded text (`heading`, `helper`, labels/placeholders for name, email, type, title, message, `submitLabel`, `successMessage`).
- Field-by-field `readPrivateWidgetSettings`, mirroring `readWidgetSettings`.
- Size presets: Small 360×560, Medium 420×640, Large 520×720 maximums, each `min(..., viewport - margins)`; full screen at ≤480 px. No arbitrary dimensions.
- Text cannot remove fields; required fields stay required.

### Dashboard settings: `/dashboard/settings/private-widget`

- In `SETTINGS_NAV` under Product.
- **Appearance** (teammates and admins): form, live preview of the private frame, Save via `privateOps` and `assertNotDemo`.
- **Logo** (teammates and admins), with server-proven provenance:
  - `POST /api/private-widget/logo`: session, `requirePrivateAccess`, `assertNotDemo`, same-origin check, `uploadAllowed(user.id, ip)` (fails closed), `readCapped` at 5 MiB, `sniffImageType` (no SVG). Stores under `objectKey(ws, "pl_" + newId())` and returns that `pl_` id. This route is the only issuer of `pl_` ids; the collector is the only issuer of `pf_` ids.
  - `savePrivateWidgetSettings({ ..., logoId?: string | null })`: a new `logoId` must match `^pl_[A-Za-z0-9_-]{22}$`, and `uploadsBucket().get(objectKey(ctx.workspace.id, logoId))` must exist with a stored content type of PNG, JPEG, GIF, or WebP. Otherwise "Upload the logo again." A report image (`pf_`), an attachment, the public logo, or another workspace's object cannot pass.
  - `null` removes the logo. After a successful save that replaces or removes one, delete the previous object (best effort). Unsaved uploads are left for the sweep.
- **Allowed websites** (admin-only, `adminOps`): `savePrivateWidgetOrigins` reuses `parseEmbedOrigins` and `MAX_EMBED_ORIGINS`. Teammates see the list read-only.
- **Install snippet:** `<script src="<this workspace origin>/private-widget.js" data-workspace="<id>" async></script>`. Locally the origin is `http://localhost:3003` with `data-workspace` naming the workspace.
- Saving purges the edge copy of this receiver's config.

### Public-safe endpoints

- **`GET /private-widget.js`**: static loader, `access-control-allow-origin: *`, same cache headers as `/widget.js`.
- **`GET /private-widget.json?workspace=<id>`**: `privateReceiver`, 404 if rejected or unknown, rate limited like `/widget.json`, CORS `*`. Returns only resolved settings, `logoUrl` (`/private-widget/logo/<workspace>/<pl id>` or null), and the workspace name. Never origins, team data, reports, counts, or metadata. In `cache.ts`: edge-cacheable, `edgeCacheKey` keeps only `workspace`, and a purge helper deletes that exact key.
- **`GET /private-widget/logo/$workspace/$id`**: `$id` must match the `pl_` pattern and equal `private_widget.logo_id` for `$workspace`; otherwise 404. Public and immutable like `/logo/$id`; add the prefix to `isImmutableAsset`.

### Frame: `/private-widget?workspace=<id>&host=<origin>`

- The route loader calls the config server function with the explicit receiver and fails closed if it is rejected or unknown. It renders only from that config; the root loader's public workspace data is not used.
- `__root.tsx`: add `/private-widget` to `BARE_PAGES` and the embedded/no-analytics and no-official-widget checks.
- Framing (`server.ts`): add `/private-widget` to frameable paths. `privateFrameAncestorsFor(request)` in `widget-frame.ts` uses `privateReceiver` and `private_widget.origins`; with none saved the directive is `frame-ancestors 'self'` (D1). Other security headers unchanged.
- **Form:** type, title, message, name, email, up to four images (reusing `checkImage`/`tooManyImages` and attachment previews). Metadata is never shown. Send is one multipart `fetch` to `/api/private-feedback?workspace=<id>` with a `submissionId` from `crypto.randomUUID()`, generated once per draft and kept across retries. Failure keeps the draft and images with an error and Retry. A 201 or duplicate 200 shows the success message and clears the draft; the next draft gets a new ID.
- **Draft lifetime:** React state in the iframe only. Closing the panel keeps the iframe and the draft; refreshing or leaving the host page destroys it. No `localStorage`/`sessionStorage`.
- **Messages:** the frame accepts `postMessage` only when `e.source === window.parent` and `e.origin === host`, and posts back to `host` (never `*`) with ready, close, busy, and sent (`{ submissionId }` only).

### Loader (`apps/web/src/lib/private-widget-loader.js`)

Adapts the public loader's shell, launcher, open/close/toggle, `data-*-open` trigger, Esc and outside-click handling, and busy guard.

- Own global guard (`__heardsyPrivateWidget`), shadow host attribute, and command queue `window.heardsyPrivate`, so it coexists with `window.openheard`.
- Receiver required from `data-workspace` (or `?workspace=` on the script URL); missing or a 404 config logs `console.warn` and does not mount.
- Appearance precedence: defaults, dashboard config, `data-*`, runtime `config({ appearance })`, each validated as in the public loader. `appearance.logoUrl` accepts https URLs or `false`.
- Commands:

  | Command | Behavior |
  | --- | --- |
  | `open` / `close` / `toggle` | As the public widget. |
  | `config({ contact: { name, email }, metadata, canSubmit, appearance })` | Prefill fills only fields not edited since the last reset. `metadata` must be a plain object whose JSON is ≤8 KiB, else dropped with a warning. `canSubmit: false` pauses Send with "Sign in again to send" and keeps the draft; `true` resumes; default `true`. |
  | `reset()` | Clears draft, images, contact, metadata, and edited flags in frame and loader. Apps call `reset()` then `config(...)` on logout or account switch. |

### Phase 4 acceptance

- Embedding works on an allowed origin and is refused elsewhere and before any origin is saved.
- Dashboard defaults appear on next load; `data-*` and runtime overrides win; `/widget.json` and the public widget are unchanged.
- All three sizes fit on desktop and mobile. Draft, reset, and pause behave as specified.
- A `pf_` id, an attachment id, or another workspace's logo id cannot be saved as the private logo.

## Phase 5: Documentation, checks, and evidence

- Add `docs/private-widget.md`: install snippet (served from the workspace's own host), `window.heardsyPrivate` commands, a login-required example (prefill, pause/resume, reset on logout), a visitor example, metadata limits, allowed websites (none means not embeddable), precedence, contact details as supplied rather than verified, both widgets on one page (different corners or one hidden launcher), and that Cloudflare Access on a board also gates the private widget and collector. Link it from `docs/widget.md` and `README.md`.
- Run the checks and matrix below; capture screenshots and a short video for the PR.
- PR body: short bullet points. The production migration runs only through the existing `deploy` workflow after a merge, which this plan does not authorize.

## Decisions taken in this plan

- **D1: No origins saved means not embeddable** (`frame-ancestors 'self'`, dashboard preview only). Accepted by parent.
- **D2: Hand-written migration 0021**, because the drizzle snapshots are stale.
- **D3: Separate `private_widget` table**, because workspace columns would leak through the root loader. Accepted by parent.
- **D4: One nullable notify column for role defaults.** Invite acceptance never weakens a membership; every other access-loss path clears assignments in the same batch.
- **D5: Demo workspace refuses private submission, logo upload, and settings writes.** Accepted by parent.
- **D6: Abuse limits.** `UPLOAD_IP_LIMIT` keyed `private:<ip>` (collector) and `uploadAllowed` (logo upload), both failing closed; a 500 MiB rolling-day image cap per receiving workspace, prechecked before storage and enforced atomically in the insert. No new bindings.
- **D7: Strict receiver host match in production**, so the email link built from the request origin always opens the receiving workspace's dashboard; locally the link carries `?ws=`.
- **D8: Distinct server-issued id namespaces** (`pf_`, `pl_`) prove object provenance without an upload table.

## Verification matrix (actual behavior to observe)

All runtime checks use a fresh scratch database and two fresh workspaces, `$WSA` and `$WSB` (created in the dashboard; slugs are new, so their `apps/web/.local-uploads/<slug>` folders do not exist yet). Image submissions go only to these. `default` is used only for text-only receiver probes. The dummy app is served on `http://localhost:5173` with buttons for log in as Alice, log in as Bob, session expired, session restored, log out, and visitor mode, each calling `heardsyPrivate("config"/"reset")`.

| # | Scenario | Action | Expected |
| --- | --- | --- | --- |
| 1 | Logged-in submit | Alice prefilled; edit name; bug with two images to `$WSA`; Send | 201; success text; one row with the edited name; two `pf_` objects under `$WSA/`; admin email with only title, type, link `…/dashboard/private/<id>?ws=$WSA` that opens the report |
| 2 | Visitor submit | Visitor mode; Send without name | Client and server refuse; after filling, saves |
| 3 | Max attachments | Four ~5 MiB images | Saves; fifth refused in UI; curl with five returns 400 |
| 4 | Oversize/invalid image | 5 MiB + 1 byte PNG; SVG; text renamed `.png` | 413/415; no object or row |
| 5 | Whole-body cap | Chunked upload over 21 MiB with no `content-length` | 413; nothing written |
| 6 | Metadata | Nested `{"plan":"pro","account":{"id":"w_1","seats":[1,2]}}`; then 9 KiB; then `[1]` | First saves and shows as escaped pretty JSON only in the dashboard; the others 400 |
| 7 | Receiver | Collector/config/frame with missing, unknown, and `default` vs `$WSB` values; disposable inline helper probes for production host mismatch, marketing host, and `?ws=` link | Missing/unknown 404 and never land in `default`; `$WSB` report emails a `?ws=$WSB` link; helper probes pass |
| 8 | Cross-origin browser POST | `Origin: https://evil.test` | 403 |
| 9 | Duplicate retry | Same `submissionId` and content twice; also two in parallel | Same receipt; one row; one email; parallel loser's objects deleted |
| 10 | ID reuse, changed content | Same `submissionId`, different title | 409; original unchanged |
| 11 | Storage failure | `chmod 500` on the fresh `apps/web/.local-uploads/$WSA` folder, Send, `chmod 700` | Error; draft kept; no row; retry after restore saves exactly one |
| 12 | DB failure after storage | Disposable `BEFORE INSERT` trigger on `private_feedback` in the scratch DB raising `FAIL`; Send two images; drop trigger; retry | First: 500, no receipt, no row, the two `pf_` objects deleted (or left and removed by row 24); retry saves once |
| 13 | Quota | Scratch-DB update setting one `$WSB` report's `images_size` to 500 MiB, then Send with an image | 429 before any object is written; text-only still saves |
| 14 | Close/reopen and refresh | Type, close, reopen; refresh host | Kept on reopen; empty after refresh |
| 15 | Session pause | Expired, edit, restored | Send disabled while paused; draft and edits kept; sends after restore |
| 16 | Logout/switch | Alice draft with images; log out; log in as Bob | Empty form, Bob's prefill, no Alice images or metadata |
| 17 | Email failure | Harness calls `sendPrivateFeedbackEmail` with a failing sender; collector code returns 201 before `inBackground` work | Resolves with `failed > 0`, logs, never throws; report in inbox |
| 18 | Access grants | Signup member; invited with access; invited without | Only admin and granted teammate reach `/dashboard/private`; others redirected and server functions refuse |
| 19 | Invite acceptance | Admin accepts a member invite to the same workspace | Stays admin; a granted teammate accepting an ungranted invite keeps access |
| 20 | Teammate abilities | Granted teammate | Notes, status, assign, appearance, logo; cannot delete, edit origins, manage team, or open public-admin pages or functions |
| 21 | Revocation | Teammate assigned and viewing report + image; admin revokes; reload | Refused immediately; past notes remain; assignment cleared with an `assign` activity row |
| 22 | Stale writes | Two tabs set different statuses from the same starting value; same-status save | Second refused, one activity row; same-status writes nothing |
| 23 | Cross-workspace | Admin of `$WSB` requests a `$WSA` report or image URL with `?ws=$WSB` | 404 |
| 24 | Orphan cleanup | Harness runs the real `sweepOrphans(db, 0)` restricted to `$WSA/` | Removes failed-submission and replaced-logo objects; keeps retained screenshots and the current logo |
| 25 | Logo provenance | `savePrivateWidgetSettings` with a `$WSA` `pf_` id, an attachment id, and a `$WSB` `pl_` id | All refused; `/private-widget/logo/$WSA/<pf id>` is 404 |
| 26 | Paging | Insert 120 rows with one shared `created_at` into the scratch DB; page through | Each row exactly once |
| 27 | Caching | Headers on private image, collector, dashboard | `private, no-store`, CSP sandbox, nosniff on images; no ETag/304 |
| 28 | Status lifecycle | Shipped, then Closed; delete a status in use | Content kept; never public; deletion refused |
| 29 | Admin delete | Delete with confirmation | Row, activity, objects gone; image URLs 404 |
| 30 | Appearance precedence | Dashboard green/Large/left; `data-position="bottom-right"`; runtime accent | Runtime and attributes win; public widget unchanged |
| 31 | Frame embedding | Dummy app with no origins, then after adding `http://localhost:5173`; another port | Refused, then embeds; other port refused |
| 32 | Public regression | Public widget, board, roadmap, `/widget.json`, uploads, inbox, root loader payload | Unchanged; payload's only addition is the viewer's own `privateAccess`; no private data in public responses or counts |

## Exact verification commands

Nothing below deletes, overwrites, migrates, or locks an existing file. Everything new lives in a fresh run folder under the existing fixture directory, and every database command targets the scratch database.

```bash
cd /Users/amit/Developer/Projects/heardsy
bun install --frozen-lockfile
bun run check-types
bun run --filter web build
bun run --filter web test               # existing suite only
# No lint script is configured in this repository.

REVIEW=/tmp/heardsy-private-feedback-review-20261011
RUN="$REVIEW/run-$(date +%Y%m%d%H%M%S)"
mkdir "$RUN"                            # fails rather than reuse an existing folder
export DATABASE_URL="file:$RUN/scratch.db"
STAMP=$(date +%H%M%S); WSA="pfr-$STAMP-a"; WSB="pfr-$STAMP-b"
test ! -e "apps/web/.local-uploads/$WSA" && test ! -e "apps/web/.local-uploads/$WSB"
stat -f '%m %z' apps/web/local.db > "$RUN/localdb-before.txt"   # proves the user DB is untouched

# Replay all flat Cloudflare migrations, including 0021, into a new file
for f in packages/db/migrations/*.sql; do sqlite3 "$RUN/migrations.db" < "$f" || { echo "FAILED $f"; break; }; done
sqlite3 "$RUN/migrations.db" '.schema private_feedback' '.schema private_feedback_activity' '.schema private_widget' 'PRAGMA table_info(membership);' 'PRAGMA table_info(invite);'

# Schema push into the new scratch DB only
bun run db:push:local

# Port 3003 must be free (BETTER_AUTH_URL is fixed to it). At planning time a `vite dev`
# from apps/web (pid 9776) is the parent-owned scratch server using /tmp/heardsy-feedback-review.d5pH99/local.db. The parent may restart its own server. Do not stop unrelated processes.
lsof -iTCP:3003 -sTCP:LISTEN || OPENHEARD_LOCAL=1 DATABASE_URL="$DATABASE_URL" bun run --filter web dev:bare
# In the browser: sign up (first user is admin of default), create workspaces $WSA and $WSB,
# invite teammates (magic links land in apps/web/.local-emails as new files).

# Dummy consuming app, new folder in the run directory
mkdir "$RUN/dummy-app"                  # write index.html here with the buttons listed above
python3 -m http.server 5173 --directory "$RUN/dummy-app"

# Collector probes
SID=$(uuidgen | tr A-Z a-z)
curl -i -X POST "http://localhost:3003/api/private-feedback?workspace=$WSA" \
  -F submissionId=$SID -F type=bug -F title="Export crashes" -F message="Steps..." \
  -F name="Alice" -F email="alice@example.com" \
  -F 'metadata={"plan":"pro","account":{"id":"w_1","seats":[1,2]}}' -F images=@"$RUN/shot.png"
curl -i -X POST "http://localhost:3003/api/private-feedback" -F submissionId=$(uuidgen | tr A-Z a-z)
curl -i -X POST "http://localhost:3003/api/private-feedback?workspace=nope" -F submissionId=$SID
curl -i -X POST -H "Origin: https://evil.test" "http://localhost:3003/api/private-feedback?workspace=$WSA" -F submissionId=$SID
head -c 23000000 /dev/zero | curl -i -X POST -H "content-type: multipart/form-data; boundary=x" \
  -H "transfer-encoding: chunked" --data-binary @- "http://localhost:3003/api/private-feedback?workspace=$WSA"
( printf '\x89PNG\r\n\x1a\n'; head -c 5242873 /dev/urandom ) > "$RUN/over-5mib.png"   # 5 MiB + 1 byte
sqlite3 "$RUN/scratch.db" "select id, workspace_id, submission_id, status, assignee_id, images_size from private_feedback order by created_at desc limit 5;"
ls -la "apps/web/.local-uploads/$WSA"
curl -sI "http://localhost:3003/private-widget?workspace=$WSA&host=http://localhost:5173" | grep -i content-security-policy

# Row 11: storage failure, on the fresh workspace folder only
mkdir "apps/web/.local-uploads/$WSA" 2>/dev/null; chmod 500 "apps/web/.local-uploads/$WSA"
#   ...Send from the dummy app, observe the error...
chmod 700 "apps/web/.local-uploads/$WSA"

# Row 12: database failure after storage, disposable trigger in the scratch DB
sqlite3 "$RUN/scratch.db" "CREATE TRIGGER pf_injected_fail BEFORE INSERT ON private_feedback BEGIN SELECT RAISE(FAIL, 'injected'); END;"
ls "apps/web/.local-uploads/$WSA" > "$RUN/before-12.txt"
#   ...Send two images, expect 500 and no receipt...
sqlite3 "$RUN/scratch.db" "select count(*) from private_feedback where workspace_id = '$WSA';"
ls "apps/web/.local-uploads/$WSA" | diff "$RUN/before-12.txt" -
sqlite3 "$RUN/scratch.db" "DROP TRIGGER pf_injected_fail;"
#   ...Retry, expect exactly one new row...

# Row 13: quota, scratch DB only
sqlite3 "$RUN/scratch.db" "update private_feedback set images_size = 524288000 where id = (select id from private_feedback where workspace_id = '$WSB' limit 1);"

# Rows 17 and 24: real modules through Vite SSR, no app endpoint. Uses the scratch DB,
# and wraps the bucket so list/delete can only see $WSA/ keys.
cd apps/web
SWEEP_PREFIX="$WSA" OPENHEARD_LOCAL=1 DATABASE_URL="$DATABASE_URL" node --input-type=module -e '
import { createServer } from "vite";
import { resolve } from "node:path";
const localEnv = resolve("../../packages/env/src/local.ts");
const prefix = process.env.SWEEP_PREFIX + "/";
const server = await createServer({
  configFile: false, root: process.cwd(), logLevel: "error", appType: "custom",
  server: { middlewareMode: true, hmr: false, ws: false },
  resolve: { tsconfigPaths: true, alias: { "cloudflare:workers": localEnv } },
  ssr: { external: ["@libsql/client", "libsql"] },
});
try {
  const { env } = await server.ssrLoadModule(localEnv);
  const real = env.UPLOADS;
  env.UPLOADS = { ...real,
    list: async (o) => { const p = await real.list(o); return { ...p, objects: p.objects.filter((x) => x.key.startsWith(prefix)) }; },
    delete: async (keys) => { const ks = [].concat(keys); if (ks.some((k) => !k.startsWith(prefix))) throw new Error("refusing " + ks); return real.delete(ks); } };
  const { createDb, workspace } = await server.ssrLoadModule("@openheard/db");
  const { sweepOrphans } = await server.ssrLoadModule("/src/lib/attachment-db.ts");
  const { sendPrivateFeedbackEmail } = await server.ssrLoadModule("/src/lib/notify.ts");
  const db = createDb();
  const ws = (await db.select().from(workspace)).find((w) => w.id === process.env.SWEEP_PREFIX);
  console.log("email", await sendPrivateFeedbackEmail(db, { workspace: ws, origin: "http://localhost:3003", report: { id: "x", type: "bug", title: "Probe" } }, async () => ({ ok: false })));
  console.log("swept", await sweepOrphans(db, 0));
} finally { await server.close(); }
'
cd ../..
ls -la "apps/web/.local-uploads/$WSA"

# Afterwards: the user's DB is untouched (only meaningful if the user's own dev server was stopped meanwhile)
stat -f '%m %z' apps/web/local.db | diff "$RUN/localdb-before.txt" -
lsof "$RUN/scratch.db" apps/web/local.db                          # while running: only the scratch DB is held by our server
```

Do not run `bun run deploy`, `alchemy deploy`, `db:migrate:deploy`, or anything against remote D1 or R2. The run folder and the two `pfr-*` upload folders are left in place for the user to inspect or remove.
