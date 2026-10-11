# Private Feedback Widget

The Private Feedback Widget lets people in your app report a bug or ask for a
feature without a Heardsy account. Reports are private: only the receiving
workspace's admins and the teammates an admin grants private feedback access
read them, under **Private feedback** in the dashboard. Nothing appears on the
public board, roadmap, changelog or the [public widget](widget.md).

Each application uses its own Heardsy workspace. The snippet and settings are
under **Settings → Private widget**.

## Install

```html
<script src="https://acme.heardsy.com/private-widget.js" data-workspace="acme" async></script>
```

Load it from the receiving workspace's own address and name that workspace in
`data-workspace`. In production the two must match: `acme` is only collected
on `acme.<your domain>`, and a self-hosted install serves `default` from its
own origin. Locally everything runs on `http://localhost:3003`, so
`data-workspace` alone picks the workspace.

A missing or unknown workspace never falls back to another one; the loader
logs a warning and does not mount.

## Allowed sites

The panel can only be framed by the sites listed under **Settings → Private
widget → Install → Allowed sites** (admins only). Until a site is listed, no
site can embed it; the dashboard preview still works. This controls where the
panel can appear. It does not check your users' sign-in.

If the workspace sits behind Cloudflare Access, Access also gates the private
widget's script, frame and collector, so visitors outside Access cannot send.

## Commands

The loader defines `window.heardsyPrivate`. Calls made before it loads can be
queued:

```html
<script>
  window.heardsyPrivate = window.heardsyPrivate || function () {
    (window.heardsyPrivate.q = window.heardsyPrivate.q || []).push(arguments);
  };
</script>
```

| Command | What it does |
| --- | --- |
| `heardsyPrivate("open")` / `("close")` / `("toggle")` | Shows or hides the panel. |
| `heardsyPrivate("config", { contact, metadata, canSubmit, appearance })` | Each key is optional; only the keys you pass change. |
| `heardsyPrivate("reset")` | Clears the unfinished report, its images, the contact details and metadata. |

Any element with `data-heardsy-private-open` opens the panel too:

```html
<button data-heardsy-private-open>Report a problem</button>
```

After a report is saved the page receives a `heardsy-private:sent` event with
`{ submissionId }` and nothing else.

### `contact`

`{ name, email }` prefills the two required fields. The reporter can edit them,
and a field they edited keeps their value when you call `config` again. Name
and email are stored as supplied with the report; Heardsy does not verify them.

### `metadata`

Any plain object your team wants to see with the report, such as a customer
account ID, plan or app version. It may nest. Its JSON must be 8 KB or less;
anything else is dropped with a console warning. The reporter never sees it,
and it grants nothing: it is shown to reviewers as data. Heardsy never adds
the page URL or other diagnostics on its own.

### `canSubmit`

`false` keeps the form open and the draft intact but disables Send with "Sign
in again to send". `true` (the default) turns it back on. `reset` keeps the
current value, so only `config` changes it.

## Apps that require sign-in

```js
// After your app knows who is signed in:
heardsyPrivate("config", {
  contact: { name: user.name, email: user.email },
  metadata: { accountId: account.id, plan: account.plan },
});

// The same person's session expired and is being renewed:
heardsyPrivate("config", { canSubmit: false });
// ...renewed:
heardsyPrivate("config", { canSubmit: true });

// Sign out, or someone else signs in:
heardsyPrivate("reset");
heardsyPrivate("config", { contact: { name: next.name, email: next.email } });
```

Hide the launcher (see Appearance) and open the panel from your own button if
it should only be reachable while signed in.

## Visitors

Sites that accept feedback from anyone install the snippet and do nothing
else. Visitors type their name and email, which stay required.

## Drafts

The unfinished report lives in the panel's memory for the current page view.
Closing and reopening the panel keeps it; refreshing or leaving the page
clears it. Nothing is stored in the browser. A failed send keeps the draft and
its images so Retry sends the same report; a retry of a report that already
arrived does not create a second one.

## Limits

- Bug or feature request, a title (4 to 140 characters) and a message (up to
  5000).
- Up to four PNG, JPEG, GIF or WebP images, 5 MB each. No video.
- Each receiving workspace accepts up to 500 MB of images a day.

## Appearance

Admins and granted teammates set the theme, accent, launcher, position,
Small/Medium/Large size, logo and all wording under **Settings → Private
widget**, with a live preview. The sizes are 360, 420 and 520 pixels wide and
always fit the window; phones get the full screen. Wording never removes a
field.

Precedence, lowest first: defaults, the dashboard settings, `data-*`
attributes on the script tag, then `config({ appearance })`.

| Attribute | `appearance` key | Values |
| --- | --- | --- |
| `data-theme` | `theme` | `dark`, `light`, `auto` |
| `data-accent` | `accent` | hex colour |
| `data-launcher` | `launcher` | `icon`, `label`, `hidden` (`false` also hides it) |
| `data-launcher-label` | `launcherLabel` | up to 24 characters |
| `data-position` | `position` | `bottom-right`, `bottom-left` |
| `data-size` | `size` | `small`, `medium`, `large` |
| `data-open-on-load` | | opens on page load |
| | `logoUrl` | an `https://` image URL, or `false` for none |

`appearance` also accepts the wording keys from the dashboard (`heading`,
`helper`, `submitLabel`, `successMessage` and the field labels and
placeholders). Overrides change only how it looks for that installation.

## Both widgets on one page

The public and private widgets have separate scripts, globals
(`window.openheard`, `window.heardsyPrivate`) and attributes, so both can run
on one page. Put their launchers in different corners, or hide one launcher and
open that widget from your own button.
