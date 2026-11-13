# Shift Log — WordPress plugin

Private appointment ticketing with personal and house-wide insights. Sign-in, passwords, and password resets are handled entirely by WordPress core.

## Install

1. Zip the `shift-log` folder (or upload it to `wp-content/plugins/`).
2. **Plugins → Add New → Upload Plugin**, then activate.
3. Create a page and put the shortcode `[shift_log]` on it. That page is the app.
4. **Settings → Shift Log** to choose which roles can log tickets and which can see the house view.

Activation creates one table (`wp_shift_log_tickets`) and one role, **Shift Log Member**, which can log tickets and view house totals and nothing else in WordPress.

## Accounts

There is no custom login code in this plugin, by design.

| Need | Handled by |
|---|---|
| Password storage | WordPress core (phpass, salted, stretched) |
| Password reset | Core "Lost your password?" email flow |
| Sessions | Core auth cookies, HttpOnly, signed |
| Request forgery | `wp_rest` nonce on the app, `wp_nonce_field` on sign-up |

### Letting people sign themselves up

Under **Settings → Shift Log**, "New sign-ups" has three options:

- **Access code required** (current setting) — the sign-up form asks for a code you set and share privately. The live code is `RATPACK`. Five attempts per IP per hour, so it can't be guessed at scale.
- **Open** — no code at all; anyone can create an account.
- **Closed** — no public form; you add people under Users → Add New.

### Approval

**Automatic** (current setting): anyone entering the correct access code is active immediately and can log tickets and open the house-wide view. The code is therefore the only thing between a stranger and everyone's figures — keep it private, and change it if it spreads. You still get an email whenever an account is created.

**Review each account**: sign-ups land in the **Shift Log (awaiting approval)** role, which holds no capabilities at all — they can't log a ticket or see a single figure until you approve them. This mode adds a name field to the sign-up form so you can confirm each request is from someone you're expecting. That name is kept in exactly one field, `sl_verify_name`, and **deleted the moment you approve**. Declining deletes the account and the name together.

On automatic approval the name isn't collected at all, since there's no review for it to inform.

Either way, nothing on the account carries an identity. Usernames are randomly generated rather than derived from the email, so no name lands in `user_login` or an author URL where it can't be changed later. Display name and nickname are set to the anonymous handle at sign-up, so WordPress's own screens never show a real name.

Adding people yourself always works: **Users → Add New**, role **Shift Log Member**.

## How the privacy works

**Your own tickets.** Every read of ticket rows is scoped with `WHERE user_id = %d` against the current user. There is no endpoint in this plugin that returns another person's ticket rows, with or without a parameter.

**The house view.** It's aggregate-only. The SQL does `COUNT`/`SUM` with `GROUP BY`, and the response contains counts and rates — never rows. People appear as a generated handle like `KX7-24M`, stored in user meta; display names, usernames and emails are never sent to the browser for anyone but you.

**Party price.** On a booked ticket there are three choices:

| Choice | Your totals | House total |
|---|---|---|
| Add & share | counts | counts |
| Add, keep private | counts | absent |
| Leave it off | no figure | no figure |

A private price stores `price_mode = 'private'`; the house SQL sums only `price_mode = 'included'`, so a private figure has no path into any pooled number. An omitted price stores `amount = NULL` outright. All three still count as a booking in every rate. The house money column can also be switched off site-wide in settings.

**Personal notes.** Their own table, scoped to the author exactly as tickets are. Notes are never aggregated and appear in no house figure; no endpoint returns them for anyone but their author.

**Amounts on screen.** Hidden by default everywhere, shown only when you press "Show amounts", and hidden again on reload.

**Server-side rules.** The form hides the outcome toggle for a no-show and clears any price when the price is omitted. The REST layer re-applies both rules independently, so a hand-crafted request can't store a booking against a no-show or slip an amount onto an omitted price. All enum fields are checked against whitelists; nothing user-supplied ever reaches SQL unprepared.

## What this plugin can't protect against

Anyone with database access or an administrator account can read every ticket, including amounts. Handles protect users from each other, not from whoever runs the site. Say so plainly to the people using it.

Please also:

- **Serve the site over HTTPS.** Without it, passwords and amounts travel in the clear. The plugin shows an admin warning if you don't.
- **Add login throttling or two-factor.** WordPress doesn't limit login attempts on its own; Limit Login Attempts Reloaded or Wordfence plus a 2FA plugin covers it.
- **Keep the administrator list short**, and review it periodically.
- **Back up the table**, and decide up front how long you keep entries.

## Uninstalling

Deleting the plugin leaves ticket data in place on purpose. To have deletion actually drop the table, add this to `wp-config.php` first:

```php
define( 'SL_DELETE_DATA_ON_UNINSTALL', true );
```

## Verifying the maths

`tests/run.js` (kept beside the plugin folder, not inside it) loads the real
`shift-log.js` under a stubbed DOM, feeds it a fixture log, and checks every
rendered figure against independently computed values — 40 checks covering
rates, trimmed averages, quartiles, price modes, masking and test-ticket
exclusion. Run it with `node tests/run.js` after any change to the front end.

## Files

```
shift-log/
├── shift-log.php            bootstrap, constants, hooks
├── uninstall.php            opt-in data removal
├── includes/
│   ├── install.php          table schema, role, capabilities
│   ├── handles.php          anonymous handle per account
│   ├── rest.php             API: own tickets, aggregate house stats
│   ├── render.php           shortcode, login gate, asset enqueue
│   └── settings.php         admin settings and role access
└── assets/
    ├── shift-log.css        all styling, including the login form
    ├── shift-log.js         front end (no build step, no framework)
    └── fonts/               Archivo, Manrope, IBM Plex Mono — served from the site, not from Google
```
