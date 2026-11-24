# DigiConvo QR Ordering - v5 (multi-restaurant, secure)

One Supabase project now serves **all** your restaurants. You (the DigiConvo owner) onboard and manage
them from `admin.html`. Each restaurant gets its own staff dashboard, menu, tables and QR codes.
Orders are deleted automatically after **7 days**; restaurants can export Excel / CSV for any date
window inside that period.

```
Guests      index.html?restaurant=<slug>&table=<no>&k=<key>   (QR code on the table)
Staff/Admin dashboard.html?restaurant=<slug>                   (e-mail + password + captcha)
DigiConvo   admin.html                                         (e-mail + password + captcha + 2-step code)
```

## 1. One-time setup (about 30 minutes)

### Step 1 - Create the Supabase project
Create a **new** project (recommended). Re-using an old single-restaurant project? First export each old
`menu` table as CSV (Table Editor -> Export), then run `sql/00_legacy_cleanup.sql` (it only drops the OLD
single-restaurant tables), and re-import menus later from each restaurant's Menu page.

### Step 2 - Create the database
SQL Editor -> New query -> paste all of `sql/01_schema.sql` -> Run. It is safe to run again later.
(Warnings about `pg_cron` are fine, see "Data retention" below.)

### Step 3 - Authentication settings (Supabase -> Authentication)
| Where | Setting |
|---|---|
| Sign In / Providers | **Email** enabled. **Anonymous sign-ins: ON** (guests get a private, captcha-verified session). |
| Attack Protection (Bot and Abuse) | **Enable CAPTCHA protection**, provider **Cloudflare Turnstile**, paste the Turnstile **secret key** (Step 4). |
| Rate Limits | Raise **Anonymous sign-ins** to about 300 per hour (many guests share one mobile-network or Wi-Fi IP address; the default 30 would block real customers). |
| Policies / Password | Minimum password length **12** or more. |
| Multi-factor | TOTP (authenticator app) enabled (default). |

You may also turn off **Allow new users to sign up**; the front-end never needs it for staff because logins are created by the Edge Function. If guest check-in then fails with "signups not allowed", turn it back on. This is safe either way: nobody gets any access just by having an account. Access comes only from the `staff` / `platform_admins` tables.

### Step 4 - Cloudflare Turnstile (free captcha)
Cloudflare dashboard -> Turnstile -> Add site -> add your website's domain -> widget "Managed".
Copy the **site key** into `config.js` (`TURNSTILE_SITE_KEY`) and the **secret key** into Supabase (Step 3).
The value already in `config.js` is Cloudflare's public *test* key, which always passes. Replace it before going live.

### Step 5 - Deploy the login service (Edge Function)
Supabase -> Edge Functions -> Create function named `manage-user` -> paste
`supabase/functions/manage-user/index.ts` -> Deploy (leave "Verify JWT" ON).
This is the **only** place that uses the service-role key, and Supabase injects it; it never appears in your files.
It creates restaurant logins and resets passwords, and only for the owner (any restaurant) or a restaurant admin (their own staff).

### Step 6 - Create your owner login
1. Supabase -> Authentication -> Users -> **Add user** -> *Create new user*: your e-mail, a long unique password, tick **Auto Confirm User**. (Your password is stored hashed inside Supabase Auth. It is not in any file.)
2. SQL Editor, run (with your e-mail):
```sql
insert into public.platform_admins (user_id)
  select id from auth.users where lower(email) = lower('you@yourdomain.com')
  on conflict (user_id) do nothing;
```

### Step 7 - Configure and publish the website
1. `config.js`: set `SUPABASE.URL` and `SUPABASE.ANON_KEY` (Project Settings -> API; use the **anon / publishable** key. **Never** use the service_role key here) and `TURNSTILE_SITE_KEY`.
2. Upload every file in this folder (except `tests/` and `sql/` if you like) to Netlify / Cloudflare Pages (these also apply `_headers`) or any HTTPS static host.
3. Optional hardening: download `supabase.js` once, put it next to the other files and change the `<script src=...jsdelivr...>` tag to `src="supabase.js"`, so no third-party script runs on the admin pages. (Or add an `integrity="sha384-..."` attribute: `curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`.)

### Step 8 - First sign-in
Open `https://your-site/admin.html` -> sign in -> **scan the QR code with an authenticator app** (mandatory) -> you are in.

## 2. Onboarding a restaurant (owner, 2 minutes)
`admin.html` -> **Add restaurant** -> name (the web address fills itself), number of tables, GST %, optional
manager e-mail (a strong password is generated) -> **Create**. You get a ready-to-send welcome message
(dashboard link, e-mail, password) and a button to **print the QR codes** for all tables.
Later, from the restaurant's page you can suspend / reactivate it, set a "valid until" date, add or reset logins,
print or download QR links, or delete it.

The Super Admin console (`admin.html`) is protected by Supabase Auth + Captcha + mandatory 2FA + an optional 16+ character DB-private bcrypt master passkey (`select private.set_admin_passkey('...');`). From `admin.html`, you can inspect live & recent orders and click **Assist** to open any restaurant's live dashboard directly (all actions are logged as `owner`).

