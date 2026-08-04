# FinTrackr Project Guide

## 1. Project Overview

FinTrackr is a multi-organization financial tracking and approval management system for healthcare billing. It manages income transactions (OP, IP, LAB, Advance, Pharmacy), doctor/vendor payables, receivables (patient credits, insurance claims), and Excel-based billing import with validation.

**Default Login**: username `siva` / password `s`

---

## 2. Tech Stack

### Backend

| Technology  | Details                                |
| ----------- | -------------------------------------- |
| Runtime     | Node.js (v22)                          |
| Framework   | Express 4.18                           |
| ORM         | Prisma 5.22 (Prisma Client JS)         |
| Database    | PostgreSQL                             |
| Auth        | JWT (jsonwebtoken 9.x) + bcryptjs      |
| Validation  | express-validator 7.x                  |
| File Upload | multer 2.x (memoryStorage, 10MB limit) |
| Excel       | read-excel-file 9.x                    |
| Security    | helmet 7.x, cors 2.x                   |

### Frontend

| Technology | Details                      |
| ---------- | ---------------------------- |
| Framework  | Next.js 15.5.22 (App Router) |
| UI Library | React 18.2 + TypeScript 5.x  |
| Styling    | Tailwind CSS 4.x             |
| State      | Zustand 5.x                  |
| HTTP       | Axios 1.18                   |
| Icons      | lucide-react 1.25            |
| Toast      | react-hot-toast 2.6          |

---

## 3. Directory Structure

```
FinTrackr/
├── AGENTS.md
├── README.md
├── setup.sh
├── backend/
│   ├── package.json
│   ├── .env / .env.example
│   ├── prisma/
│   │   ├── schema.prisma              # All models & enums (486 lines)
│   │   ├── cleanup.sql
│   │   └── *.xlsx                     # Seed reference data
│   └── src/
│       ├── server.js                  # Entry point (port 5010)
│       ├── app.js                     # Express app + route mounting
│       ├── controllers/               # 12 controllers
│       ├── routes/                    # 12 route files
│       ├── middleware/
│       │   └── auth.js                # JWT auth, role checks, org verify + Prisma instance
│       └── utils/
│           ├── helpers.js             # hashPassword, comparePassword, generateToken
│           ├── excel.js               # readFirstSheetRowsFromBuffer, rowsToObjects
│           └── seed.js                # DB seeder (admin, roles, configs, partners, doctors)
├── frontend/
│   ├── package.json
│   ├── .env                           # NEXT_PUBLIC_API_URL
│   ├── next.config.ts
│   ├── tsconfig.json                  # @/* → ./src/*
│   └── src/
│       ├── app/                       # App Router pages
│       │   ├── login/
│       │   ├── dashboard/
│       │   ├── users/
│       │   ├── organizations/
│       │   ├── roles/                 # Role assignment
│       │   ├── role-master/           # Role definitions
│       │   ├── doctors/
│       │   ├── patients/
│       │   ├── business-partners/
│       │   ├── configs/               # ConfigMaster CRUD
│       │   ├── requests/
│       │   ├── approvals/
│       │   └── income/
│       │       ├── op/                # Out Patient
│       │       ├── ip/                # In Patient (+ review/[id])
│       │       ├── lab/               # Laboratory
│       │       ├── advance/
│       │       └── pharma/
│       ├── components/
│       │   ├── layout/
│       │   │   ├── DashboardLayout.tsx
│       │   │   ├── Sidebar.tsx
│       │   │   └── Navbar.tsx
│       │   └── ui/
│       │       ├── Button.tsx         # primary/secondary/danger/success
│       │       ├── Modal.tsx          # Overlay modal (escape key, backdrop)
│       │       ├── Input.tsx          # Styled input with label & error
│       │       ├── Select.tsx         # Styled select with label & error
│       │       ├── Badge.tsx          # success/warning/danger/info/pending
│       │       └── Pagination.tsx
│       ├── lib/
│       │   ├── api.ts                 # Axios instance (token/orgId interceptors)
│       │   └── types.ts               # TS interfaces
│       └── stores/
│           └── authStore.ts           # Zustand (login, logout, fetchMe, setOrg)
```

