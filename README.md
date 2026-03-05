# Taskora MVP (Freelance + Micro Jobs)

## Run
1. `npm install`
2. `npm start`
3. Open `http://localhost:3000`

## Production Deploy
- Full VPS/Nginx/PM2/SSL guide: [DEPLOY_PRODUCTION.md](./DEPLOY_PRODUCTION.md)
- Fast fill-and-run command pack: [DEPLOY_QUICK_COMMANDS.md](./DEPLOY_QUICK_COMMANDS.md)

## Deployment Toolkit
- Production env sample: [.env.production.example](./.env.production.example)
- PM2 ecosystem file: [ecosystem.config.cjs](./ecosystem.config.cjs)
- Nginx config template: [nginx/taskora.conf.example](./nginx/taskora.conf.example)
- One-command update script (after first deploy): [scripts/deploy_update.sh](./scripts/deploy_update.sh)
- One-command first-time bootstrap script: [scripts/bootstrap_production.sh](./scripts/bootstrap_production.sh)

### Bootstrap Usage
Run on Ubuntu VPS:

```bash
bash scripts/bootstrap_production.sh yourdomain.com www.yourdomain.com https://github.com/yourname/your-repo.git your-long-jwt-secret /var/www/taskora
```

## Environment
- `JWT_SECRET` (recommended in production)
- `GOOGLE_CLIENT_ID` (for real Google login)
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (for real GitHub login)
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` (for real Microsoft login)
- `BASE_URL` (example: `http://localhost:3000`, used for OAuth callbacks)
- `AUTH_RATE_WINDOW_MS`, `AUTH_RATE_MAX`
- `RESET_RATE_WINDOW_MS`, `RESET_RATE_MAX`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `MAIL_FROM` (for real reset emails)

## Features
- Signup/Login with JWT token
- Advanced registration form (name parts, gender, birth date, address, country, zip, role)
- Jobs list from backend API
- Gigs list from backend API
- Post job (requires login)
- Proposal submit for jobs (requires login)
- Freelancer: My proposals page with live status
- Client: Received proposals page with accept/reject actions
- Payment methods management (add/remove/set default)
- Payment method now includes account email + account number masking
- Jobs list mode toggle (Grid/List)
- Forgot password and reset password flow (demo token mode)
- `.env` config loader enabled (`dotenv`)
- Auth/reset endpoints rate-limited (`express-rate-limit`)
- KYC submission and status page
- Admin KYC review panel (approve/reject/mark review)
- Real-time style inbox/messages module (thread list + chat)
- File upload module for KYC document, avatar, and portfolio media
- Portfolio item edit/delete controls and admin KYC document viewer
- Contract + milestone + escrow workflow (accepted-bid dropdown, edit/delete milestones, transaction log)
- Dispute + admin mediation workflow with threaded messages
- Invoice module with per-milestone auto generation and downloadable PDF
- Unified timeline activity feed (contracts + disputes + invoices)
- Account settings page (payout email/account number, display name, phone)
  Supported providers: PayPal, AirTM, Payoneer, bKash, Rocket, Nagad, Wise, Skrill, Stripe Connect, Bank Transfer
- Dashboard stats includes payment methods count

## API
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/google`
- `GET /api/auth/config`
- `GET /api/auth/github/start`
- `GET /api/auth/github/callback`
- `GET /api/auth/microsoft/start`
- `GET /api/auth/microsoft/callback`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/search?q=...`
- `GET /api/categories`
- `POST /api/categories` (auth, employer/admin)
- `GET /api/notifications` (auth)
- `GET /api/messages/threads` (auth)
- `POST /api/messages/threads` (auth, by participant email)
- `GET /api/messages/threads/:threadId` (auth)
- `POST /api/messages/threads/:threadId` (auth)
- `GET /api/jobs` (supports `q`, `category`, `level`, `type`, `budgetMin`, `budgetMax`, `mode`)
- `POST /api/jobs` (auth)
- `POST /api/bids` (auth)
- `GET /api/my-bids` (auth)
- `GET /api/client/bids` (auth)
- `PATCH /api/bids/:bidId/status` (auth)
- `POST /api/contracts/from-bid` (auth, client/admin)
- `GET /api/contracts/candidates` (auth, client/admin)
- `GET /api/contracts` (auth)
- `PATCH /api/contracts/:contractId/status` (auth, client/admin)
- `GET /api/contracts/:contractId/milestones` (auth, participants/admin)
- `POST /api/contracts/:contractId/milestones` (auth, client/admin)
- `POST /api/contracts/:contractId/milestones/:milestoneId/proof` (auth, freelancer/admin)
- `PATCH /api/contracts/:contractId/milestones/:milestoneId` (auth, client/admin)
- `DELETE /api/contracts/:contractId/milestones/:milestoneId` (auth, client/admin)
- `PATCH /api/contracts/:contractId/milestones/:milestoneId/status` (auth, role-based)
- `GET /api/contracts/:contractId/transactions` (auth, participants/admin)
- `POST /api/contracts/:contractId/disputes` (auth, contract participants/admin)
- `GET /api/invoices` (auth)
- `GET /api/invoices/:invoiceId` (auth)
- `GET /api/invoices/:invoiceId/pdf` (auth, downloadable)
- `GET /api/timeline` (auth, aggregated activity feed)
- `GET /api/disputes` (auth)
- `GET /api/disputes/:disputeId` (auth, dispute participants/admin, includes evidence panel data)
- `POST /api/disputes/:disputeId/messages` (auth, dispute participants/admin)
- `PATCH /api/disputes/:disputeId/status` (auth, admin mediation)
- `GET /api/payments/methods` (auth)
- `POST /api/payments/methods` (auth)
- `PATCH /api/payments/methods/:methodId/default` (auth)
- `DELETE /api/payments/methods/:methodId` (auth)
- `GET /api/me/settings` (auth)
- `PATCH /api/me/settings` (auth)
- `GET /api/me/profile` (auth)
- `PATCH /api/me/profile` (auth)
- `POST /api/uploads/base64` (auth)
- `GET /api/uploads` (auth, optional `kind`)
- `POST /api/kyc/submit` (auth)
- `GET /api/kyc/status` (auth)
- `GET /api/admin/overview` (auth, admin)
- `GET /api/admin/kyc` (auth, admin)
- `PATCH /api/admin/kyc/:kycId/status` (auth, admin)
- `GET /api/gigs`
- `GET /api/dashboard`
- `GET /api/health`

## Data storage
- SQLite database file: `server/data/taskora.sqlite`
- Legacy seed source (first run migration): `server/data/db.json`

## Notes
- Payments module currently stores payout methods only.
- Forgot-password sends real email when SMTP env is configured.
- Real Google sign-in is enabled when `GOOGLE_CLIENT_ID` is set and the same origin is added to Google OAuth authorized JavaScript origins.
- Real GitHub/Microsoft sign-in is enabled when their client ID + secret are configured, and callback URLs point to your `BASE_URL`.
- Real gateway transfer/escrow automation (Stripe, PayPal, SSLCommerz etc.) is not implemented yet.
