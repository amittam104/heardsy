# Private Feedback Widget design

Status: design confirmed. The user accepted Q33 and authorized a reviewed implementation plan of at most five phases, delegated implementation, local validation, media capture, and PR delivery on 2026-10-11. Do not merge the PR without a separate user instruction.

## Confirmed requirements

- Keep two separately named widgets: Public Feedback Widget and Private Feedback Widget. Focus new functionality on the private widget.
- Store private feedback in dedicated records and operations within the existing Heardsy backend, database, and image storage, separate from public board posts.
- Submission access depends on the consuming app. Apps that require login check their existing session before allowing submission and prefill name/email from it; other apps may accept visitor feedback without checking login. Reporters never log into Heardsy or create Heardsy accounts. This replaces the earlier requirement that every installation be limited to logged-in app users.
- Require reporter name and email, prefilled from the consuming application's identity when available. Reporters may edit both fields for their submission; these are supplied contact details rather than identity independently verified by Heardsy.
- Use one Heardsy workspace per application.
- Keep the consuming application's integration small, using its existing session/login check where applicable; the widget sends feedback and images to Heardsy rather than relaying every submission through the app's server. A mandatory extra Heardsy login-verification endpoint is not approved.
- Accept bug reports and feature requests, with optional image/screenshot attachments.
- Require a separate title and message. The first version supports images/screenshots, not uploaded video.
- Allow up to four images, 5 MiB each (displayed as 5 MB), using the existing accepted image formats.
- Clear the unfinished form, selected images, and previous reporter identity when the consuming app reports logout or account switching.
- Accept optional submission metadata deliberately supplied by the consuming app. The earlier workspace ID example was specific to one app, not a universal metadata field. Other apps may send different context, such as plan or app version. The receiving Heardsy workspace ID still routes the submission. Do not automatically capture the current page path or URL.
- Keep app-supplied metadata out of the reporter's form; authorized reviewers see it with the report in the private dashboard. It is supplied context rather than verified identity or a permission grant.
- Offer an optional floating Feedback button and allow the app to open the private widget from its own button, matching the existing widget's opening options.
- Keep unfinished drafts only for the current page session. Closing/reopening the widget preserves the draft; refreshing or leaving the page clears it. Logout/account switching clears the draft and previous identity as already decided.
- When a login-required app reports temporary same-user session expiry, keep the draft in memory and pause submission until the app reports that user's restored session. Explicit logout or account switching still clears the draft, and refresh still clears it. Heardsy does not independently detect the app's session.
- Show submission confirmation in the widget; send no automatic reporter emails in the first version.
- Allow the receiving Heardsy workspace's admins and explicitly authorized teammates to access private feedback and its attachments.
- Authorized teammates can read feedback, add internal notes, change its status, and customize private widget text and appearance. Admins manage team invitations and allowed websites/domains; permanent feedback deletion remains admin-only.
- Allow authorized dashboard teammates and admins to edit basic private widget text, logo, colors, size, and placement. This supersedes the earlier admin-only appearance permission. Keep private-widget customization independent of the existing public widget's appearance and behavior.
- Customize panel size through Small, Medium, and Large presets, automatically fitted to smaller screens. Do not add arbitrary width/height inputs in the first version.
- Dashboard appearance settings provide defaults; the consuming app can override appearance for its installation. Follow the existing precedence of defaults, dashboard settings, embed attributes, then runtime appearance configuration. These overrides do not change server-side permissions or allowed domains.
- Reuse the receiving workspace's existing configurable status workflow for private feedback: initially Pending, Under review, Planned, In progress, Shipped, and Closed. Private feedback remains private regardless of status.
- Allow optional assignment of one authorized teammate per report. Assignment identifies responsibility without limiting other authorized reviewers' access.
- Preserve originally submitted title, message, and reporter contact details. Reviewers add internal notes and update status/assignment rather than rewriting those original fields.
- Email workspace admins for new private feedback by default; authorized teammates can opt in. Reporter emails remain excluded from the first version. Saved feedback must survive a notification-delivery failure.
- Team notification emails contain the report title, bug/feature type, and a dashboard link. Reviewers use the dashboard to read the message, contact details, metadata, and screenshots.
- Keep email delivery simple: reuse brief delivery retries and log remaining failures. Do not introduce durable email retry jobs, an outbox, or another queue. An email may be missed if delivery fails; the feedback remains saved in the dashboard.
- Retain feedback indefinitely unless a workspace admin explicitly deletes it. Admins may permanently delete spam or mistakes; ordinary closing preserves the record. Attachment cleanup and deletion confirmation are included in the lifecycle defaults proposed for Q33.
- Defer GitHub integration entirely from the first version, as requested on 2026-10-11. This supersedes the earlier requirements for automatic issue creation and public/private repository sharing. The active scope is submission, private dashboard review, team access, and team notification emails.
- Keep submitted feedback history beyond 30 days. Closing feedback should preserve its history.
- The earlier brainstorming-only boundary was lifted after design confirmation. Implement the approved scope through a reviewed phased plan. Do not add test files unless explicitly requested; run existing checks and exercise the real app and a dummy consuming app.

## Consolidated architecture for review

This is the confirmed implementation design and lifecycle policy accepted in Q33. Historical questions remain later in this document; superseded alternatives are not current requirements.

### Existing services and separate private paths

