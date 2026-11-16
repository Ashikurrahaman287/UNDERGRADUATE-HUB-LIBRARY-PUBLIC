# Undergraduate Hub Library

A modern library catalogue and member portal built with Next.js and Supabase. The project supports public browsing of books and categories, while member and admin workflows handle rentals, reservations, membership updates, payments, and reporting.

## Overview

This application is designed for a university library environment and includes:

- a public-facing catalogue for books and categories
- member sign-in and account management
- rental and reservation flows
- admin tools for catalog management, approvals, and member operations
- Supabase-backed persistence for data and storage

## Tech stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Supabase
- Vercel-ready deployment setup

## Local setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a local `.env.local` file and add your own Supabase and app configuration values.
3. Start the app:
   ```bash
   npm run dev
   ```

## Useful scripts

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run validate
npm run seed:books
```

## Project structure

- `app/` - pages, routing, and app-level logic
- `components/` - reusable UI components
- `data/` - local data used for setup and content imports
- `lib/` - shared logic and Supabase helpers
- `public/` - static assets and images
- `scripts/` - maintenance and seed scripts
- `supabase/` - database migrations and Supabase configuration

## Notes

This project is meant to be a clean, maintainable library management website that can be adapted for your own institution, content, and deployment setup.