---

## 4. Backend Conventions

### 4.1 Prisma Import

```js
const { prisma } = require("../middleware/auth"); // shared PrismaClient instance
```

### 4.2 Controller Pattern

```js
const handlerName = async (req, res) => {
  try {
    // ... logic using prisma
    res.json({ ... });
  } catch (error) {
    console.error("HandlerName error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
```

### 4.3 Route Pattern

- File creates `express.Router()`, imports controllers, applies `authenticate` middleware, exports router
- Mounted in `app.js` as `app.use("/api/prefix", routes)`

### 4.4 Auth Middleware (`backend/src/middleware/auth.js`)

- `authenticate` — verifies JWT from `Authorization: Bearer <token>`, populates `req.user`
- `requireCompanyRole(...roles)` — company-level role guard
- `requireOrg` — requires `x-org-id` header, verifies membership, sets `req.orgId`
- `requireOrgRole(...roles)` — org-level role guard
- Exports `prisma` (shared instance used by all controllers)

### 4.5 Error Handling

Per-handler:

```js
try { ... } catch (error) {
  console.error("HandlerName error:", error);
  res.status(500).json({ message: "Internal server error" });
}
```

Global handler in `app.js`:

```js
app.use((err, _req, res, _next) => {
  res.status(err.status || 500).json({ message: err.message || "Internal Server Error" });
});
```

Validation errors (express-validator):

```js
const errors = validationResult(req);
if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
```

### 4.6 API Response Formats

**Success**: `{ ...data, pagination?: { total, page, limit, pages } }`
**Error**: `{ message: "..." }`
**Validation**: `{ errors: [{ msg, param }] }`
**Import**: `{ message, total, inserted, updated, skipped, failed, errors[] }`

---

## 5. Frontend Conventions

### 5.1 Page Pattern

```tsx
"use client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useState, useEffect } from "react";
import api from "@/lib/api";
import Button from "@/components/ui/Button";
import toast from "react-hot-toast";

export default function Page() {
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    fetchData();
  }, []);
  return <DashboardLayout>{/* content */}</DashboardLayout>;
}
```

### 5.2 API Client (`src/lib/api.ts`)

- Axios instance with `baseURL: process.env.NEXT_PUBLIC_API_URL`
- Request interceptor: adds `Authorization` and `x-org-id` from localStorage
- Response interceptor: on 401, clears token → redirects `/login`

### 5.3 Auth Store (`src/stores/authStore.ts`)

- Zustand 5.x store: `user`, `token`, `userLevel`, `orgId`, `orgRole`, `orgMemberships`, `companyRoles`
- `hydrateFromStorage()` — reads token/orgId from localStorage
- `fetchMe()` — calls `/auth/me`, populates user + org memberships

### 5.4 UI Components

| Component  | Key Props                                                   |
| ---------- | ----------------------------------------------------------- |
| Button     | variant (primary/secondary/danger/success), isLoading, size |
| Modal      | isOpen, onClose, title, maxWidth                            |
| Input      | label, error + HTMLInput props                              |
| Select     | label, error, options + HTMLSelect props                    |
| Badge      | variant (success/warning/danger/info/pending)               |
| Pagination | page, totalPages, total, limit, onPageChange                |

### 5.5 CSS Conventions

- Tailwind CSS 4 via `@import "tailwindcss"`
- Card: `bg-white rounded-2xl border border-slate-200/60 p-6`
- Input: `w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500`
- Table header: `text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider`
- Bulk actions: `bg-indigo-50 p-4 rounded-xl`

---

## 6. Payable Polymorphic Pattern

`Payable` supports multiple party types via `partyType` + conditional FK:

| `partyType` | FK field | References      | Prisma Relation                                                      |
| ----------- | -------- | --------------- | -------------------------------------------------------------------- |
| `DOCTOR`    | `drId`   | `Doctor.id`     | `doctor Doctor? @relation(fields: [drId], references: [id])`         |
| `VENDOR`    | `bpId`   | `BizPartner.id` | `bizPartner BizPartner? @relation(fields: [bpId], references: [id])` |

Rules:

- `partyType` is always set explicitly — never infer from which FK is non-null.
- Only one FK is non-null per row; the other must be `null`.
- The frontend `PayableItem` type has both `doctorId`/`doctorName` and `bizPartnerId`/`bizPartnerName`; read/write the correct pair based on `partyType`.

### Frontend PayableItem Interface

```ts
interface PayableItem {
  payableId?: number;
  description: string;
  billedAmt: number;
  payableAmt: string;
  partyType: string; // "DOCTOR" | "VENDOR" | ""
  doctorId: string;
  doctorName: string;
  bizPartnerId: string;
  bizPartnerName: string;
  isOptional: boolean;
  isSelected: boolean;
}
```

### Submit Payload (POST /income/\*/txns/:id/review)

```ts
payables: [
  {
    partyType: "DOCTOR" | "VENDOR",
    doctorId: partyType === "DOCTOR" ? number : null,
    bizPartnerId: partyType === "VENDOR" ? number : null,
    description: string,
    billedAmt: number,
    payableAmt: number,
    name: string | null,
    isOptional: boolean,
  },
];
```

### Controller Payable Creation Logic

For DOCTOR: `partyType: "DOCTOR"`, `doctor: { connect: { id: doctorId } }` → Prisma auto-sets `drId`
For VENDOR: `partyType: "VENDOR"`, `bizPartner: { connect: { id: bpId } }` → Prisma auto-sets `bpId`

---

## 7. ConfigMaster IP_FILTER

`ConfigCategory.IP_FILTER` maps charge descriptions to allowed party types:

- `value = "DOCTOR"` → DOCTOR only, autosuggest shows doctors
- `value = "VENDOR"` → VENDOR only, autosuggest shows vendors
- `value = "DOCTOR, VENDOR"` → both, optional item, combined suggestions

### Matching Logic

```ts
const matchIpFilter = (description: string, configs) => {
  const upper = (description || "").toUpperCase().trim();
  for (const cfg of configs) {
    if (upper.startsWith(cfg.code) || upper.includes(cfg.code)) return cfg;
  }
  return null;
};
```

### Doctor Name Parsing from Description

```ts
const getDoctorFromDescription = (description: string, sourceDoctors) => {
  const match = description.trim().match(/^dr[.\s:-]*(.+)$/i);
  // extracts name, matches against doctors list
};
```

### Priority (Default Visible) Descriptions

```ts
const isPriorityPayableDescription = (description: string) => {
  if (/^dr[.\s:-]/i.test(description)) return true;
  return !!matchIpFilter(description);
};
```

---

## 8. Key Business Rules

### Import Rules

- **OP billing**: Bill No must start with `OPB`
- **IP billing**: Bill No must start with `IPB`
- **Header detection**: Auto-detects header row (looks for "Bill No" + "Patient Name")
- **Patient matching**: By UHID first, then by name; auto-creates with `FT_XXXX` UHID if not found
- **Terms validation**: CASH requires cash_amount > 0; CREDIT requires credit_amount > 0 + credit_status != "Received"
- **Detail totals** must not exceed bill net amount (else marks ERROR)

### Transaction Review

- Patient required before creating receivables
- Non-credit/non-insurance → `RcvdPymt`
- Insurance/Credit → `Receivable` record (arType INSURANCE or PATIENT)
- Insurance requires `insurancePartnerId` (BizPartner with bpType=INSURANCE)
- Deletes all existing `rcvd_pymts`, `receivables`, `payables` before recreating
- Payment status: FULLYPAID if total >= net, PARTIALPAID if > 0, else UNPAID
- Sets `txn_status = "VERIFIED"`

