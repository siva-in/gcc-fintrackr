const { prisma } = require("../middleware/auth");
const { Prisma } = require("@prisma/client");
const { readFirstSheetRowsFromBuffer } = require("../utils/excel");

const DUMMY_VALUES = ["--none--", "undefined", "null", "n/a", "na", "-"];

const LAB_BILLING_HEADERS = [
  "S.No", "Bill No", "Date", "UHID No", "Patient Name", "Dr.Name", "Terms",
  "Amount", "Disc Amt", "Net Amount", "Refer Amount", "Cash Amount", "Bank Amount",
  "Credit Amount", "Credit Status", "Lab Report No", "Report Status",
];

const parseDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) {
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, "0");
    const d = String(val.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof val === "number") {
    const totalDays = Math.floor(val);
    const date = new Date(Date.UTC(1899, 11, 30));
    date.setUTCDate(date.getUTCDate() + totalDays);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }
  const s = String(val).trim();
  const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    return `${year}-${String(parseInt(month)).padStart(2, "0")}-${String(parseInt(day)).padStart(2, "0")}`;
  }
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[0];
  return null;
};

const parseDecimal = (val) => {
  if (val == null) return null;
  const n = parseFloat(String(val).replace(/,/g, ""));
  return isNaN(n) ? null : n;
};

const cleanValue = (val) => {
  if (val == null) return null;
  const s = String(val).trim();
  if (s === "" || DUMMY_VALUES.includes(s.toLowerCase())) return null;
  return s;
};

const getRowValuesAsText = (row, headers, headerIdx) => {
  const parts = [];
  for (const h of headers) {
    const idx = headerIdx[h];
    const val = idx >= 0 ? row[idx] : "";
    parts.push(val != null ? String(val).trim() : "");
  }
  return parts.join(", ");
};

const toDateOnly = (dateStr) => (dateStr ? new Date(`${dateStr}T00:00:00.000Z`) : null);

const addDays = (dateStr, days) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const INCOME_TXN_FIELDS = new Set(Object.keys(Prisma.IncomeTxnScalarFieldEnum || {}));
const HAS_PYMT_STATUS = INCOME_TXN_FIELDS.has("pymt_status");
const HAS_LEGACY_STATUS = INCOME_TXN_FIELDS.has("status");
const HAS_TXN_STATUS = INCOME_TXN_FIELDS.has("txn_status");

const withIncomeTxnStatusData = (data, pymtStatus, txnStatus) => {
  const next = { ...data };
  if (pymtStatus != null) {
    if (HAS_PYMT_STATUS) next.pymt_status = pymtStatus;
    if (HAS_LEGACY_STATUS) next.status = pymtStatus;
  }
  if (txnStatus != null && HAS_TXN_STATUS) next.txn_status = txnStatus;
  return next;
};

const findHeaderRow = (rows, requiredHeaders) => {
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i];
    if (!row) continue;
    const lower = row.map((c) => String(c || "").trim().toLowerCase());
    const hasAll = requiredHeaders.every((h) => lower.some((c) => c === h.toLowerCase()));
    if (hasAll) return i;
  }
  return -1;
};

const buildHeaderIndex = (headerRow, expectedHeaders) => {
  const idx = {};
  const lower = headerRow.map((c) => String(c || "").trim().toLowerCase());
  for (const h of expectedHeaders) {
    idx[h] = lower.indexOf(h.toLowerCase());
  }
  return idx;
};

const isSkippableRow = (row, snoIdx) => {
  if (!row || row.every((c) => c == null || String(c).trim() === "")) return true;
  if (snoIdx >= 0 && (!row[snoIdx] || String(row[snoIdx]).trim() === "")) return true;
  const text = row.map((c) => String(c || "").trim().toLowerCase()).join(" ");
  if (text.includes("total") || text.includes("page total") || text.includes("final total")) return true;
  return false;
};

const getFirstDataBillNo = (rows, billNoIdx, snoIdx) => {
  for (const row of rows) {
    if (isSkippableRow(row, snoIdx)) continue;
    return cleanValue(row[billNoIdx]);
  }
  return null;
};

const startsWithPrefix = (value, prefix) => String(value || "").trim().toUpperCase().startsWith(prefix);