Use the current Heardsy application, D1 database, R2 image storage, dashboard shell, and reviewer authentication. Add a separate private widget loader/frame, public-safe private appearance configuration, write-only private submission endpoint, and authenticated private inbox operations. Reuse image validators, suitable rendering components, status definitions, and email delivery primitives. Existing public post operations and public widget configuration keep their behavior.

The current posting/upload flow depends on Heardsy accounts and public-board ownership, voting, visibility, and notifications. The private collector therefore does not call the current account-required post/upload endpoints or invoke their whole workflow helpers.

### Data and workspace identity

- Store each private report separately from public posts: receiving workspace, bug/feature type, original title/message/name/email, metadata snapshot, image references, status, optional assignee, timestamps, and a client submission identifier.
- For the bounded maximum of four images, keep their storage references and basic file information with the report. This allows a single report insert to record the submitted content and image links without a separate anonymous upload-account model. R2 objects remain private.
- Use a small private activity table for internal notes and status/assignment history, with the reviewing teammate and time. Do not build an editable-content revision system or a general audit framework.
- Keep optional app metadata as a bounded JSON object. It has no mandatory customer-workspace field, no special form editor, and no authority to grant access. The dashboard displays the supplied context safely as data.
- Put private appearance configuration, private logo references, and private allowed-origin settings alongside the receiving workspace, independently of existing public-widget settings.
- Require an explicit receiving Heardsy workspace identifier for private loader/config/frame/collector requests. Look up that workspace, use its settings and storage scope, and fail for an absent/unknown receiver rather than falling back to the default workspace. A workspace ID inside app metadata is separate customer context.

The explicit receiver matters for self-hosting: current production workspace resolution follows the hostname/default, while local `?ws=` handling is not a general production workspace selector. Private dashboard operations must authorize the same receiving workspace explicitly rather than trusting a caller-provided ID or a membership in another workspace.

### Small permission extension

Keep existing admin/member roles. Add an explicit private-feedback access grant to workspace membership, defaulting to false for ordinary public signups. Admins already have access; an invited or explicitly granted teammate gets the private area and appearance controls. Extend existing invitations/grant management rather than adding another identity provider or a configurable permission engine. Existing public members are not automatically upgraded.

| Action | Workspace admin | Authorized teammate | Reporter |
| --- | --- | --- | --- |
| Read inbox, report, metadata, images, and history | Yes | Yes | No |
| Add notes, change status, assign an authorized teammate | Yes | Yes | No |
| Edit private widget wording, logo, colors, size preset, placement | Yes | Yes | No |
| Manage allowed websites and team access | Yes | No | No |
| Permanently delete a report | Yes, with confirmation | No | No |
| Rewrite original submitted title/message/contact details | No | No | No |

Reporters submit through the widget without a Heardsy account. Reviewer access uses existing Heardsy authentication plus the receiving workspace's current permissions. Check permissions on every private report/image/action request; sharing a dashboard URL grants no access. Protect the new private dashboard area separately, preserving existing admin-area checks. Private report/image responses must not be served through public caches.

### Simple submission and upload lifecycle

1. The consuming app configures the receiver, optional contact prefill, optional metadata, appearance overrides, and whether submission is currently enabled. It checks its own login where appropriate; visitor apps leave submission enabled and users fill required contact fields.
2. On Send, the widget sends one HTTP multipart form request directly to the Heardsy private collector, containing the fields, metadata, unique submission identifier, and selected images. No app-server proxy or extra reporter login endpoint is required.
3. Validate the receiver, required fields, metadata size, image bytes/formats/count/size, and the whole request size before accepting the submission. Four images may total 20 MiB before form overhead; the aggregate body cap must allow that overhead and must also work without a trustworthy content-length header. Reuse appropriate rate-limit primitives with workspace/IP scope rather than a Heardsy reporter account.
4. Store validated images in R2 and save the complete report with its references. R2 writes and database writes are separate operations: partial failures remain incomplete, and abandoned objects stay eligible for cleanup. Do not claim a cross-storage transaction.
5. Return a minimal success receipt after the complete report is saved. A failed attempt keeps the draft/images in memory. A retry of the same submission reuses its identifier; workspace-scoped uniqueness prevents another report, and identifier reuse with different submitted content must not silently overwrite the original. Receipt responses expose no private report content.
6. After saving, select currently authorized notification recipients and use the existing email delivery approach. Admins default on; teammates opt in through a private-feedback preference independent of public-board notifications. Brief delivery retries/logging are retained; there is no persisted email job, outbox, scheduled retry worker, or new queue. A failed email does not change the saved-feedback result.

Cloudflare's current [Workers Request API](https://developers.cloudflare.com/workers/runtime-apis/request/#instance-methods) supports form-data parsing; a single-request collector is an implementation proposal using that capability, not an existing Heardsy endpoint. Runtime validation must still cover maximum-size requests and partial storage/database failures.

### Widget configuration and app hooks

