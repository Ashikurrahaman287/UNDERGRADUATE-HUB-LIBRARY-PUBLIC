# API and Entry-Point Inventory

**Phase 0, source-derived.** API Route Handlers, Server Actions, and one Supabase Edge Function were identified. Server Actions are network entry points and must retain their own authorization checks.

## Route Handlers

| Route | Method | Authentication/control | Purpose |
|---|---|---|---|
| `/api/cron/accrue-fines` | GET | `CRON_SECRET` bearer token, constant-time comparison; service-role client after check | Fine accrual, reminders, queued SMS processing. |
| `/ref/[code]` | GET | Public; validates referral-code shape | Sets an HTTP-only referral cookie and redirects to registration. Redirect target is a fixed local path. |
| `/ashik-loves-jannat/members/export/csv` | GET | `requireAdminSession()`; no-store/noindex response | Exports full member-profile records. Sensitive bulk-read operation; see F-05. |

There is no `middleware.ts`; this Next.js 16 application uses `proxy.ts`. The proxy excludes `/api/`, so the cron route’s own token validation is the relevant control.

## Supabase Edge Functions

| Function | Gateway setting | Application control |
|---|---|---|
| `send-sms` | `verify_jwt = false` in `supabase/config.toml` | Validates Standard Webhooks signature; limits payload/response sizes; allowlists exact HTTPS SwiftSMS endpoint; validates phone/OTP; times out provider request. Secret configuration and hosted hook linkage remain unverified. |

## Server Action Modules

**Admin:**

- `app/admin/(protected)/actions.ts`
- `app/admin/(protected)/books/actions.ts`
- `app/admin/(protected)/careers/actions.ts`
- `app/admin/(protected)/categories/actions.ts`
- `app/admin/(protected)/finances/actions.ts`
- `app/admin/(protected)/fines/actions.ts`
- `app/admin/(protected)/manual-approved-members/actions.ts`
- `app/admin/(protected)/members/actions.ts`
- `app/admin/(protected)/membership-requests/actions.ts`
- `app/admin/(protected)/payments/actions.ts`
- `app/admin/(protected)/rental-requests/actions.ts`
- `app/admin/(protected)/rentals/actions.ts`
- `app/admin/login/actions.ts`

**Member/public workflows:**

- `app/careers/actions.ts`
- `app/member/apply/actions.ts`
- `app/member/dashboard/wallet/actions.ts`
- `app/member/login/actions.ts`
- `app/member/logout/actions.ts`
- `app/member/notifications/actions.ts`
- `app/member/register/actions.ts`
- `app/member/rent/actions.ts`
- `app/member/rent/return-actions.ts`
- `app/member/reservations/actions.ts`

The admin pages are grouped under `app/admin/(protected)/layout.tsx`, which validates the admin session. Admin Server Actions also perform server-side guards. Finance mutations use the super-admin guard. Member mutation actions use member session checks or `getMemberSession()`.

## Page/Component Areas

- Public: catalogue, book/category detail, careers, informational pages, referral landing.
- Member: login/OTP, registration/profile, membership, dashboard/payments/referrals/my-books, rentals/reservations, notifications, careers applications.
- Admin: custom-path login and protected workspaces for books, categories, members/identity, payments, subscriptions, rentals, reservations, referrals/finance, careers, reports/settings, and member exports.
- Server-side integration modules: Supabase clients, PII encryption, SMS, admin session/OTP, member session, review RPCs, book queries, and job/application workflows.

No call sites for the browser Supabase client factory were found in the application source search; primary data access is server-side. The service-role key is read from the server-only Supabase module and server scripts, not a `NEXT_PUBLIC_` variable.