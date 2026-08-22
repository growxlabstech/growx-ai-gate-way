# D3 Authentication and Onboarding Evidence

Date: 2026-08-21

## Pre-change audit

1. `screenshots/01-existing-sign-in.png` — D1-consistent visual treatment, but Google and GitHub appeared without proven configuration and sign-in/sign-up duplicated one passwordless flow.
2. `screenshots/02-existing-otp-start-failure.png` — OTP start produced a generic failure without distinguishing rate limiting, invalid OTP, expiry, or context resolution.

## Source findings

- Better Auth owns OTP issuance, hashed storage, attempt validation, session/cookie issuance, OAuth state, and account linking.
- `/v1/auth/context` owns real user/organization/workspace state.
- Organization application logic transactionally creates owner membership/role, default workspace/environment, audit, and outbox records.
- The authenticated identity edge now exposes the existing Phase-2 transactional creation application through `/v1/onboarding/organization` and `/v1/onboarding/workspace`.
- Invitation acceptance uses the existing invitation schema/domain rules through `/v1/invitations/accept` with hashed-token lookup, email ownership, single-use claiming, audit, and outbox persistence.

## Automated browser evidence

The fixture-backed suite exercises production UI using the same HTTP shapes without adding a production OTP bypass. It covers returning-user deep links, new-user organization/default-workspace creation, double submission, refresh resumability, onboarding route guards, invitation continuation/acceptance, invalid/expired OTP, rate limiting, Change email, legacy route normalization, configured-only OAuth visibility, unsafe return rejection, session expiry, D2 shell regression, and cross-tenant rejection.

Final evidence:

1. `screenshots/03-final-sign-in-desktop.png` — consolidated passwordless entry state.
2. `screenshots/04-final-otp.png` — accessible six-digit OTP state with expiry, resend, and change-email recovery.
3. `screenshots/05-returning-user-console.png` — returning-user routing into the authorized D2 workspace shell.
   Validation on 2026-08-21: 10/10 production interaction tests, 20/20 console unit tests, 13/13 identity tests, 3/3 organization tests, all relevant typechecks, changed-file lint, and the Next.js production build passed.