- Give the private widget its own installation option and independent runtime control, so the public widget retains its installation and behavior.
- Support open/close/toggle from the app, plus the optional floating launcher. Keep the reporter experience submission-only, without boards, roadmap, or reporter history pages.
- Provide a small configuration hook for contact prefill, metadata, appearance, and submission-enabled state, plus an explicit reset hook for logout/account switching. These are proposed API capabilities; exact names follow project conventions when implemented.
- Temporary same-user session expiry disables sending while preserving in-memory edits. Resuming that user's session preserves the draft and edited contact fields. Explicit reset clears old contact/context, form, and selected images before configuring a different user.
- Store dashboard defaults for launcher/form wording, logo, theme/colors, Small/Medium/Large panel size, and placement. Wording covers heading/helper text, field labels/placeholders, submit label, and success message; it does not remove the confirmed required fields. Start with the current bottom-left/right placement pattern and responsive fitting.
- Use a straightforward settings editor with preview and Save, reusing suitable existing controls. App appearance overrides take precedence over dashboard defaults. Apply newly saved defaults when an installation next loads its configuration; do not add a live configuration subscription or publishing/versioning workflow.
- Serve only public-safe appearance/branding in widget configuration, cached by receiving workspace. Keep report data, reporter contact details, metadata, images, and team information out of that configuration. Private frame CSP uses the receiver's admin-managed allowed origins; this controls embedding, not independent app-login verification.

The app-controlled login policy remains the accepted Q4 boundary: Heardsy receives app-supplied contact/context rather than independently verified app identity. The app governs its UI/session lifecycle; private read authorization is enforced by Heardsy.

### Confirmed lifecycle rules

- Submitted reports, notes/history, metadata, and screenshots have no time-based expiry. Closing/Shipped status preserves them.
- Admin deletion shows explicit confirmation and removes the report, its notes/history/metadata, and associated image access/references. Attempt storage deletion; failed object deletion is handled by the existing orphan-cleanup mechanism, updated to recognize retained private references. Add no new cleanup queue.
- Removing a teammate immediately denies subsequent private requests. Keep their past notes/history; clear an active assignment to that removed teammate so it can be reassigned.
- If a reporter later leaves/deletes their app account, retain the original submitted contact/context and feedback. The reporter is not a Heardsy database account owner.
- Cleanup distinguishes abandoned/unsubmitted objects from retained private images and private widget logos. It never expires a retained report's screenshots just because they are old.
- Deployment backup/restore arrangements should be checked during implementation readiness; this feature introduces no backup-management UI or new archival service.

These rules apply to the feature's admin deletion flow. They do not authorize deleting unrelated workspace files or existing real feedback during development.

### Work required, in order

1. **Private data and access:** add report/activity persistence, workspace private settings, and explicit teammate access/preferences; extend existing team invitations and authorized-workspace selection.
2. **Collection and images:** implement the receiver-aware private collector, request limits/validation, duplicate-safe retries, private image reads, and cleanup recognition for retained images/logos.
3. **Widget and dashboard:** build the private submit-only frame/loader, app configuration/reset hooks, private inbox/detail/history/notes/assignment, and the teammate-editable settings page with admin-only domain/team/deletion controls.
4. **Notification and verification:** connect new-report emails to authorized recipients using current delivery primitives; run existing checks and real browser/API verification of isolation, lifecycle, maximum attachments, retries/failures, reviewer revocation, and public-widget regressions. Add no new tests without the user's explicit request.

### Final scenario walkthrough

| Scenario | Expected result |
| --- | --- |
| Logged-in app user submits a bug | App supplies contact prefill/context; user can edit contact fields; report/images save privately without Heardsy reporter login. |
| Visitor submits from an app that accepts visitors | User supplies required name/email and sends through the same private collector without an account. |
| Reporter closes/reopens the widget on the same page | Draft stays; refresh/leaving the page clears it. |
| Same user's app session temporarily expires | App pauses sending; in-memory draft survives until the same user is restored. Explicit logout/account change clears it. |
| Upload or database save fails | Keep the draft/images and show failure; do not acknowledge an incomplete report. Retry does not create duplicates. |
| Save succeeds but the browser loses the receipt | Retry with the same identifier returns the saved receipt, without another report or a second new-report notification. |
| Email delivery fails after brief retries | Feedback stays saved and usable; log delivery failure, with no durable delayed retry. |
| Teammate opens a link after removal | Current workspace authorization denies the report/image; existing historical notes remain. |
| Report is closed or marked Shipped | Keep its original submission, metadata, screenshots, and team history privately. |
| Admin confirms permanent deletion | Remove the report and its private content/links; remove image objects or let failed object cleanup be picked up by the existing sweep. |
| Team changes private widget appearance | Save independent defaults; app overrides still win, and public widget settings stay unchanged. |

### Q33: Does this consolidated design match the intended first version?

- A: Confirm this design and lifecycle defaults.
- B: Adjust the design; identify what should change.
- Answer: A, confirmed on 2026-10-11: "It's good". In the same instruction, the user separately authorized phased planning, delegated implementation, thorough local validation, screenshots/video, commits, push, PR creation, and review remediation. Merging remains excluded.

## Definitions

See [CONTEXT.md](../CONTEXT.md). Application users who submit reports and Heardsy teammates who review reports are different groups.

## Recorded architecture decisions

- [Keep reporter identity separate from Heardsy dashboard accounts](adr/0001-separate-reporter-and-dashboard-identities.md): reporters never need Heardsy accounts; authorized team members review in Heardsy.
- [Let the consuming application choose submission access](adr/0002-let-applications-control-submission-access.md): apps may require their own login or accept visitors. This choice does not change private inbox permissions.
- [Keep private feedback records separate from public posts](adr/0003-separate-private-feedback-records.md): dedicated private records avoid public account, visibility, voting, and notification side effects while reusing the existing deployment.

## Verified repository facts

