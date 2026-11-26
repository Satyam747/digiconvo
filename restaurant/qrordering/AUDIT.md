# Audit of the original code and what v4 does about it

Files reviewed: `config.js`, `common.js` (1,965 lines), `index.html`, `menu.html`, `checkout.html`, `success.html`,
`dashboard.html` (6,268 lines), `supabase_master_code.txt`. About 60 problems found. "Fix" says what v4 does.

## A. Security (critical)
| # | Problem in the old code | Fix in v4 |
|---|---|---|
| 1 | Row Level Security was switched **off** on every table and the anon key is public (`config.js`). Anyone could read, change or delete all orders, menus and settings with one request. | RLS on for every table, default deny, table privileges revoked from `anon`, orders cannot be written directly, all actions go through checked functions. |
| 2 | Admin and staff **PINs stored in plain text** in `settings`, downloaded to every visitor (`select *`), and checked in JavaScript. | PINs removed. Supabase Auth accounts (password hashed in the database), captcha, optional/mandatory 2-step code. |
| 3 | If the settings request took more than 2.5 s the code fell back to built-in PINs `123456` / `000000`, so a slow network let anyone in. | Fallback removed. No default credentials exist. |
| 4 | `execute_close_day_reset()` was SECURITY DEFINER and callable with the public key: **anyone could wipe every order** (and the audit log). | Function dropped. No close-day. Deletion is done only by the nightly retention job. |
| 5 | Role checks (`window.CURRENT_ROLE`) existed only in the browser; staff could become admin from the console or call the API directly. | Roles live in the `staff` table; every function and policy checks them. Tested with staff sessions: all admin/owner calls refused. |
| 6 | The browser sent prices, discount, GST and total; the server stored them. A guest could pay Rs 1, or use negative quantities. | `place_order` re-prices every line from the menu, applies live offers, GST and rounding, limits quantities, and refuses unavailable items. |
| 7 | Stored XSS: guest name, item names (taken from customer-supplied cart JSON), notes, order ids inside inline `onclick`, settings values inside `value="..."`; bills written with `document.write` into a same-origin window. | `esc()` on every value, no inline handlers, strict CSP (no inline scripts), printing via hidden `srcdoc` frame, cart rebuilt on the server. |
| 8 | CSV "Excel" export: formula injection (`=HYPERLINK(...)` in a guest name), no UTF-8 BOM (Hindi/Rs sign garbled), object URLs never released. | Cells starting with `= + - @` are neutralised; BOM added; real `.xlsx` writer. |
| 9 | Order tracking read the whole order row by a guessable id (`ORD<timestamp><4 chars>`). | Guests only see their own orders (anonymous auth id + RLS). Ids are no longer a secret. |
| 10 | `supabase-js@2` loaded unpinned from a CDN, no CSP, no frame protection. | Pinned version, CSP meta + `_headers` (`frame-ancestors 'none'`, HSTS, nosniff), self-hosting/SRI instructions. |
| 11 | Raw database error text shown to users; on-screen debug banner with line numbers on the customer page. | Friendly messages only; debug banner removed. |
| 12 | Activity log was written by the browser: forgeable, skippable, never recorded who acted. | Written by database triggers/functions with the signed-in e-mail and role. |
| 13 | No bot protection or rate limits anywhere (login, ordering). | Captcha (verified by Supabase) on staff, owner and guest sign-in; per-guest and per-table order limits; ordering on/off switch. |
| 14 | Missing `?restaurant=` silently opened the first restaurant (Velvet Lounge). | The restaurant must be named in the link; otherwise a clear error page. |
| 15 | Any table text accepted: orders for tables that do not exist; guests could change the table. | Table must exist; optional secret per-table QR key; table field locked when it comes from the QR code. |

