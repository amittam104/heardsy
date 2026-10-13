# Changelog

Notable changes to Heardsy. Versions follow the root `package.json`.
Releases are on [GitHub](https://github.com/amittam104/heardsy/releases).

## [0.2.0] - 2026-10-13

### Changed

- The main origin (the cloud apex, a self-hosted domain, local dev) opens on
  the landing page, and its board moves to `/feedback`. A workspace subdomain
  in the cloud still opens on its board at `/`.
- Board links with filters on the main origin's `/` redirect to `/feedback`
  with the same query.
- Header, sitemap, sign-out, the dashboard "Public board" link and MCP
  workspace and board URLs point to the board path for the current origin.
- Signing in sends admins to the dashboard (or first-run setup), teammates
  with private access to private feedback, and everyone else to the board.
  The cloud apex still sends you to your newest workspace or `/new`.

### Added

- Light, Dark and System theme for the dashboard, saved in the browser and
  kept separate from the public board's theme choice.
- Local dev: a signed-in account without dashboard access to the default
  workspace is sent to its newest workspace's dashboard with `?ws=`.

### Fixed

- Accessibility: skip link, visible focus rings, `aria-current` on nav,
  labelled auth fields with linked errors, and higher-contrast light-theme
  muted, faint, link, ring and destructive colours.
- Mobile: the dashboard navigation opens as a dialog and returns focus to
  its trigger; larger touch targets on the header and theme menu.
- Auth: clearer sign-in and sign-up copy and error recovery; signed-in
  visitors without dashboard access go back to the board instead of the
  sign-in page.
- Private feedback inbox and detail layouts in the dashboard.

Also includes work merged to `main` after v0.1.0, including the Private
Feedback Widget ([docs](docs/private-widget.md)) and the Heardsy name across
the app.

## [0.1.0] - 2026-09-26

- First tagged version of the fork.

[0.2.0]: https://github.com/amittam104/heardsy/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/amittam104/heardsy/releases/tag/v0.1.0