- Team invitations exist, but dashboard access currently requires an admin role (`apps/web/src/functions/invites.ts`, `apps/web/src/routes/dashboard.tsx`).
- Signups automatically become members of the default Heardsy workspace, not every workspace. Existing membership has no distinction between invited staff and ordinary public signups (`packages/auth/src/index.ts`, `packages/db/src/schema/feedback.ts`). Private access must not be granted to all existing members by default.
- Current images support PNG, JPEG, GIF, and WebP, up to four at 5 MiB each. Upload ownership currently depends on a Heardsy account (`apps/web/src/lib/attachments.ts`, `apps/web/src/routes/api/uploads.ts`).
- Both unclaimed-upload cleanup and object-storage orphan cleanup need to recognize retained private feedback attachments (`apps/web/src/lib/attachment-db.ts`).
- Current integrations are Slack, Discord, and webhooks. They retry once and record only the destination's latest result; no GitHub connector or durable per-feedback delivery state currently exists (`packages/db/src/schema/integrations.ts`, `apps/web/src/lib/integration-db.ts`).
- Workspace statuses already support configurable labels, colors, ordering, and workflow kinds. Reusing them for private feedback also requires protecting statuses still used by private records when an admin deletes a status (`apps/web/src/lib/ops/setup.ts`).
- No feedback-assignment support was found in the current schema and relevant feedback operations. Assignment would be new functionality.
- New-post notification preferences exist, but no working team-email delivery for newly submitted posts was found. Private-feedback team emails would require recipient selection and a delivery trigger, rather than simply exposing the existing preference (`packages/db/src/schema/feedback.ts`, `apps/web/src/lib/notify.ts`, `apps/web/src/functions/posts.ts`).
- Sentry's current [React feedback configuration](https://docs.sentry.io/platforms/javascript/guides/react/user-feedback/configuration/#user-context) prefills fields from application-supplied user context (`Sentry.setUser` / `useSentryUser`). That documented prefill mechanism does not establish server-verified app login; prefilling and submission verification remain separate design choices.
- Existing widget settings cover theme, accent, launcher icon/label/visibility, bottom-left/right placement, and radius. Form headings/placeholders are fixed, logo/name are shared workspace branding, and the desktop panel is fixed at 400 px wide/up to 628 px high. General form-text, independent logo, and panel-size controls need new private-widget support (`apps/web/src/lib/widget-settings.ts:24`, `apps/web/src/routes/widget.tsx:229`, `apps/web/src/components/widget/feedback.tsx:296`, `apps/web/src/lib/widget-loader.js:116`).
- The current loader already supports an app-owned trigger and open/close/toggle controls, including a hidden floating launcher. Appearance precedence is defaults, then dashboard settings, script attributes, then runtime config (`apps/web/src/lib/widget-loader.js:17`, `apps/web/src/lib/widget-loader.js:306`, `apps/web/src/lib/widget-loader.js:320`).
- One workspace-wide settings column and shared logo currently serve the public widget; no independent private settings exist. Appearance and allowed-origin writes are separate endpoints but both require admin access, so teammate appearance access can be added separately from origin-management permission (`packages/db/src/schema/feedback.ts:35`, `apps/web/src/functions/widget.ts:43`).
- No app-supplied submission metadata schema, storage, display, or widget API was found in the current feedback paths. Existing widget configuration metadata is appearance information, a different concept from per-report app context (`apps/web/src/components/widget/feedback.tsx:225`, `packages/db/src/schema/feedback.ts:120`).
- Public post creation requires a Heardsy user, reserves that account's uploads, inserts a vote, and dispatches current integrations. Existing list/detail reads are public apart from conditional approval-review hiding; a status change can make an approval-held post public. These paths are not a durable private inbox (`apps/web/src/functions/posts.ts:63`, `apps/web/src/functions/posts.ts:153`, `apps/web/src/functions/posts.ts:218`).
- Current status/history helpers write public posts and post-linked activity and send public integrations and author/voter/commenter emails. Reuse status definitions and suitable lower-level UI/email primitives, rather than invoking these whole public-post operations for private records (`apps/web/src/lib/ops/posts.ts:67`, `packages/db/src/schema/feedback.ts:258`, `apps/web/src/lib/notify.ts:51`).
- No client submission identifier or duplicate-safe submission path was found in existing post creation. Existing email delivery uses an in-memory queue with brief rate-limit retries and logged errors, with no durable retry job in the inspected schema (`apps/web/src/functions/posts.ts:206`, `apps/web/src/lib/notify.ts:112`, `apps/web/src/lib/notify.ts:142`).

## Decision tree

1. Foundations: application-to-workspace mapping, submission integration, and teammate responsibilities.
2. Reporter experience: form fields, identity changes, app-supplied metadata, attachments, submission failures, and confirmation or email follow-up.
3. Private inbox: access grants, tracking workflow, notifications, history, and attachment lifecycle.
4. Widget customization: teammate permissions, text/logo/colors/size/placement, dashboard defaults, app overrides, and independence from public settings.
5. Architecture: record separation, storage and authorization boundaries, submission reliability, team email delivery, and deployment/configuration needs.
6. Final walkthrough: normal use, expired app session, removed teammate, unsuccessful submission, unavailable email delivery, explicit deletion, and appearance changes. Confirm shared understanding before implementation.

The GitHub branch is deferred rather than an unresolved prerequisite for this version. Historical GitHub questions below are retained for context; their options are not approved requirements.