// Normalizes a doctor name string to uppercase alphanumerics only, for tolerant matching
// between the free-text "Dr.Name" column in Lab bills and the Doctor master name/degree fields.
const normalizeName = (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const matchDoctor = (drNameRaw, doctors) => {
  const drName = normalizeName(drNameRaw);
  if (!drName || drName === "SELF") return null;

  for (const doc of doctors) {
    const docNorm = normalizeName(doc.name);
    const docCore = docNorm.replace(/^DR/, "");
    if (docCore && (drName.includes(docNorm) || drName.includes(docCore))) {
      return doc.id;
    }
  }
  return null;
};

const importLabBilling = async (req, res) => {
  let importLog = null;
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const rows = await readFirstSheetRowsFromBuffer(req.file.buffer, { defval: "" });

    const headerRowIndex = findHeaderRow(rows, ["bill no", "patient name"]);
    if (headerRowIndex < 0) return res.status(400).json({ message: "Could not find header row with Bill No and Patient Name" });

    const headerRow = rows[headerRowIndex];
    const headerIdx = buildHeaderIndex(headerRow, LAB_BILLING_HEADERS);

    const missing = LAB_BILLING_HEADERS.filter((h) => headerIdx[h] < 0);
    if (missing.length > 0) return res.status(400).json({ message: `Missing columns: ${missing.join(", ")}` });

    const labSource = await prisma.incomeSource.findFirst({ where: { code: "LAB" } });
    if (!labSource) return res.status(500).json({ message: "LAB income source not found" });

    const allPaymentModes = await prisma.paymentMode.findMany();
    const modeMap = {};
    allPaymentModes.forEach((pm) => { modeMap[pm.code] = pm.id; });

    const allDoctors = await prisma.doctor.findMany({ where: { isActive: true }, select: { id: true, name: true } });

    importLog = await prisma.importLog.create({
      data: { fileName: req.file.originalname, fileType: "LAB", totalRecords: 0, inserted: 0, updated: 0, skipped: 0, failed: 0, createdBy: req.user?.id || null },
    });

    const errors = [];
    let inserted = 0, updated = 0, skipped = 0, failed = 0, totalRecords = 0;

    const dataRows = rows.slice(headerRowIndex + 1);
    const firstBillNo = getFirstDataBillNo(dataRows, headerIdx["Bill No"], headerIdx["S.No"]);
    if (!startsWithPrefix(firstBillNo, "LB")) {
      return res.status(400).json({ message: "File is not valid Lab billing file" });
    }

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      if (isSkippableRow(row, headerIdx["S.No"])) continue;
      totalRecords++;

      const rowNum = headerRowIndex + 2 + i;
      const rowData = getRowValuesAsText(row, LAB_BILLING_HEADERS, headerIdx);

      const billNo = cleanValue(row[headerIdx["Bill No"]]);
      if (!billNo) {
        failed++;
        errors.push({ rowNumber: rowNum, rowData, reason: "Missing Bill No" });
        continue;
      }

      try {
        const uhid = cleanValue(row[headerIdx["UHID No"]]);
        const name = cleanValue(row[headerIdx["Patient Name"]]);
        const drName = cleanValue(row[headerIdx["Dr.Name"]]);
        const billDate = parseDate(row[headerIdx["Date"]]);
        const amount = parseDecimal(row[headerIdx["Amount"]]) || 0;
        const discAmt = parseDecimal(row[headerIdx["Disc Amt"]]) || 0;
        const netAmount = parseDecimal(row[headerIdx["Net Amount"]]) || 0;
        const referAmt = parseDecimal(row[headerIdx["Refer Amount"]]) || 0;
        const cashAmt = parseDecimal(row[headerIdx["Cash Amount"]]) || 0;
        const bankAmt = parseDecimal(row[headerIdx["Bank Amount"]]) || 0;
        const creditAmt = parseDecimal(row[headerIdx["Credit Amount"]]) || 0;
        const creditStatus = cleanValue(row[headerIdx["Credit Status"]]);
        const isReceived = creditStatus && creditStatus.toLowerCase() === "received";

        let patientId = null;
        if (uhid) {
          const patient = await prisma.patient.findFirst({ where: { uhid } });
          if (patient) {
            patientId = patient.id;
          } else {
            failed++;
            errors.push({ rowNumber: rowNum, rowData, reason: `UHID ${uhid} not found in database` });
            continue;
          }
        } else if (name) {
          const existingPatient = await prisma.patient.findFirst({ where: { name } });
          if (existingPatient) {
            patientId = existingPatient.id;
          } else {
            const count = await prisma.patient.count();
            const newUhid = `FT_${String(count + 1).padStart(4, "0")}`;
            const newPatient = await prisma.patient.create({
              data: { regDate: new Date(), uhid: newUhid, name },
            });
            patientId = newPatient.id;
          }
        } else {
          failed++;
          errors.push({ rowNumber: rowNum, rowData, reason: "Missing UHID No and Patient Name" });
          continue;
        }

        const pymtStatus = isReceived ? "FULLYPAID" : "UNPAID";

        let txnStatus = "VERIFIED";
        if (bankAmt > 0 || creditAmt > 0) txnStatus = "UNVERIFIED";

        const existing = await prisma.incomeTxn.findFirst({ where: { billNo } });

        let incomeTxn;
        if (existing) {
          incomeTxn = await prisma.incomeTxn.update({
            where: { id: existing.id },
            data: withIncomeTxnStatusData({
              patientId,
              billDate: toDateOnly(billDate),
              grossAmount: amount,
              discountAmount: discAmt,
              netAmount,
              errorReason: null,
            }, pymtStatus, txnStatus),
          });
          await prisma.rcvdPymt.deleteMany({ where: { incomeTxnId: existing.id } });
          updated++;
        } else {
          incomeTxn = await prisma.incomeTxn.create({
            data: withIncomeTxnStatusData({
              incomeSourceId: labSource.id,
              patientId,
              billNo,
              billDate: toDateOnly(billDate),
              ipNo: null,
              grossAmount: amount,
              discountAmount: discAmt,
              advAdjt: 0,
              netAmount,
            }, pymtStatus, txnStatus),
          });
          inserted++;
        }

        const pymtsToCreate = [];
        if (cashAmt > 0) pymtsToCreate.push({ paymentModeId: modeMap["CASH"] || null, amount: cashAmt });
        if (bankAmt > 0) pymtsToCreate.push({ paymentModeId: modeMap["BANK"] || null, amount: bankAmt });
        if (creditAmt > 0) pymtsToCreate.push({ paymentModeId: modeMap["CREDIT"] || null, amount: creditAmt });

        for (const p of pymtsToCreate) {
          await prisma.rcvdPymt.create({
            data: {
              incomeTxnId: incomeTxn.id,
              paymentModeId: p.paymentModeId,
              amount: p.amount,
              paymentDate: toDateOnly(billDate),
              transactionNo: null,
              bankName: null,
              paidBy: "SELF",
              remarks: null,
            },
          });
        }

        // Referral doctor payable: matched by tolerant name matching against Doctor master.
        if (referAmt > 0 && drName) {
          const doctorId = matchDoctor(drName, allDoctors);
          if (doctorId) {
            const dueDate = billDate ? addDays(billDate, 15) : null;
            const existingPayable = await prisma.payable.findFirst({
              where: { incomeTxnId: incomeTxn.id, drId: doctorId, partyType: "DOCTOR" },
            });
            if (existingPayable) {
              await prisma.payable.update({
                where: { id: existingPayable.id },
                data: { billDate: toDateOnly(billDate) || new Date(), dueDate: toDateOnly(dueDate), billedAmt: referAmt, balanceAmt: referAmt },
              });
            } else {
              await prisma.payable.create({
                data: {
                  partyType: "DOCTOR",
                  doctor: { connect: { id: doctorId } },
                  incomeTxn: { connect: { id: incomeTxn.id } },
                  billDate: toDateOnly(billDate) || new Date(),
                  dueDate: toDateOnly(dueDate),
                  billedAmt: referAmt,
                  balanceAmt: referAmt,
                  status: "PENDING",
                  remarks: name || null,
                  createdBy: req.user?.username || null,
                },
              });
            }
          } else {
            skipped++;
          }
        }
      } catch (err) {
        failed++;
        errors.push({ rowNumber: rowNum, rowData, reason: err.message || "Processing error" });
      }
    }

    if (importLog) {
      await prisma.importLog.update({
        where: { id: importLog.id },
        data: { totalRecords, inserted, updated, skipped, failed, importEnded: new Date() },
      });
      if (errors.length > 0) {
        await prisma.importError.createMany({
          data: errors.map((e) => ({ importLogId: importLog.id, rowNumber: e.rowNumber, rowData: e.rowData, reason: e.reason })),
        });
      }
    }

    res.json({ message: "Lab Billing import complete", importLogId: importLog?.id, total: totalRecords, inserted, updated, skipped, failed, errors });
  } catch (error) {
    console.error("ImportLabBilling error:", error);
    if (importLog) await prisma.importLog.update({ where: { id: importLog.id }, data: { importEnded: new Date() } }).catch(() => {});
    res.status(500).json({ message: "Internal server error" });
  }
};