## 3. What the restaurant does
1. Sign in at `dashboard.html?restaurant=<slug>`.
2. **Menu** -> Add item, or **Import CSV** (columns `category,name,description,price,veg,image_url`; every row needs `veg` or `non-veg`, so nothing is ever labelled wrongly by default).
3. **Tables** -> **Print QR codes**. Put each code on its table.
4. **Settings** -> GST %, GSTIN (bills then show CGST/SGST), printer paper width, WhatsApp, Google review link, team logins, two-step verification.
5. Daily: **Orders** (kitchen screen with sound alert), **Collect Payment** (Cash/UPI/Card), **Reports** to download Excel/CSV.

Old printed QR codes (only `?table=5`) stop working because tables now have a secret key in the link. Reprint, or in Settings switch "Guests must scan the table's QR code" to *No* (less secure).

## 4. Data retention (automatic, 7 days)
* Every night at 03:00 India time `private.purge_old_data()` deletes orders older than **7 business days**, their activity-log rows, daily counters and the temporary guest accounts. Menu, tables, settings and staff are kept.
* It runs from **pg_cron** (Database -> Extensions -> enable `pg_cron` if the schema script printed a notice). If cron is not available, a built-in fallback runs the same clean-up at most once every 24 h when a guest places an order. Owner console -> **Run auto-clean** runs it on demand.
* Restaurants choose a date window in **Reports** and download **Excel (.xlsx)** (Orders, Items and Daily summary sheets) or **CSV**. Windows are limited to the retained 7 days.
* To change the period, edit the number `7` in `private.retention_days()` (and `RETENTION_DAYS_FALLBACK` in `config.js` for the on-screen text).
* **Close-day reset has been removed** (it deleted records and could be triggered by anyone with the public key).
* Note: Indian GST rules expect invoices/records to be retained for years. The 7-day deletion is a privacy measure, so tell restaurants to download their exports (for example weekly) and keep them. Please confirm obligations with your CA.

## 5. Security model (what actually protects you)
| Threat | Protection |
|---|---|
| Someone edits prices / quantities in the browser | The cart holds only item ids and quantities. The database prices everything (offers, GST, rounding) in `place_order`. |
| Reading or changing data with the public key | Row Level Security on every table; table privileges revoked from `anon`; no direct writes to orders. |
| Guessing passwords / bots | Captcha verified by Supabase on every sign-in (staff, owner **and** guest check-in), Supabase rate limits, strong-password rule, optional 2-step code for staff, **mandatory** 2-step code for the owner (enforced by the database, not only the screen). |
| One restaurant touching another | Every function takes a restaurant id and checks membership in `staff`. Tested: a manager of A is refused on B. |
| Fake / spam orders | Captcha-verified guest session, per-guest and per-table limits, secret per-table QR key, ordering on/off switch, suspended restaurants refuse orders. |
| Script injection (XSS) | Every dynamic value is escaped, no inline event handlers, strict Content-Security-Policy, printing uses a hidden frame. Guest text is also cleaned in the database. |
| Spreadsheet formula injection | Exports neutralise cells starting with `= + - @`. |
| Lost / stolen staff tablet | Sign-out button, optional idle lock (`config.js`), per-device sessions. Remove the login from Settings -> Team. |
| Tampered audit trail | Activity log is written only by the database (with the signed-in e-mail). |
| Owner mistakes | Delete needs the exact web address typed; the last admin of a restaurant cannot be removed. |

**Honest limits.** No system is "hackproof". What remains: someone who owns an admin's e-mail/phone and password; a compromised Supabase or Cloudflare account (turn on 2-step there too); a compromised third-party script (self-host supabase.js to remove that risk); a guest who is physically at the restaurant and places a real order; DDoS (put the site behind Cloudflare). Rotate keys if you ever suspect a leak. Review Supabase's Security Advisor after setup.

## 6. Verification you should do on your own project
The SQL was reviewed and statically linted, and the website was tested in a real browser against a simulated backend (166 checks, folder `tests/`). It could not be executed against a real Postgres in my environment, so before launch please run through this on your project:
1. Create a test restaurant in `admin.html`; sign in as its manager; import 3 menu items.
2. Open a table's QR link on a phone: check-in -> order -> see status change as staff moves it.
3. Collect payment, open **Reports**, download Excel.
4. As the manager, try another restaurant's slug in the URL: you must be refused.
5. Run **Run auto-clean** from the owner console (nothing recent should disappear).

## 7. Troubleshooting
| Symptom | Fix |
|---|---|
| "The app is not configured" | `config.js` still has the placeholder URL/key. |
| Guests: "Captcha check failed" | Turnstile secret in Supabase does not match the site key / domain not added in Turnstile. |
| Guests: "Guest check-in is not enabled" | Authentication -> Sign In / Providers -> Anonymous sign-ins ON. |
| Guests: "Too many check-ins from this network" | Raise the anonymous sign-in rate limit (Step 3). |
| Add login: "login service is not installed" | Deploy the `manage-user` Edge Function (Step 5). |
| Owner can't see restaurants after sign-in | The `platform_admins` insert (Step 6) was not run, or 2-step verification was skipped. |
| Printing does nothing | Allow printing in the browser; choose the receipt printer; for 80 mm paper set it in Settings. |

## 8. Files
`config.js` (public settings) - `common.js`, `ui.js`, `login.js`, `qr.js`, `xlsx.js` (shared code) - `index/menu/checkout/success` (guests) -
`dashboard` (restaurant) - `owner` (DigiConvo) - `sql/` (database) - `supabase/functions/manage-user` (login service) - `_headers` - `tests/`.
See `AUDIT.md` for every flaw found in the old code and how it was fixed.