Downstream details depend on the foundation choices. Recommendations remain proposals until answered.

## Round 1: foundations

### Q1: Where does each application's feedback go?

- A: One Heardsy workspace per application.
- B: Multiple applications share one Heardsy workspace, with an application filter.
- Recommendation: A for the first version, to reuse the workspace as the ownership, team, and connector boundary.
- Example: App A and App B each have their own Heardsy workspace and inbox.
- Answer: A, confirmed by the user on 2026-10-11: "Yes one works-pace per app".
- Rationale: each app has its own feedback ownership and receiving team, without a shared multi-app inbox.

### Q2: What does the consuming application's backend handle?

- A: Confirm the logged-in user in the background; the widget then sends feedback and images directly to Heardsy with short-lived proof.
- B: Confirm the logged-in user and forward every feedback submission and image to Heardsy itself.
- Recommendation: A to keep the consuming application's integration small.
- Example: The reporter opens the widget and submits without another login. A handles just a background login check; B also relays the message and files.
- Answer: A, confirmed by the user on 2026-10-11. The app checks its existing login and obtains name/email from its session/user to prefill the widget, similar to the Sentry feedback experience. No reporter login to Heardsy is introduced.
- Clarification: Q4 refines this answer. The consuming app checks its session where it requires login and may accept visitors elsewhere. Direct widget submission is chosen; an extra server verification endpoint is not approved by this answer. App-supplied identity must not be presented as independently verified by Heardsy.

### Q3: What can authorized teammates do?

- A: Read feedback, add internal notes, and change its status.
- B: Read feedback only; admins handle notes and status changes.
- Recommendation: A so teammates can handle reports without becoming workspace admins.
- Example: A developer can mark a bug as in progress or done under A; under B, they ask an admin to change it.
- Answer: A, confirmed by the user on 2026-10-11: "Option A". Authorized teammates can read, add internal notes, and change status. Initially widget configuration, GitHub connections, and team management were admin responsibilities. Later clarification grants authorized teammates private-widget text/appearance editing, and GitHub integration is deferred; team management remains admin-only.

## Round 2: submission access and reporter experience

### Q4: Should Heardsy independently verify app login?

- A: Yes. Add a small background server check in the consuming app that supplies short-lived proof for Heardsy to verify. No additional user login.
- B: Trust the app to show the widget after login and supply name/email, like the Sentry prefill flow. No extra verification endpoint, but someone could call the submission endpoint directly from outside the app.
- Recommendation: A if "only logged-in application users can submit" is a requirement enforced by Heardsy. B is the simpler integration if application-controlled visibility is sufficient.
- Example: a direct attempt to send feedback without an app login is rejected under A; B relies on app-controlled widget visibility for the intended reporter experience.
- Answer: custom, confirmed on 2026-10-11. The app checks its own auth session, uses it to prefill name/email, and allows submission after that check where login is required. For other apps, the user wants visitor submissions without checking login: "it depends".
- Decision: support app-controlled submission policy, with optional app login rather than a universal logged-in-only widget. Do not require a new Heardsy login or silently make an extra verification endpoint mandatory. This supersedes the earlier universal logged-in-only scope.

### Q5: Does the form need a separate title?

- A: Require just the message, and generate an initial short summary from its first line without AI.
- B: Ask for a title and a message.
- Recommendation: A to reduce the effort of submitting feedback.
- Example: "Export crashes when I select a date range" becomes the summary shown in the inbox and the initial GitHub issue title.
- Answer: B, confirmed on 2026-10-11. Require both a title and a message.

### Q6: Which attachments belong in the first version?

- A: Images/screenshots only.
- B: Images/screenshots and uploaded video files.
- Recommendation: A to reuse the current image support; video adds formats, upload sizes, and playback decisions.
- Example: a screenshot of an error under A; an existing screen recording can also be attached under B.
- Answer: A, confirmed on 2026-10-11. Support images/screenshots only in the first version; this settles the earlier video request as outside the initial scope.

### Q7: Should the app include basic context with a report?

- A: Include the current page path and, if applicable, the app's customer/workspace identifier.
- B: Include only the form fields and reporter identity.
- Recommendation: A to help the receiving team locate the affected part of the app. Capture a page path, without query strings, and only context the app deliberately supplies.
- Example: a report identifies the Invoices page and Acme's customer workspace within the application. It still belongs to the application's single receiving Heardsy workspace.
- Answer: custom, confirmed on 2026-10-11: workspace ID is enough. Do not capture current page path/URL, because the reporter may be on a different page than the affected feature or bug.
- Clarified by Q21: workspace ID was one app's example. Support optional generic app-supplied metadata instead of a fixed customer-workspace field. Do not automatically gather URLs or diagnostics.

### Q8: Should reporters receive emails?

- A: No automatic reporter emails in the first version; show confirmation in the widget.
- B: Send a submission receipt only.
- C: Send a receipt and optional status updates, with the reporter opting in to updates.
- Recommendation: A for the initial submit-and-done experience.
- Example: after a team marks a bug done, the reporter receives no email under A or B, and can receive an update under C.
- Answer: A, confirmed on 2026-10-11. Show confirmation in the widget and send no automatic reporter emails in the first version.

## Round 3: identity, images, and account changes

### Q9: Can logged-in reporters edit prefilled name and email?

