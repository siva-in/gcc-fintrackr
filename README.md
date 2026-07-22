# FinTrackr

Multi-organization financial tracking and approval management system.

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS 4, Zustand
- **Backend**: Node.js, Express, Prisma ORM
- **Database**: PostgreSQL (portable to MySQL via Prisma)
- **Auth**: JWT-based authentication

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL

### Setup

```bash
# Make PostgreSQL available and update backend/.env
chmod +x setup.sh
./setup.sh
```

### Run

```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend && npm run dev
```

Open http://localhost:3000

### Default Login

- **Username**: admin
- **Password**: nimda

## Features

- Multi-organization support with org switching
- Role-based access control (Admin, Editor, Viewer, Approver)
- User CRUD with search and pagination
- Organization management with member/role assignment
- Request creation with automatic approval workflow
- Approve/Reject workflow for designated approvers
- Responsive layout (mobile-friendly sidebar)
- PWA support

## Role Permissions

| Feature | Admin | Editor | Viewer | Approver |
|---------|-------|--------|--------|----------|
| View data | ✅ | ✅ | ✅ | ✅ |
| Create/Edit users | ✅ | ❌ | ❌ | ❌ |
| Manage organizations | ✅ | ❌ | ❌ | ❌ |
| Create requests | ✅ | ✅ | ❌ | ❌ |
| Approve/Reject | ✅ | ❌ | ❌ | ✅ |

## Database

The schema uses PostgreSQL but is portable to MySQL via Prisma. To switch:

1. Update `backend/prisma/schema.prisma` provider to `"mysql"`
2. Update `DATABASE_URL` in `backend/.env`
3. Run `npx prisma db push`
