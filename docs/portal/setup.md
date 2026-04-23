# Portal Setup

This guide explains local development, required environment variables, and database setup for the Cedarville App Portal.

## Requirements

- Node.js 20+
- Docker Desktop or another local Docker runtime
- A PostgreSQL database
- Microsoft Entra ID application credentials for Cedarville SSO

## Environment Variables

Add these values to `.env` for local development:

- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_MICROSOFT_ENTRA_ID_ID`
- `AUTH_MICROSOFT_ENTRA_ID_SECRET`
- `AUTH_MICROSOFT_ENTRA_ID_ISSUER`

## Local Development Flow

1. Install dependencies with `npm install`.
2. Start PostgreSQL with `npm run db:up`.
3. Apply the schema with `npm run prisma:migrate:deploy`.
4. Seed the template catalog with `npm run prisma:seed`.
5. Start the app with `npm run dev`.

## Verification

- `npm test`
- `npm run build`
- `npm run test:e2e -- e2e/create-and-download.spec.ts`

## Notes

- Generated ZIP artifacts are written to `.artifacts/`.
- The Playwright flow uses a test-only auth bypass so the end-to-end package flow can be exercised without Cedarville SSO in local automation.