- A: Keep app-supplied name/email read-only; fields not supplied by the app remain fillable.
- B: Let reporters edit the name/email for this submission.
- Recommendation: A to keep contact details consistent with the app profile. This is a form behavior, not proof of identity verified by Heardsy.
- Example: a logged-in reporter's work email remains the submitted contact email under A. Visitors can type their details in either option.
- Answer: B, confirmed on 2026-10-11. Reporters can edit their prefilled name/email for the submission. Preserve the distinction between editable contact details and any app-supplied user reference; do not label the edited contact details as verified app identity.

### Q10: Are name and email required when the app does not supply them?

- A: Require both name and email.
- B: Require email; name is optional.
- C: Make both optional.
- Recommendation: A because the original goal includes knowing who submitted the feedback.
- Example: a visitor on a public site types their name/email before submitting, without creating an account.
- Answer: A, confirmed on 2026-10-11. Require both name and email. Visitor feedback does not require an account or email-verification login.

### Q11: What are the image limits?

- A: Up to four images, 5 MiB each (shown as 5 MB in the UI), matching the existing upload rules.
- B: Up to eight images, 10 MiB each.
- Recommendation: A to reuse the current limits and keep storage bounded.
- Example: a reporter can attach an error screenshot and two screenshots explaining the steps under A.
- Answer: A, confirmed on 2026-10-11. Up to four images, 5 MiB each (shown as 5 MB), matching current limits.

### Q12: What happens to an open draft after logout or account switching?

- A: Clear the draft, selected images, and old reporter identity.
- B: Keep the title/message/images, but clear or replace the reporter identity according to the app's policy.
- Recommendation: A so another person cannot inherit the previous person's screenshots or unfinished report.
- Example: Alice logs out and Bob logs in on the same browser. Under A, Bob starts with an empty form.
- Answer: A, confirmed on 2026-10-11. Clear the draft, selected images, and previous reporter identity after logout or account switching. This is a widget state reset, not deletion of already-submitted feedback. Reopening and refresh behavior are subsequently settled in Q23; Q31 preserves the draft during temporary expiry of the same user's session.

## Round 4: private inbox workflow

### Q13: Which tracking statuses should the private inbox use?

- A: Use the workspace's existing status workflow, initially Pending, Under review, Planned, In progress, Shipped, and Closed.
- B: Give private feedback a smaller separate workflow: New, In progress, Done, and Closed.
- Recommendation: A to reuse the existing workflow and its configurable status definitions.
- Example: a feature request can be marked Planned before work begins under A. These private records never appear on the public roadmap because of a status choice.
- Answer: A, confirmed on 2026-10-11: "exsisting ones". Reuse the existing configurable workspace statuses. Status changes never expose private feedback on the public board or roadmap.

### Q14: Can a report be assigned to a teammate?

- A: Yes, optionally assign one authorized teammate to each report.
- B: No assignment field; the team works from a shared inbox.
- Recommendation: A so the team knows who is handling a report.
- Example: assign a bug to Alice while Bob handles a feature request. Assignment does not restrict other authorized teammates' access.
- Answer: A, confirmed on 2026-10-11. Optionally assign one authorized teammate per report; the assignment does not change other authorized reviewers' access.

### Q15: Should the team get emails for new feedback?

- A: Email workspace admins by default; authorized teammates can opt in.
- B: No team emails in the first version; review the dashboard.
- Recommendation: A so new feedback is not missed. These emails go only to authorized reviewers, independently of public-board membership.
- Example: an admin receives a notification when a new bug arrives. Reporters still receive no automatic emails, as decided in Q8.
- Answer: A, confirmed on 2026-10-11. Email admins by default and let authorized teammates opt in. Delivery depends on configured email infrastructure; a notification failure must not undo saved feedback.

### Q16: Can admins permanently delete feedback?

- A: Yes, admins can explicitly delete spam or mistakes; ordinary closing keeps the record.
- B: No permanent deletion in the first version; only close reports and retain them.
- Recommendation: A for manual cleanup, with deletion separate from closing and unavailable to ordinary teammates.
- Example: a duplicate or spam submission can be deleted explicitly under A; a completed genuine report remains in history when marked Shipped/Done or Closed.
- Answer: A, confirmed on 2026-10-11. Admins can explicitly delete spam or mistakes; closing retains history. Image cleanup and deletion confirmation are proposed in the consolidated lifecycle defaults for Q33. GitHub consequences are outside the active scope after its deferral. No real data deletion is authorized by this interview.

## Round 5: GitHub destination, sharing, and tracking (deferred)

Scope change on 2026-10-11: the user said, "Lets drop github integration for now". Q17-Q20 are retired from the current interview without selecting their options. Keep this discussion for a future revisit; it creates no dependency or implementation requirement for the first version.

### Q17: Where should GitHub issues go?

- A: One selected repository per Heardsy workspace, for both bugs and feature requests.
- B: Allow a separate repository for bugs and for feature requests.
- Recommendation: A for a small first-version setup consistent with one receiving workspace per application.
- Example: both a login bug and a request for dark mode create issues in the app's selected repository under A.
- Answer: deferred with the entire GitHub integration.

### Q18: Should GitHub issues include reporter contact details?

