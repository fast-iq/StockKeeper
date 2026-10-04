# Workspace

## Overview

**StockKeeper** — a personal inventory management system for tracking parts, products, spare parts, and other items. Features per-user accounts, tree-structured categories, full-text search, and a modern dark industrial UI.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/inventory-app), served at `/`
- **API framework**: Express 5 (artifacts/api-server), served at `/api`
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: express-session with bcryptjs password hashing
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run generate` — generate a reviewed SQL migration from the Drizzle schema
- `pnpm --filter @workspace/db run migrate` — apply pending migrations to Development only
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## DB Schema

- **users** — id, email, password_hash, name, language, is_admin, created_at
- **categories** — id, name, description, parent_id (self-ref), user_id, color, icon, created_at
- **items** — id, name, description, quantity, price, unit, location, sku, barcode, tags, notes, category_id, user_id, created_at, updated_at
- **shops**, **item_prices**, **price_settings** — per-user shop names, dated item-price history, and price display settings

Schema changes are tracked in `lib/db/migrations`. Post-merge applies them to Development.
The Production API applies pending migrations at startup using `EXTERNAL_DB_URL` only and
fails closed if that Publishing secret is unavailable; it never falls back to `DATABASE_URL`.

## API Endpoints

- `POST /api/auth/register` — create account
- `POST /api/auth/login` — login (sets session cookie)
- `POST /api/auth/logout` — destroy session
- `GET /api/auth/me` — get current user

- `GET /api/categories` — tree of all user's categories (with children + itemCount)
- `POST /api/categories` — create category
- `GET/PATCH/DELETE /api/categories/:id` — CRUD

- `GET /api/items?search=&categoryId=&includeSubcategories=` — list items with filters
- `POST /api/items` — create item
- `GET/PATCH/DELETE /api/items/:id` — CRUD

- `GET /api/dashboard/stats` — totals (items, categories, quantity, lowStock, recentlyAdded)
- `GET /api/dashboard/recent` — recently added items
- `GET /api/dashboard/category-counts` — per-category item counts

- `GET /api/admin/users` — list all users with item counts (admin only)
- `PATCH /api/admin/users/:id` — update user language/isAdmin (admin only)

## Environment Variables Required

- `SESSION_SECRET` — secret for express-session cookie signing (already set)
- `DATABASE_URL` — Replit-managed Development PostgreSQL connection string
- `EXTERNAL_DB_URL` — external PostgreSQL connection string configured in Publishing for Production

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