## B. Logic errors and bugs
| # | Problem | Fix |
|---|---|---|
| 16 | GST setting `0` displayed as `5` (`value="${GST\|\|5}"`); saving silently re-enabled 5 % tax. | Numbers are never defaulted with `\|\|`; 0 stays 0 (tested). |
| 17 | Editing any menu item set `available = true` and `veg = true` again; the form had no veg/non-veg field, so non-veg dishes could not be created. | Explicit Food-type field (must be chosen), edits keep availability, availability toggle sends the target value (no read-then-write race). |
| 18 | "Payment collected" report (Cash/UPI) always Rs 0: `payment_mode` was always "Pay at Counter" and the method was never recorded. | Staff pick Cash / UPI / Card when collecting; stored with time and user; reports split by method. |
| 19 | Average bill divided by all orders including cancelled; "revenue" included unpaid orders. | Cancelled excluded; Sales, Collected and Still-to-collect are shown separately. |
| 20 | Guest status page stopped polling at "Served", so "Completed / paid" never appeared. | Polls until Completed or Cancelled (pauses when the tab is hidden). |
| 21 | New-order sound never rang for the first order of the day (`LAST_ORDER_COUNT !== 0`). | Compares order ids; also a toast and nav badge. Tested. |
| 22 | "Today" was the viewer's device midnight: orders vanished from the kitchen board at 00:00 while still being cooked (bars/lounges); depended on device clock/timezone. | Business day in the restaurant's timezone with a configurable start hour; open orders are always shown. |
| 23 | Close Day deleted everything including pending orders and history. | Removed. Orders are kept 7 days, then deleted by the retention job. |
| 24 | "View orders" for table 1 matched tables 10, 11, ... (substring match). | Exact table match. |
| 25 | Offers used the guest's phone clock and timezone (changeable), ignored the Happy-Hour switch, and an overnight window (22:00-02:00) failed after midnight. | Server evaluates offers in the restaurant's timezone, honours the switch, handles overnight windows and the previous day's day-of-week. |
| 26 | Invoice numbers were random (`INV-<time>-<random>`); GST requires consecutive numbers. | Gap-free `INV/<FY>/<00001>` per restaurant per financial year; daily KOT and order numbers. |
| 27 | One GST line only; `GSTIN` printed but never stored. | GSTIN setting; CGST/SGST split on bills when a GSTIN is set. |
| 28 | Table "Occupied" status and the dashboard's occupied count came from two different sources; a table could be released with open orders. | One source of truth, updated by the database on every order change; release refused while orders are open. |
| 29 | Any status could be set to any other, even on completed orders. | Server-side state machine: Pending > Preparing > Ready > Served > (payment) Completed; cancellation needs a reason. |
| 30 | Print: the bill page printed itself and the dashboard printed again (two dialogs); a blocked pop-up crashed with a TypeError; paper width setting ignored; Rs sign hard-coded. | One print via hidden frame, no pop-ups, 58/80 mm honoured, currency from settings. |
| 31 | Refresh storms (focus + visibilitychange + 10 s timer each loading 4-6 endpoints), tables/menu counts rendered before data arrived, cart bar GST before settings loaded, negative refresh value could hammer the server. | Realtime updates + one debounced refresh + safety-net timer; values validated (5-300 s); pages render after data loads. |
| 32 | One shared cart key for all restaurants, never expiring; `calculateBill()` generated order ids and timestamps just by viewing the menu. | Cart per restaurant, expires after 8 h, stores only ids and quantities. |
| 33 | Retrying a failed order request produced a duplicate-key error (order existed) or duplicates. | Idempotent request id; double taps return the same order. |
| 34 | No logout, no session expiry, no idle lock. | Sign-out, per-role idle lock, Supabase session expiry. |
| 35 | No way to add or remove tables (only 1-10 existed); non-numeric names sorted wrongly. | Add/delete tables, natural sort, per-table QR codes. |
| 36 | Reports only for "today"; with Close Day deleting data there was no history. | Date-window reports, history by date, Excel/CSV export (7-day window). |
| 37 | Unavailable or removed items could still be ordered; notes length limited only in the browser; WhatsApp number without country code failed. | Checked in the database; lengths enforced; 10-digit Indian numbers get +91. |
| 38 | Cancel reason not stored; `alert()`/`confirm()` pop-ups block the kitchen screen. | Reason required and logged; in-page dialogs. |
| 39 | Native SQL script: `DROP TABLE ... CASCADE` on every run (wipes data), no indexes, no constraints, no foreign keys, settings not limited to one row, SECURITY DEFINER without `search_path`. | Non-destructive, idempotent schema with constraints, indexes, FKs, pinned `search_path`, private helper schema. |
| 40 | Dead code (thermal text printer, `randomID`, WhatsApp tests), global name collisions between `common.js` and `dashboard.html`. | Rewritten; modules with no shared globals beyond the intended helpers. |

## C. New in v4 (your requests)
* **Single Supabase project** for all restaurants (tenant id on every table, tenant isolation tested).
* **Owner console** (`owner.html`): onboard in one form, welcome message, QR sheets, suspend / valid-until, logins, delete with typed confirmation. Password stored hashed in Supabase Auth, never in code; 2-step verification mandatory and enforced by the database. Owner cannot read orders.
* **7-day automatic deletion** (pg_cron + self-healing fallback) of orders, logs and guest accounts, plus **date-window export** to Excel (.xlsx) and CSV.
* **Close-day reset removed.**
* Menu CSV import (with veg/non-veg required), QR code generator (no external service, keys never leave the browser), realtime kitchen board, history page, GST-ready bills.

## D. Not done / for your judgement
* The SQL could not be executed against a real Postgres here; run the checklist in README section 6.
* Online payment (UPI collect/verify) is not included; payment is recorded by staff.
* Table-level bills (one invoice for several orders of a table) are not included; each order has its own invoice.
* Legal: 7-day deletion versus GST record-keeping duties is the restaurant's responsibility (they must export). Ask your CA.