- A: Copy the title, message, feedback type, and a link to the Heardsy report. Keep reporter name/email in Heardsy.
- B: Copy the same information plus reporter name/email.
- Recommendation: A to keep contact details with the reviewing team. The report link still requires authorized Heardsy dashboard access. Screenshots are a separate sharing decision.
- Example: a public GitHub issue says "Export crashes" and describes the bug, without automatically adding the reporter's email under A. Contact information the reporter writes inside the message or screenshots can still be disclosed if those are shared.
- Answer: deferred with the entire GitHub integration.

### Q19: How should publishing to a public repository be approved?

- A: An admin explicitly enables automatic public sharing during connector setup; subsequent submissions create issues automatically.
- B: Require an admin to approve each report before it is published to a public repository. Private-repository issue creation remains automatic.
- Recommendation: A to match the requested automatic issue creation, with clear admin consent to the selected shared fields and the public destination.
- Example: after public sharing is enabled under A, tomorrow's bug report creates an issue without another approval. Under B, it waits for an admin's approval.
- Answer: deferred with the entire GitHub integration. A future integration would still need to settle private-to-public repository changes and sharing consent.

### Q20: Should closing or reopening a GitHub issue update Heardsy?

- A: No automatic status synchronization in the first version. Create and link the issue; the team manages Heardsy status separately.
- B: Closing/reopening a GitHub issue automatically updates its linked Heardsy report. Other Heardsy workflow steps remain managed in Heardsy.
- Recommendation: A for a smaller connector and a single place to manage the feedback workflow initially.
- Example: Alice closes the GitHub issue after fixing a bug. Under A, she also updates Heardsy; under B, Heardsy changes status automatically. The exact closed/reopened status mapping follows B if selected.
- Answer: deferred with the entire GitHub integration. No synchronization direction or status mapping has been selected.

## Round 6: workspace context, opening the widget, drafts, and team emails

### Q21: Which workspace ID should accompany feedback?

- A: Also include the customer's workspace ID from the consuming app, when that app has customer workspaces.
- B: Only use the receiving Heardsy workspace ID to route the report; send no additional app-workspace ID.
- Recommendation: A if the application has customer workspaces, because Heardsy's destination ID alone does not identify which customer workspace the report concerns.
- Example: a report belongs to the app's Heardsy inbox and also identifies Acme's workspace inside the app under A. Under B, it identifies only the receiving inbox.
- Answer: custom, confirmed on 2026-10-11. The consuming app can send optional metadata with a user's feedback; workspace ID was specific to one of the user's apps. Accept app-specific context rather than requiring a universal customer-workspace field. This supersedes the narrower Q7 interpretation and does not authorize automatic diagnostic collection.

### Q22: How should an app open the widget?

- A: Offer an optional floating Feedback button and let the app open the widget from its own button too.
- B: Only let the app open it from its own button; do not provide a floating button.
- Recommendation: A for easy installation while allowing apps to choose their own placement and hide the floating button.
- Example: one app uses the floating button; another opens the form from Help > Send feedback.
- Answer: A, confirmed on 2026-10-11: "just like the current widget offers". Support both an optional floating launcher and app-owned trigger. The app still controls submission access and supplies session-derived contact details where appropriate.

### Q23: Should an unfinished draft survive a page refresh?

- A: Keep it only while the page stays open. Closing/reopening the widget on that page preserves it; refreshing or navigating away clears it.
- B: Save it in the browser so a page refresh restores it.
- Recommendation: A for a smaller first version without persistent browser drafts.
- Example: a reporter closes the widget to check something and reopens it on the same page without losing the draft under A. Refreshing clears it under A and restores it under B.
- Answer: A, confirmed on 2026-10-11. Keep drafts only while the page stays open; closing/reopening the widget preserves them, and refresh/leaving the page clears them. Clear previous drafts and identity on logout/account switching as settled in Q12. Do not add persistent browser/server drafts or reporter accounts.

### Q24: What should a new-feedback team email contain?

- A: The report title, bug/feature type, and an authorized dashboard link.
- B: The same information plus the message and reporter name/email.
- Recommendation: A for a short notification; authorized reviewers open the dashboard for the full report and screenshots.
- Example: an admin sees "New bug: Export crashes" and opens the report in Heardsy under A. Under B, the email also contains the submitted message and contact fields.
- Answer: A, confirmed on 2026-10-11. Send the title, bug/feature type, and dashboard link. Q15's admin defaults and teammate opt-in remain settled; no reporter email is introduced.

### Additional requirement: dashboard teammate customization

Confirmed on 2026-10-11: authorized dashboard teammates must be able to edit basic private widget text, logo, colors, size, and placement. This replaces admin-only appearance management from Q3. It does not grant ordinary public-board members dashboard access. Appearance customization does not silently change the required form fields, admin-only deletion, or team management rules already decided.

## Round 7: metadata presentation and customization controls

### Q25: Should reporters see or edit the app-supplied metadata?

- A: Send it behind the scenes; show it only in the team's private dashboard.
- B: Show it in the widget, but keep it read-only.
- C: Show it in the widget and let the reporter edit it.
- Recommendation: A to preserve the simple submission form and let the app supply its own context.
- Example: the app supplies workspaceId, plan, and appVersion without asking the reporter to fill three extra fields under A.
- Answer: A, confirmed on 2026-10-11. Metadata is sent behind the scenes and displayed with the report in the team's private dashboard; the reporter does not see or edit metadata fields in the form. App-supplied metadata remains supplied context, not independently verified identity or an authorization source.

### Q26: Can teammates also change which websites may use the widget?

