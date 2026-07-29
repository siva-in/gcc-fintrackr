# Import Rules

This document explains the billing import rules for OP (OPD), IP (IPD), and Lab Excel imports in the FinTrackr system.

---

## 1. OP Billing Import (`/api/income/import`)

File type code: `OP`
Bill prefix: `OPB`
Source column: 13 columns

### Expected Headers

| # | Column |
|---|--------|
| 1 | S.No |
| 2 | Date |
| 3 | Bill No |
| 4 | UHID No |
| 5 | Patient Name |
| 6 | Terms |
| 7 | Net Amount |
| 8 | Mobile No |
| 9 | Cash_Amt |
| 10 | Bank Amt |
| 11 | Credit Amt |
| 12 | Remarks |
| 13 | Credit status |

### Header Detection

Scans first 10 rows — looks for a row containing **both** "Bill No" and "Patient Name" (case-insensitive `includes` check).

### Patient Matching

| Scenario | Behavior |
|---|---|
| UHID provided, found in DB | Uses existing patient |
| UHID provided, not found in DB | **FAILS** with error |
| No UHID, name provided, found in DB | Uses existing patient |
| No UHID, name provided, not found | **Auto-creates** with UHID `FT_NNNN` and mobile from row |
| Neither UHID nor name | **FAILS** with error |

### Terms Validation

**Removed.** The Terms column and Credit status columns are read but no longer used for validation.

### Financial Validation

Payments must be arithmetically consistent:

```
paidAmt = cashAmt + bankAmt
unpaid  = creditAmt
```

| Condition | pymt_status | txn_status |
|---|---|---|
| `unpaid > 0` AND `paidAmt == 0` AND `unpaid == net` | UNPAID | UNVERIFIED or REVIEW_REQ |
| `paidAmt > 0` AND `paidAmt == net` | FULLYPAID | UNVERIFIED or REVIEW_REQ |
| `paidAmt > 0` AND `unpaid > 0` AND `paidAmt + unpaid == net` | PARTIALPAID | UNVERIFIED or REVIEW_REQ |
| Any other combination | UNPAID | **ERROR** ("Payment mismatch") |

### REVIEW_REQ Status

```
txn_status_base = bankAmt > 0 ? "REVIEW_REQ" : "UNVERIFIED"
```

If Bank Amt > 0, the transaction goes to `REVIEW_REQ` status (needs manual review).

### Payment Rules

| Amount > 0 | Payment Mode | Record Type |
|---|---|---|
| Cash_Amt | CASH | rcvdPymt |
| Bank Amt | BANK | rcvdPymt |
| Credit Amt | — | **Receivable** (PATIENT, due date = bill date + 1 month) |

**Note:** Bank payments now use `"BANK"` mode code (previously `"UPI"`).

### Receivable Creation

For `creditAmt > 0`, a `Receivable` record is created:
- `arType = "PATIENT"`
- `dueDate` = bill date + 1 month
- `status = "PENDING"`

### Bulk Verify

The bulk verify endpoint (`POST /api/income/txns/bulk-verify`) **rejects** transactions in `ERROR` or `REVIEW_REQ` status — only `UNVERIFIED` transactions can be bulk verified.

### Payables

**No payables created** during OP billing import. Payables are created during the OP Detail Report import.

### Duplicate Handling

If `billNo` already exists, the transaction is updated and existing payments and receivables are **deleted and recreated**.

---

## 2. OP Detail Report Import (`/api/income/import-detail`)

File type code: `OPD`
Bill prefix: `OPB`
Source column: 10 columns

### Expected Headers

| # | Column |
|---|--------|
| 1 | S.No |
| 2 | Bill Date |
| 3 | Bill No |
| 4 | UHID |
| 5 | Patient Name |
| 6 | Description |
| 7 | Amount |
| 8 | age |
| 9 | Sex |
| 10 | Consult Dr |

### Rules

- Each row's Bill No must have a corresponding `incomeTxn` already imported (via OP Billing import)
- Amount must be present and non-zero
- If the Description matches a **doctor's `descName`** → creates a **Payable** record:
  - `partyType = "DOCTOR"`
  - `dueDate` = bill date + 15 days
  - `balanceAmt` = detail amount
  - `status = "PENDING"`
