# Income Imports — Technical Specification

Covers the Excel import processes for **IP Billing**, **IP Details**, **IP Admission**, **OP Billing**, **OP Details**, **Lab**, **Pharma**, and **Advance & Credit Collection**. All imports share the same audit pattern: an `ImportLog` is created up-front, per-row failures are recorded as `ImportError`, and final counters are written at the end. Files are uploaded via `multipart/form-data` (`file` field, 10 MB limit, `multer` memory storage).

## Common patterns

- **Header detection**: scan the first 10 rows for required column keywords.
- **Column validation**: all expected headers must exist, else the whole import aborts (400).
- **Row filtering** (`isSkippableRow`): skip empty rows, blank `S.No`, and rows containing `total` / `page total`.
- **Upsert by Bill No**: if the `IncomeTxn` exists, update it and **delete + recreate** its `rcvd_pymts` and `receivables`; otherwise create (counters `updated` / `inserted`).
- **Payment status logic** (shared by OP/IP/Lab):
  - `paid = cash + bank`
  - `unpaid = credit` (IP also includes `company + insurance` in unpaid)
  - `net = billAmt`
  - `unpaid > 0 && paid === 0 && unpaid === net` → `UNPAID`
  - `paid > 0 && paid === net` → `FULLYPAID`
  - `paid > 0 && unpaid > 0 && paid + unpaid === net` → `PARTIALPAID`
  - else → `UNPAID` + `txn_status = ERROR` (`"Payment mismatch"`)
  - `bank > 0` → `txn_status = REVIEW_REQ`, otherwise `UNVERIFIED`
- **Response**: `{ message, importLogId, total, inserted, updated, skipped, failed, errors[] }`

---

## 1. IP Billing — `POST /api/income/ip/import`

**Columns**: `S.No, Date, Bill No, IP No, Patient Name, Terms, Total Amount, Discount, Bill Amount, Less Advance, Net Amount, cash_amount, bank_amount, credit_amount, company_amount, insurance_amount`

- Header detect: `bill no` + `patient name`. Valid file: first Bill No starts with **`IPB`**.
- **IP admission**: `IP No` must resolve to an `IPAdm` (else row fails `"IPAdm not found"`). Linked admission is marked `DISCHARGED` with `dischargeDt = billDate`. `incomeTxn.patientId = ipAdm.patId`.
- **Amounts**: `gross = Total Amount`, `discount`, `advAdjt = Less Advance`, `billAmt = Net Amount`. `paid = cash_amount + bank_amount`; `unpaid = company_amount + insurance_amount + credit_amount`.
- **Amount validation**: `amt = cash_amount + bank_amount + credit_amount + company_amount + insurance_amount`. If `Net Amount ≠ amt` (tolerance 0.01) → row **fails** (`"Amount mismatch expect (Net Amount) X; found Y"`) and is skipped.
- **Payments**: creates `rcvd_pymt` CASH (cash_amount) and BANK (bank_amount) when > 0.
- **Receivables** (only when patient linked, due date = +1 month):
  - `company_amount` → `CORPORATE` receivable (bp = "UNKNOWN"), `dueAmt = balanceAmt = company_amount`
  - `insurance_amount` → `INSURANCE` receivable (bp = "UNKNOWN"), `dueAmt = balanceAmt = insurance_amount`
  - `credit_amount` → `PATIENT` receivable, `dueAmt = balanceAmt = credit_amount`
- **Advance realisation**: when `Less Advance > 0`, finds UNREALISED ADV txns for the same `ipId`; if their sum matches, marks them `REALISED` (linked via `realisedTxnId`), else flags the txn `ERROR` (`"Advance mismatch"`). Re-imports are idempotent for already-realised advances.

---

## 2. IP Details — `POST /api/income/ip/import-detail`

**Columns**: `S.No, Bill Date, Bill No, UHID, Patient Name, Description, Amount, age, Sex, Consult Dr`

- Header detect: `bill no` + `description`. Valid file: first Bill No starts with **`IPB`**.
- `Amount <= 0` → row skipped.
- **Bill lookup**: `IncomeTxn` by Bill No. Missing bills are counted per bill and reported as a grouped error (`"Bill No X not found. N record(s) not imported."`).
- **Detail upsert**: `IncomeDtl` upserted by `(incomeTxnId, description, amount)`.
- No payables are created for IP details.

---

## 3. IP Admission — `POST /api/income/ip/import-adm`