- A: Teammates edit text/appearance; admins manage allowed websites/domains.
- B: Teammates edit both appearance and allowed websites/domains.
- Recommendation: A to keep appearance collaboration separate from deployment access decisions.
- Example: a designer can change the logo/color under either option. Adding staging.example.com to allowed sites requires an admin under A.
- Answer: A, confirmed on 2026-10-11. Teammates edit text/appearance; only admins manage allowed websites/domains. Invitations, workspace access management, and permanent feedback deletion remain admin-only.

### Q27: How should widget size be customized?

- A: Editable desktop width and height, with the widget automatically fitting smaller screens.
- B: Small, Medium, and Large presets, also fitting smaller screens.
- Recommendation: A for the basic size control requested, using sensible defaults and bounded values.
- Example: choose a 480 px desktop width under A; the widget still fits the phone screen.
- Answer: B, confirmed on 2026-10-11. Use Small, Medium, and Large presets with responsive fitting, rather than custom width/height inputs. This concerns the feedback panel rather than custom sizes for every input/control.

### Q28: Can an app override dashboard appearance settings?

- A: Yes. Dashboard settings are defaults; the app can override appearance for its installation, like the current widget.
- B: No. Appearance is controlled only in the Heardsy dashboard.
- Recommendation: A to keep the current integration pattern and let apps match their own UI where needed.
- Example: the dashboard defaults to blue, but an app explicitly sets its installation to green under A. Under B, the saved dashboard color is used everywhere.
- Answer: A, confirmed on 2026-10-11. Dashboard settings are defaults; apps may override appearance for an installation, following the current integration pattern. This is appearance precedence only; overrides do not grant private-feedback access or bypass server access controls.

## Round 8: record separation, original content, session expiry, and email failure

### Q29: Should private reports have their own records, separate from public board posts?

- A: Yes. Use separate private-feedback records and submission/read operations within the existing Heardsy backend, database, and image storage.
- B: Reuse public post records, adding permanent private visibility and adapting all affected public queries and side effects.
- Recommendation: A because the existing public paths require Heardsy reporter accounts and have public-board voting, visibility, integration, and notification behavior.
- Example: marking a private feature request Shipped cannot make it a public board/roadmap post under A. B must add permanent visibility checks throughout the existing public paths to preserve the same boundary.
- Answer: A, confirmed on 2026-10-11. Use separate private-feedback records and operations in the existing backend, database, and image storage. This does not require another deployed service.

### Q30: Can teammates rewrite the originally submitted title, message, or contact details?

- A: Keep those submitted fields unchanged; reviewers add internal notes, change status, and assign the report.
- B: Allow edits to those submitted fields, retaining the original and a history of changes.
- Recommendation: A for a smaller first version and a clear record of what the reporter submitted.
- Example: a teammate adds a note clarifying a vague report under A. Under B, they can rewrite its message while the original remains in history.
- Answer: A, confirmed on 2026-10-11. Preserve original title/message/contact details; reviewers add notes and change status/assignment. Do not add original-content editing or a content-revision system to the first version.

### Q31: What if an app-required login temporarily expires while a reporter is typing?

- A: Clear the unfinished form, like logout.
- B: Keep the draft in memory and pause submission until the same app user is signed in again.
- Recommendation: B for temporary expiry, while explicit logout or account switching still clears the draft under Q12.
- Example: the app renews the same person's expired session without refreshing the page. B preserves their draft; refreshing still clears it as decided in Q23.
- Answer: B, confirmed on 2026-10-11. Preserve the in-memory draft and pause submission during temporary same-user app-session expiry. Explicit logout or account switching still resets the draft. The consuming app reports the session state; Heardsy does not independently discover or verify it, and no Heardsy reporter login is introduced.

### Q32: What if a team notification email cannot be delivered?

- A: Save the feedback and keep a pending notification so Heardsy can retry it later.
- B: Save the feedback, use brief delivery retries, then log any remaining failure without a durable retry job.
- Recommendation: A if notification reliability is part of the first version; it requires a small persistent notification job and a background retry trigger. B reuses the current delivery approach with fewer changes.
- Example: the email provider is unavailable for an hour. Under A, the notification can be delivered after it recovers; under B, the report remains in the dashboard but its email may be missed.
- Answer: B, confirmed on 2026-10-11: "keep it simple please". Reuse brief delivery retries and log remaining failures; add no durable email retry job/outbox/queue. Confirm successfully saved feedback independently of email delivery, even if the notification is missed.

## Final review

The consolidated architecture, lifecycle defaults, work sequence, and scenario walkthrough are recorded near the start of this document. All active product questions and the Q33 design confirmation are complete. Implementation and PR delivery were separately authorized in the user's Q33 response; no merge is authorized.

## Deferred scope

GitHub connector setup, issue creation, repository selection, public sharing, screenshot export, delivery retries, and status synchronization are all deferred. Do not introduce connector credentials, GitHub permissions, webhooks, queue/state for GitHub delivery, or placeholder connector UI into the first-version design or implementation. Revisit this feature only when the user brings it back into scope.

Uploaded video, reporter emails, persistent drafts, original-content editing/revisions, durable email retry jobs, and a separate reply-to field are outside the first version.

## Documentation process

Record each answer with its question number and rationale. Add glossary terms when their meaning is settled. Add a short ADR only for a settled decision with a consequential architectural tradeoff; do not turn every form setting into an ADR.