- Existing matching payables are **updated** (not duplicated)
- After processing all rows, each bill's **detail total** is compared to `netAmount`:
  - If `detailTotal > netAmount + 0.01` → `txn_status = "ERROR"`, `errorReason = "Amount discrepancy: Detail total exceeds Bill net amount"`

---

## 3. IP Billing Import (`/api/income/ip/import`)

File type code: `IP`
Bill prefix: `IPB`
Source column: 16 columns

### Expected Headers

| # | Column |
|---|--------|
| 1 | S.No |
| 2 | Date |
| 3 | Bill No |
| 4 | IP No |
| 5 | Patient Name |
| 6 | Terms |
| 7 | Total Amount |
| 8 | Discount |
| 9 | Bill Amount |
| 10 | Less Advance |
| 11 | Net Amount |
| 12 | cash_amount |
| 13 | bank_amount |
| 14 | credit_amount |
| 15 | company_amount |
| 16 | insurance_amount |

### Header Detection

Scans first 10 rows — looks for a row containing **exact matches** for "bill no" and "patient name" (lowercased).

### Patient Matching

**IP billing does NOT link patients** during import. `patientId` is always `null`. Patients are linked later during IP Detail Report import.

### Terms Validation

**No terms validation.** The Terms column is read but never used.

### Financial Validation

Payments must be arithmetically consistent:

```
paidAmt = cashAmt + bankAmt + companyAmt + insuranceAmt
unpaid  = creditAmt
```

| Condition | pymt_status | txn_status |
|---|---|---|
| `unpaid > 0` AND `paidAmt == 0` AND `unpaid == net` | UNPAID | UNVERIFIED or REVIEW_REQ |
| `paidAmt > 0` AND `paidAmt == net` | FULLYPAID | UNVERIFIED or REVIEW_REQ |
| `paidAmt > 0` AND `unpaid > 0` AND `paidAmt + unpaid == net` | PARTIALPAID | UNVERIFIED or REVIEW_REQ |
| Any other combination | UNPAID | **ERROR** ("Payment mismatch") |

### REVIEW_REQ Status

```
txn_status_base = bankAmt > 0 ? "REVIEW_REQ" : "UNVERIFIED"
```

If bank_amount > 0, the transaction goes to `REVIEW_REQ` status (needs manual review).

### Payment Rules

| Amount > 0 | Payment Mode | Record Type |
|---|---|---|
| cash_amount | CASH | rcvdPymt |
| bank_amount | **BANK** | rcvdPymt |
| credit_amount | — | **Receivable** (PATIENT, due date = bill date + 1 month) — only created during review step since patient is linked later |
| company_amount | COMPANY | rcvdPymt |
| insurance_amount | INSURANCE | rcvdPymt |

**Note:** Bank payments now use `"BANK"` mode code (previously `"UPI"`).

### Status Notes

- `pymt_status` calculated from arithmetic table above
- `txn_status` can be `UNVERIFIED`, `REVIEW_REQ`, or `ERROR`
- **Receivables are NOT created during IP billing import** (patient is null) — credit receivables are created during the manual review step (`reviewIPTxn`)
- Each bill needs individual review — **no bulk verify** for IP

### IP Admission Tracking

If `IP No` column has a value, an `IPAdm` (admission) record is upserted and linked to the transaction via `IPDtl`.

### Duplicate Handling

Same as OP: existing billNo → update + delete & recreate payments.

---

## 4. IP Detail Report Import (`/api/income/ip/import-detail`)

File type code: `IPD`
Bill prefix: `IPB`
Source column: 10 columns

### Expected Headers

| # | Column |
|---|--------|
| 1 | S.No |
| 2 | Bill Date |
| 3 | Bill No |
| 4 | UHID |
| 5 | Patient Name |
| 6 | Description |
| 7 | Amount |
| 8 | age |
| 9 | Sex |
| 10 | Consult Dr |

### Rules

- Each row's Bill No must have a corresponding `incomeTxn`
- Amount ≤ 0 → row is **skipped** (not failed)

### Patient Linking

This is where IP patients are linked:

| Scenario | Behavior |
|---|---|
| UHID provided, found in DB | Links patient to transaction |
| UHID provided, not found | **Auto-creates** patient with given UHID and name (or "Unknown") |
| Patient previously null on txn | Updates `patientId` |
| Txn was `VERIFIED` before linking | Resets to `UNVERIFIED` |

### Payables

**No payables created** during IP detail import. Payables are only created during the manual review step (`reviewIPTxn`).

### Error Handling

If a Bill No is not found in the database, all rows for that bill are skipped (not individually failed) and a single grouped error is recorded.

---

## 5. Lab Billing Import (`/api/income/lab/import`)

File type code: `LAB`
Bill prefix: `LB`
Source column: 17 columns

### Expected Headers

| # | Column |
|---|--------|
| 1 | S.No |
| 2 | Bill No |
| 3 | Date |
| 4 | UHID No |
| 5 | Patient Name |
| 6 | Dr.Name |
| 7 | Terms |
| 8 | Amount |
| 9 | Disc Amt |
| 10 | Net Amount |
| 11 | Refer Amount |
| 12 | Cash Amount |
| 13 | Bank Amount |
| 14 | Credit Amount |
| 15 | Credit Status |
| 16 | Lab Report No |
| 17 | Report Status |

### Header Detection

Same as IP: first 10 rows, exact match for "bill no" and "patient name".

### Patient Matching

Same as OP:

| Scenario | Behavior |
|---|---|
| UHID provided, found in DB | Uses existing |
| UHID provided, not found | **FAILS** |
| No UHID, name provided, not found | **Auto-creates** with `FT_NNNN` (no mobile saved) |
| Neither | **FAILS** |

### Terms Validation

**None.** The Terms, Dr.Name, Refer Amount columns are read but never used for validation.

### Financial Validation

Payments must be arithmetically consistent:

```
paidAmt = cashAmt + bankAmt
unpaid  = creditAmt
```

| Condition | pymt_status | txn_status |
|---|---|---|
| `unpaid > 0` AND `paidAmt == 0` AND `unpaid == net` | UNPAID | UNVERIFIED or REVIEW_REQ |
| `paidAmt > 0` AND `paidAmt == net` | FULLYPAID | UNVERIFIED or REVIEW_REQ |
| `paidAmt > 0` AND `unpaid > 0` AND `paidAmt + unpaid == net` | PARTIALPAID | UNVERIFIED or REVIEW_REQ |
| Any other combination | UNPAID | **ERROR** ("Payment mismatch") |

### REVIEW_REQ Status

```
txn_status_base = bankAmt > 0 ? "REVIEW_REQ" : "UNVERIFIED"
```

If Bank Amount > 0, the transaction goes to `REVIEW_REQ` status (needs manual review).

### Payment Rules

| Amount > 0 | Payment Mode | Record Type |
|---|---|---|
| Cash Amount | CASH | rcvdPymt |
| Bank Amount | BANK | rcvdPymt |

### Receivable Creation

For `creditAmt > 0`, a `Receivable` record is created:
- `arType = "PATIENT"`
- `dueDate` = bill date + 1 month
- `status = "PENDING"`

### Payables

**None created** during Lab import. Payables are created during manual review (`updateLabPayments`).

### Duplicate Handling

Same pattern: existing billNo → update + delete & recreate payments and receivables.

---

## Summary

| Feature | OP (OPD) | OP Detail | IP (IPD) | IP Detail | Lab |
|---|---|---|---|---|---|---|
| **Bill prefix** | OPB | OPB | IPB | IPB | LB |
| **Required columns** | 13 | 10 | 16 | 10 | 17 |
| **Terms validation** | No | N/A | No | N/A | No |
| **Patient auto-create** | Name only | N/A | Never | UHID or name | Name only |
| **Payment modes** | CASH, BANK | N/A | CASH, BANK, COMPANY, INSURANCE | N/A | CASH, BANK |
| **Receivables created** | **Yes** (credit) | No | No (credit handled in review) | No | **Yes** (credit) |
| **Payables created** | No | **Yes** (doctor) | No | No | No |
| **Can get ERROR** | **Yes** | **Yes** | **Yes** | No | **Yes** |
| **REVIEW_REQ possible** | **Yes** | No | **Yes** | No | **Yes** |
| **IP Admission tracking** | No | No | **Yes** | **Yes** | No |