### Payment Mode Codes

| Code                                   | Behavior                                       |
| -------------------------------------- | ---------------------------------------------- |
| CASH, UPI, BANK, CARD, CHEQUE, COMPANY | Standard received payment                      |
| CREDIT                                 | Creates Receivable (arType=PATIENT)            |
| INSURANCE                              | Creates Receivable, requires insurance partner |

### Income Status Progression

Import → UNVERIFIED → Review → VERIFIED
Error detection → ERROR → Correction → VERIFIED

### Org-Level Features

- Org-scoped operations require `x-org-id` header
- COMPANY-level users bypass org role checks
- Approval page restricted to `LEADER` org role

---

## 9. Database Conventions

### Table Naming (via `@@map`)

| Model        | DB Table      |
| ------------ | ------------- |
| ImportLog    | import_log    |
| IncomeTxn    | income_txn    |
| RcvdPymt     | rcvd_pymts    |
| Payable      | payable       |
| PayablePymt  | payable_pymts |
| BizPartner   | biz_partner   |
| Receivable   | receivables   |
| ConfigMaster | config_master |
| IncomeSource | income_src    |
| PaymentMode  | payment_mode  |

### Column Naming

- camelCase in Prisma → snake_case in DB via `@map`
- Monetary amounts: `@db.Decimal(12, 2)`
- Timestamps: `createdAt`, `updatedAt` with `@default(now())` / `@updatedAt`

### Enum Tables (mapped)

```
PartyType     → party_type_enum
ConfigCategory→ config_category_enum
```

---

## 10. Naming Conventions

### Backend (JS)

- Files: `camelCase.js` (incomeController.js, incomeIp.js)
- Functions: `camelCase` (getIncomeTxns, importOPBilling)
- Constants: `UPPER_SNAKE` (EXPECTED_HEADERS, DUMMY_VALUES)
- Exports: `module.exports = { ... }`

### Frontend (TS/TSX)

- Files: `camelCase.ts`, `PascalCase.tsx` (api.ts, Button.tsx)
- Components: `PascalCase`
- Functions: `camelCase`
- Interfaces: `PascalCase` (PayableItem, IncomeTxn)
- Props interfaces: `PascalCase + Props` suffix

### API Routes

- Prefix: `/api/`
- Resources: single word or kebab-case (`/biz-partners`)
- Nested: `/income/ip/txns/:id/review`
- Actions: `/txns/bulk-verify`, `/txns/:id/error`

---

## 11. Schema Change Convention

**No fallback/legacy compatibility code**
Do not write runtime guards that check which fields exist.
When proposing a schema change, the agent **must** advise whether the user needs to recreate the database.
**Never run `npx prisma db push` at all — always ask the user for permission first.**

---

## 12. Build & Development Notes

- When running `npm run build` to verify changes, do **not** delete the `.next` folder unless the build fails with a stale cache error. Use `npm run build` directly — Next.js handles incremental builds efficiently.
- **Do not run `npm run build` for every frontend change.** Only run it when the change is non-trivial (new pages/routes, dependency changes, type-structure changes) or when the user explicitly asks. For routine component/UI edits, skip the full build to save time.

## 13. Component Reuse

- Always prefer using existing shared components in `frontend/src/components/ui/` over creating inline implementations.
- The `Pagination` component is the single source of truth for all pagination needs — use it everywhere instead of duplicating pagination HTML/logic.
- Before creating new UI patterns, check if a component already exists in the shared components directory.

## 14. Temp Files & Project Scope

- **Never create or use files/folders outside the project folder** (e.g., `/tmp`, system temp dirs). If temporary files are needed, create them inside the project as `.tmp/` (e.g., `.tmp/doctors.csv`) and remove them when done.
- All work — reads, writes, scripts, and artifacts — must stay within the project directory.