const getLabDashboard = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const labSource = await prisma.incomeSource.findFirst({ where: { code: "LAB" } });
    if (!labSource) return res.json({ cash: 0, bank: 0, credit: 0, total: 0, doctorFeeLiability: 0 });

    const where = { incomeSourceId: labSource.id };
    if (fromDate || toDate) {
      where.billDate = {};
      if (fromDate) where.billDate.gte = new Date(`${fromDate}T00:00:00.000Z`);
      if (toDate) where.billDate.lte = new Date(`${toDate}T23:59:59.999Z`);
    }

    const txns = await prisma.incomeTxn.findMany({ where, include: { rcvdPymts: { include: { paymentMode: true } } } });

    let cash = 0, bank = 0, credit = 0;
    for (const txn of txns) {
      for (const pmt of txn.rcvdPymts) {
        const code = pmt.paymentMode?.code;
        const amt = parseFloat(String(pmt.amount)) || 0;
        if (code === "CASH") cash += amt;
        else if (["BANK", "CARD", "UPI"].includes(code)) bank += amt;
        else if (code === "CREDIT") credit += amt;
      }
    }

    const payableWhere = { incomeTxn: { incomeSourceId: labSource.id }, status: "PENDING" };
    if (fromDate || toDate) {
      payableWhere.billDate = {};
      if (fromDate) payableWhere.billDate.gte = new Date(`${fromDate}T00:00:00.000Z`);
      if (toDate) payableWhere.billDate.lte = new Date(`${toDate}T23:59:59.999Z`);
    }
    const liability = await prisma.payable.aggregate({ where: payableWhere, _sum: { balanceAmt: true } });
    const doctorFeeLiability = parseFloat(String(liability._sum.balanceAmt)) || 0;

    res.json({ cash, bank, credit, total: cash + bank + credit, doctorFeeLiability });
  } catch (error) {
    console.error("GetLabDashboard error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getLabTxns = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "", fromDate, toDate, paymentMode, doctorId, pymtStatus, txnStatus, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const labSource = await prisma.incomeSource.findFirst({ where: { code: "LAB" } });
    if (!labSource) return res.json({ txns: [], pagination: { total: 0, page: 1, pages: 0 } });

    const andConditions = [{ incomeSourceId: labSource.id }];

    if (search) {
      andConditions.push({
        OR: [
          { billNo: { contains: search, mode: "insensitive" } },
          { patient: { name: { contains: search, mode: "insensitive" } } },
          { patient: { uhid: { contains: search, mode: "insensitive" } } },
        ],
      });
    }

    if (fromDate) andConditions.push({ billDate: { gte: new Date(fromDate) } });
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      andConditions.push({ billDate: { lte: to } });
    }

    if (paymentMode) {
      const modes = paymentMode.split(",").map((m) => m.trim().toUpperCase());
      andConditions.push({ rcvdPymts: { some: { paymentMode: { code: { in: modes } } } } });
    }

    if (doctorId) {
      andConditions.push({ payables: { some: { drId: parseInt(doctorId) } } });
    }

    const paymentStatuses = ["FULLYPAID", "PARTIALPAID", "UNPAID"];
    const transactionStatuses = ["VERIFIED", "UNVERIFIED", "ERROR"];
    const statusTokens = (status || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);

    if (pymtStatus) {
      const pymtStatuses = pymtStatus.split(",").map((s) => s.trim().toUpperCase());
      if (HAS_PYMT_STATUS) andConditions.push({ pymt_status: { in: pymtStatuses } });
      else if (HAS_LEGACY_STATUS) andConditions.push({ status: { in: pymtStatuses } });
    }
    if (txnStatus) {
      const txnStatuses = txnStatus.split(",").map((s) => s.trim().toUpperCase());
      if (HAS_TXN_STATUS) andConditions.push({ txn_status: { in: txnStatuses } });
    }
    if (statusTokens.length > 0) {
      const legacyPymtStatuses = statusTokens.filter((s) => paymentStatuses.includes(s));
      const legacyTxnStatuses = statusTokens.filter((s) => transactionStatuses.includes(s));
      if (legacyPymtStatuses.length > 0) {
        if (HAS_PYMT_STATUS) andConditions.push({ pymt_status: { in: legacyPymtStatuses } });
        else if (HAS_LEGACY_STATUS) andConditions.push({ status: { in: legacyPymtStatuses } });
      }
      if (legacyTxnStatuses.length > 0 && HAS_TXN_STATUS) andConditions.push({ txn_status: { in: legacyTxnStatuses } });
    }

    const where = { AND: andConditions };

    const [txns, total] = await Promise.all([
      prisma.incomeTxn.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: [{ billDate: "desc" }, { id: "desc" }],
        include: {
          patient: { select: { id: true, name: true, uhid: true, mobileNo: true } },
          incomeSource: { select: { code: true, name: true } },
          rcvdPymts: { include: { paymentMode: true } },
          payables: { select: { id: true, billedAmt: true, balanceAmt: true, status: true, remarks: true, doctor: { select: { name: true } } } },
        },
      }),
      prisma.incomeTxn.count({ where }),
    ]);

    res.json({ txns, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (error) {
    console.error("GetLabTxns error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getLabTxnDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const txn = await prisma.incomeTxn.findUnique({
      where: { id: parseInt(id) },
      include: {
        patient: true,
        incomeSource: true,
        rcvdPymts: { include: { paymentMode: true } },
        payables: { include: { doctor: true } },
      },
    });
    if (!txn) return res.status(404).json({ message: "Transaction not found" });
    res.json(txn);
  } catch (error) {
    console.error("GetLabTxnDetail error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const updateLabTxnError = async (req, res) => {
  try {
    const { id } = req.params;
    const { pymt_status, txn_status, errorReason, grossAmount, discountAmount, advAdjt, netAmount } = req.body;

    const txn = await prisma.incomeTxn.findUnique({ where: { id: parseInt(id) } });
    if (!txn) return res.status(404).json({ message: "Transaction not found" });
    if ((HAS_TXN_STATUS ? txn.txn_status : txn.status) !== "ERROR") return res.status(400).json({ message: "Only ERROR records can be updated" });

    const data = {};
    if (pymt_status && ["FULLYPAID", "PARTIALPAID", "UNPAID"].includes(pymt_status)) {
      if (HAS_PYMT_STATUS) data.pymt_status = pymt_status;
      if (HAS_LEGACY_STATUS) data.status = pymt_status;
    }
    if (txn_status && ["VERIFIED", "UNVERIFIED", "ERROR"].includes(txn_status) && HAS_TXN_STATUS) data.txn_status = txn_status;
    if (errorReason !== undefined) data.errorReason = errorReason || null;
    if (grossAmount !== undefined) data.grossAmount = parseFloat(grossAmount) || 0;
    if (discountAmount !== undefined) data.discountAmount = parseFloat(discountAmount) || 0;
    if (advAdjt !== undefined) data.advAdjt = parseFloat(advAdjt) || 0;
    if (netAmount !== undefined) data.netAmount = parseFloat(netAmount) || 0;

    const updated = await prisma.incomeTxn.update({ where: { id: parseInt(id) }, data });
    res.json(updated);
  } catch (error) {
    console.error("UpdateLabTxnError error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getLabDoctorSummary = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const labSource = await prisma.incomeSource.findFirst({ where: { code: "LAB" } });
    if (!labSource) return res.json({ summary: [], grandTotal: 0 });

    const where = { status: "PENDING", incomeTxn: { incomeSourceId: labSource.id } };
    if (fromDate || toDate) {
      where.billDate = {};
      if (fromDate) where.billDate.gte = new Date(`${fromDate}T00:00:00.000Z`);
      if (toDate) where.billDate.lte = new Date(`${toDate}T23:59:59.999Z`);
    }

    const payables = await prisma.payable.findMany({
      where,
      select: { drId: true, balanceAmt: true, incomeTxn: { select: { patient: { select: { name: true } } } } },
    });

    const doctorTotals = {};
    for (const p of payables) {
      if (!p.drId) continue;
      if (!doctorTotals[p.drId]) doctorTotals[p.drId] = { count: 0, total: 0, patients: [] };
      doctorTotals[p.drId].count++;
      doctorTotals[p.drId].total += parseFloat(String(p.balanceAmt)) || 0;
      const name = p.incomeTxn?.patient?.name;
      if (name && !doctorTotals[p.drId].patients.includes(name)) doctorTotals[p.drId].patients.push(name);
    }

    const doctorIds = Object.keys(doctorTotals).map(Number);
    const doctors = doctorIds.length > 0 ? await prisma.doctor.findMany({ where: { id: { in: doctorIds } }, select: { id: true, name: true, descName: true } }) : [];
    const doctorMap = {};
    doctors.forEach((d) => { doctorMap[d.id] = d; });

    const summary = doctorIds.map((id) => ({
      doctor: doctorMap[id] || { id, name: "Unknown", descName: "Unknown" },
      pendingCount: doctorTotals[id].count,
      pendingAmount: doctorTotals[id].total,
      patients: doctorTotals[id].patients,
    })).sort((a, b) => b.pendingAmount - a.pendingAmount);

    const grandTotal = summary.reduce((sum, s) => sum + s.pendingAmount, 0);

    res.json({ summary, grandTotal });
  } catch (error) {
    console.error("GetLabDoctorSummary error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getLabDoctorPayables = async (req, res) => {
  try {
    const { doctorId } = req.query;
    if (!doctorId) return res.status(400).json({ message: "doctorId is required" });

    const labSource = await prisma.incomeSource.findFirst({ where: { code: "LAB" } });

    const payables = await prisma.payable.findMany({
      where: { drId: parseInt(doctorId), status: { in: ["PENDING", "PARTIALLY_PAID"] }, incomeTxn: { incomeSourceId: labSource?.id } },
      orderBy: { billDate: "desc" },
      include: {
        incomeTxn: { select: { id: true, billNo: true, patient: { select: { id: true, name: true, uhid: true } } } },
        pymts: { include: { paymentMode: true } },
      },
    });

    const doctor = await prisma.doctor.findUnique({ where: { id: parseInt(doctorId) }, select: { id: true, name: true, descName: true } });

    const enriched = payables.map((p) => {
      const paidTotal = p.pymts.reduce((sum, py) => sum + (parseFloat(String(py.amount)) || 0), 0);
      return { ...p, paidTotal, doctor };
    });

    const grandTotal = enriched.reduce((sum, p) => sum + (parseFloat(String(p.balanceAmt)) || 0), 0);

    res.json({ payables: enriched, grandTotal });
  } catch (error) {
    console.error("GetLabDoctorPayables error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const recordLabPayablePayment = async (req, res) => {
  try {
    const { payableId, amount, paymentModeId, paymentDate, transactionNo, bankName, paidBy, remarks } = req.body;

    if (!payableId || !amount) return res.status(400).json({ message: "payableId and amount are required" });

    const payable = await prisma.payable.findUnique({ where: { id: parseInt(payableId) } });
    if (!payable) return res.status(404).json({ message: "Payable not found" });

    const payAmt = parseFloat(String(amount));
    if (payAmt <= 0) return res.status(400).json({ message: "Amount must be greater than zero" });

    const balance = parseFloat(String(payable.balanceAmt));
    if (payAmt > balance) return res.status(400).json({ message: `Amount exceeds balance of ${balance}` });

    const pymt = await prisma.payablePymt.create({
      data: {
        payableId: parseInt(payableId),
        amount: payAmt,
        paymentModeId: paymentModeId ? parseInt(paymentModeId) : null,
        paymentDate: paymentDate ? toDateOnly(paymentDate) : null,
        transactionNo: transactionNo || null,
        bankName: bankName || null,
        paidBy: paidBy || null,
        remarks: remarks || null,
      },
    });

    const newBalance = balance - payAmt;
    const newStatus = newBalance <= 0 ? "PAID" : "PARTIALLY_PAID";

    await prisma.payable.update({ where: { id: parseInt(payableId) }, data: { balanceAmt: newBalance, status: newStatus } });

    res.json({ payment: pymt, newBalance, newStatus });
  } catch (error) {
    console.error("RecordLabPayablePayment error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getLabImportLogs = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = { fileType: "LAB" };

    const [logs, total] = await Promise.all([
      prisma.importLog.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { importStarted: "desc" },
        include: { _count: { select: { errors: true } } },
      }),
      prisma.importLog.count({ where }),
    ]);

    res.json({ logs, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (error) {
    console.error("GetLabImportLogs error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getLabImportErrors = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await prisma.importLog.findUnique({ where: { id: parseInt(id) }, include: { errors: { orderBy: { rowNumber: "asc" } } } });
    if (!log) return res.status(404).json({ message: "Import log not found" });
    res.json(log);
  } catch (error) {
    console.error("GetLabImportErrors error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getLabPaymentModes = async (req, res) => {
  try {
    const modes = await prisma.paymentMode.findMany({ orderBy: { name: "asc" } });
    res.json(modes);
  } catch (error) {
    console.error("GetLabPaymentModes error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const updateLabPayments = async (req, res) => {
  try {
    const { id } = req.params;
    const { payments } = req.body;
    if (!Array.isArray(payments)) return res.status(400).json({ message: "payments array is required" });

    const txn = await prisma.incomeTxn.findUnique({
      where: { id: parseInt(id) },
      include: { patient: true },
    });
    if (!txn) return res.status(404).json({ message: "Transaction not found" });

    await prisma.rcvdPymt.deleteMany({ where: { incomeTxnId: txn.id } });

    let cashTotal = 0, bankTotal = 0, creditTotal = 0;
    let creditUnpaid = false;

    for (const p of payments) {
      const amt = parseFloat(String(p.amount)) || 0;
      if (amt <= 0) continue;

      const mode = await prisma.paymentMode.findUnique({ where: { id: parseInt(p.paymentModeId) } });
      if (!mode) continue;

      await prisma.rcvdPymt.create({
        data: {
          incomeTxnId: txn.id,
          paymentModeId: parseInt(p.paymentModeId),
          amount: amt,
          paymentDate: p.paymentDate ? toDateOnly(p.paymentDate) : txn.billDate,
          transactionNo: p.transactionNo || null,
          bankName: p.bankName || null,
          paidBy: p.paidBy || "SELF",
          remarks: p.remarks || null,
        },
      });

      if (mode.code === "CASH") cashTotal += amt;
      else if (mode.code === "BANK") bankTotal += amt;
      else if (mode.code === "CREDIT") {
        creditTotal += amt;
        if (p.creditStatus === "PENDING" || !p.isCreditPaid) creditUnpaid = true;
      }
    }

    const totalPaid = cashTotal + bankTotal + (creditUnpaid ? 0 : creditTotal);
    let pymtStatus = "UNPAID";
    if (totalPaid >= parseFloat(String(txn.netAmount)) - 0.01) pymtStatus = "FULLYPAID";
    else if (totalPaid > 0) pymtStatus = "PARTIALPAID";

    let txnStatus = "VERIFIED";
    if (bankTotal > 0 || creditTotal > 0) txnStatus = "UNVERIFIED";

    await prisma.incomeTxn.update({
      where: { id: txn.id },
      data: withIncomeTxnStatusData({}, pymtStatus, txnStatus),
    });

    if (creditTotal > 0 && creditUnpaid && txn.patientId) {
      const existingRcvl = await prisma.receivable.findFirst({
        where: { incomeTxnId: txn.id, arType: "PATIENT" },
      });
      if (existingRcvl) {
        await prisma.receivable.update({
          where: { id: existingRcvl.id },
          data: {
            dueAmt: creditTotal,
            balanceAmt: creditTotal,
            status: "PENDING",
          },
        });
      } else {
        await prisma.receivable.create({
          data: {
            arType: "PATIENT",
            patId: txn.patientId,
            incomeTxnId: txn.id,
            billDate: txn.billDate || new Date(),
            dueAmt: creditTotal,
            balanceAmt: creditTotal,
            status: "PENDING",
          },
        });
      }
    }

    if (creditTotal > 0 && !creditUnpaid) {
      await prisma.receivable.updateMany({
        where: { incomeTxnId: txn.id, arType: "PATIENT" },
        data: { status: "PAID", balanceAmt: 0 },
      });
    }

    const updated = await prisma.incomeTxn.findUnique({
      where: { id: txn.id },
      include: {
        patient: { select: { id: true, name: true, uhid: true } },
        rcvdPymts: { include: { paymentMode: true } },
        receivables: { where: { arType: "PATIENT" } },
      },
    });

    res.json(updated);
  } catch (error) {
    console.error("UpdateLabPayments error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  importLabBilling, getLabDashboard, getLabTxns, getLabTxnDetail, updateLabTxnError,
  getLabDoctorSummary, getLabDoctorPayables, recordLabPayablePayment,
  getLabImportLogs, getLabImportErrors, getLabPaymentModes, updateLabPayments,
};