**Columns**: `Entry No, IP Date, UHID No, Patient Name, Status`

- Header detect: `entry no` + `ip date`.
- `Entry No` (→ `ipNo`) and `IP Date` required, else row fails.
- **Patient**: must resolve by UHID (else row fails `"Patient not found for UHID …"`).
- **Status mapping**: `OPEN→ADMITTED`, `DISCHARGED→DISCHARGED`, `CANCEL`/`CANCELLED→CANCELLED`, `ADMITTED→ADMITTED`; default `ADMITTED`.
- **Upsert `IPAdm`** by `ipNo` (`Entry No`).

---

## 4. OP Billing — `POST /api/income/import`

**Columns**: `S.No, Date, Bill No, UHID No, Patient Name, Terms, Net Amount, Mobile No, Cash_Amt, Bank Amt, Credit Amt, Remarks, Credit status`

- Header detect: `bill no` + `patient name`. Valid file: first Bill No starts with **`OPB`**.
- **Patient**:
  - By `UHID No` — missing UHID → row fails.
  - Else by `Patient Name` — match existing, or **auto-create** with generated `FT_XXXX` UHID.
  - Neither → row fails `"Missing UHID No and Patient Name"`.
- **Amount validation**: `amt = Cash_Amt + Bank Amt + Credit Amt`. If `Net Amount ≠ amt` (tolerance 0.01) → row **fails** (`"Amount mismatch expect (Net Amount) X; found Y"`) and is skipped.
- **Payments**: `rcvd_pymt` CASH (Cash_Amt) and BANK (Bank Amt) when > 0.
- **Receivable**: `credit_amount > 0` → `PATIENT` receivable (due date +1 month), `dueAmt = balanceAmt = credit_amount`.
- Amounts: `gross = billAmt = Net Amount`.

---

## 5. OP Details — `POST /api/income/import-detail`

**Columns**: `S.No, Bill Date, Bill No, UHID, Patient Name, Description, Amount, age, Sex, Consult Dr`

- Header detect: `bill no` + `description`. Valid file: first Bill No starts with **`OPB`**.
- `Amount` required and non-zero, else row fails.
- **Bill lookup**: `IncomeTxn` by Bill No — missing → row fails.
- **Detail upsert**: `IncomeDtl` upserted by `(incomeTxnId, description)`.
- **Doctor payable**: when `Description` matches a doctor's `descName`, create/update a `DOCTOR` payable (`billedAmt = balanceAmt = amount`, `dueDate = billDate + 15 days`, `remarks = patient name + billNo`).
- **Amount discrepancy**: if the detail total per bill exceeds the bill's net amount, the txn is flagged `ERROR` (`"Amount discrepancy: Detail total … > Bill net amount …"`).

---

## 6. Lab — `POST /api/income/lab/import`

**Columns**: `S.No, Bill No, Date, UHID No, Patient Name, Dr.Name, Terms, Amount, Disc Amt, Net Amount, Refer Amount, Cash Amount, Bank Amount, Credit Amount, Credit Status, Lab Report No, Report Status`

- Header detect: `bill no` + `patient name`. Valid file: first Bill No starts with **`LB`** or **`LIP`**.
- **Patient**: same as OP — by UHID (fail if missing), else by name (find or auto-create `FT_XXXX`).
- **IP admission link**: pick latest ADMITTED `IPAdm` for the patient, else a DISCHARGED one whose date range covers the bill date. Bills prefixed **`LIP`** require an `IPAdm`, else txn → `ERROR` (`"IP Adm not found"`).
- **Amount validation**: `amt = Cash Amount + Bank Amount + Credit Amount`. If `Net Amount ≠ amt` (tolerance 0.01) → row **fails** (`"Amount mismatch expect (Net Amount) X; found Y"`) and is skipped.
- **Payments**: `rcvd_pymt` CASH and BANK when > 0.
- **Receivable**: `credit_amount > 0` → `PATIENT` receivable (due date +1 month), `dueAmt = balanceAmt = credit_amount`.
- Amounts: `gross = Amount`, `discount = Disc Amt`, `billAmt = Net Amount`.

---

## 7. Pharma — `POST /api/income/pharma/import`

**Columns**: `S.No, Entry Name, Entry Date, Entry No, Customer, Total Amt, Discount, Tax, Net Amount, Patient_name, Mobile No, Credit Status, Cash, Credit, Bank`

- Header detect: `entry no` + `net amount`.
- `Entry No` → `billNo` (required, unique key).
- **Amount validation**: `amt = Cash + Credit + Bank`. If `amt ≠ Net Amount` (tolerance 0.01) → row **fails** (`"Amount mismatch expected (Net Amt) X & found Y"`) and is skipped.
- **Patient lookup**: only when `Customer` starts with `GCCH` — UHID = text before `-`. Unknown UHID → row **fails** (`"Patient not found for UHID …"`). Otherwise no patient link.
- **paidBy** = `"SELF"` when patient linked, else Excel **Patient_name**.
- **IP admission link**: latest ADMITTED `IPAdm` for the patient, else a DISCHARGED one covering the bill date. `IPS`-prefixed bills require an admission (else `ERROR`).
- **Payment status**:
  - `Credit == Net Amount` → `UNPAID`
  - `Cash == Net` OR `Bank == Net` OR `Cash + Bank == Net` → `FULLYPAID`
  - otherwise → `PARTIALPAID`
  - `Bank > 0` → `txn_status = REVIEW_REQ`; else `UNVERIFIED`
- **Payments/credit** (only when `txn_status !== "ERROR"`):
  - `Credit > 0` + patient → `PATIENT` receivable with `dueAmt = balanceAmt = Credit`.
  - `Cash > 0` → `rcvd_pymt` CASH, amount = Cash.
  - `Bank > 0` → `rcvd_pymt` BANK, amount = Bank.
- Upsert by `Entry No`; on update, `rcvd_pymts` and `receivables` are deleted then recreated.

---

## 8. Advance & Credit Collection — `POST /api/income/advandcrcol/import`

**Columns**: `S.No, Vou.No, Date, Voucher Type, Bill Name, Bill No, Amount, payment_refno, cash_amount, card_amount, cheque_amount, neft_amount, UPI Amt`

- Header detect: `vou.no` + `bill no`.
- Row handling branches by **Voucher Type**:

### 8a. Advance Collection (existing flow)

- `Vou.No` → `billNo` of a new **ADV** `IncomeTxn` (source `ADV`).
- `Bill No` column holds the **IP No** → linked to `IPAdm` (required when present).
- `Amount` → `grossAmount` / `billAmt`; `pymt_status = UNREALISED`; `txn_status = VERIFIED`.
- Payments created per non-zero amount column: `cash_amount`→CASH, `card_amount`→CARD, `cheque_amount`→CHEQUE, `neft_amount`→BANK, `UPI Amt`→UPI.
- Upsert by `Vou.No`; on update, existing `rcvd_pymts` are deleted then recreated.

### 8b. Credit Collection (source = **LAB**)

### 8c. Receipt Pharmacy Bill (source = **PHARMA**)

These two voucher types settle **receivables** (they do not create new income txns):

1. `Bill No` → find the source `IncomeTxn` by `billNo` **and** income source (LAB / PHARMA). Not found → row **fails**.
2. Find the receivable(s) for that txn (uses the open one with `balanceAmt > 0`). None → row **fails**.
3. `paidDue` = sum of existing `rcvl_pymts` for the receivable.
4. `paidDue + Amount`:
   - `=== dueAmt` → receivable `balanceAmt = 0`, `status = PAID`
   - `< dueAmt` → `balanceAmt = dueAmt − (paidDue + Amount)`, `status = PARTIALLY_PAID`
   - `> dueAmt` → row **fails** (overpayment)
5. Create `rcvl_pymt`:
   - `rcvlId` = receivable id
   - `paymentModeId`: first non-zero of `cash_amount`→CASH, `card_amount`→CARD, `cheque_amount`→CHEQUE, `neft_amount`→BANK, `UPI Amt`→UPI (none → row fails)
   - `amount` = `Amount`, `paymentDate` = `Date`, `transactionNo` = **Vou.No**, `bankName` = null, `paidBy` = `SELF`, `remarks` = Bill No.

---

## Data model touched (all imports)

- `income_txn` — created/updated (source: IP / OP / LAB / PHARMACY / ADV)
- `rcvd_pymts` — created (recreated on update)
- `receivables` — created (recreated on update)
- `rcvl_pymts` — created (Adv/Cr credit-collection flow)
- `income_dtl` (IncomeDtl) — IP & OP details
- `iPAdm` — IP billing (discharge) & IP admission import
- `payable` — OP detail (doctor payables)
- `import_log`, `import_error` — audit
