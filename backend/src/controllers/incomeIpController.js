const { prisma } = require("../middleware/auth");
const { readFirstSheetRowsFromBuffer } = require("../utils/excel");

const DUMMY_VALUES = ["--none--", "undefined", "null", "n/a", "na", "-"];

const IP_BILLING_HEADERS = ["S.No", "Date", "Bill No", "IP No", "Patient Name", "Terms", "Total Amount", "Discount", "Bill Amount", "Less Advance", "Net Amount", "cash_amount", "bank_amount", "credit_amount", "company_amount", "insurance_amount"];
const IP_DETAIL_HEADERS = ["S.No", "Bill Date", "Bill No", "UHID", "Patient Name", "Description", "Amount", "age", "Sex", "Consult Dr"];

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

const toDateOnly = (dateStr) => dateStr ? new Date(`${dateStr}T00:00:00.000Z`) : null;

const withIncomeTxnStatusData = (data, pymtStatus, txnStatus) => {
  const next = { ...data };
  if (pymtStatus != null) next.pymt_status = pymtStatus;
  if (txnStatus != null) next.txn_status = txnStatus;
  return next;
};

const addDays = (dateStr, days) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const addOneMonth = (dateStr) => {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
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

const importIPBilling = async (req, res) => {
  let importLog = null;
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const rows = await readFirstSheetRowsFromBuffer(req.file.buffer, { defval: "" });

    const headerRowIndex = findHeaderRow(rows, ["bill no", "patient name"]);
    if (headerRowIndex < 0) return res.status(400).json({ message: "Could not find header row with Bill No and Patient Name" });

    const headerRow = rows[headerRowIndex];
    const headerIdx = buildHeaderIndex(headerRow, IP_BILLING_HEADERS);

    const missing = IP_BILLING_HEADERS.filter((h) => headerIdx[h] < 0);
    if (missing.length > 0) return res.status(400).json({ message: `Missing columns: ${missing.join(", ")}` });

    const ipSource = await prisma.incomeSource.findFirst({ where: { code: "IP" } });
    if (!ipSource) return res.status(500).json({ message: "IP income source not found" });

    const allPaymentModes = await prisma.paymentMode.findMany();
    const modeMap = {};
    allPaymentModes.forEach((pm) => { modeMap[pm.code] = pm.id; });

    importLog = await prisma.importLog.create({
      data: { fileName: req.file.originalname, fileType: "IP", totalRecords: 0, inserted: 0, updated: 0, skipped: 0, failed: 0, createdBy: req.user?.id || null },
    });

    const errors = [];
    let inserted = 0, updated = 0, skipped = 0, failed = 0, totalRecords = 0;

    const dataRows = rows.slice(headerRowIndex + 1);
    const firstBillNo = getFirstDataBillNo(dataRows, headerIdx["Bill No"], headerIdx["S.No"]);
    if (!startsWithPrefix(firstBillNo, "IPB")) {
      return res.status(400).json({ message: "File is not valid IPD file" });
    }

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      if (isSkippableRow(row, headerIdx["S.No"])) continue;
      totalRecords++;

      const billNo = cleanValue(row[headerIdx["Bill No"]]);
      if (!billNo) {
        failed++;
        errors.push({ rowNumber: headerRowIndex + 2 + i, rowData: getRowValuesAsText(row, IP_BILLING_HEADERS, headerIdx), reason: "Missing Bill No" });
        continue;
      }

      const ipNo = cleanValue(row[headerIdx["IP No"]]);
      const billDate = parseDate(row[headerIdx["Date"]]);
      const totalAmount = parseDecimal(row[headerIdx["Total Amount"]]) || 0;
      const discount = parseDecimal(row[headerIdx["Discount"]]) || 0;
      const billAmount = parseDecimal(row[headerIdx["Bill Amount"]]) || 0;
      const lessAdvance = parseDecimal(row[headerIdx["Less Advance"]]) || 0;
      const netAmount = parseDecimal(row[headerIdx["Net Amount"]]) || 0;
      const cashAmt = parseDecimal(row[headerIdx["cash_amount"]]) || 0;
      const bankAmt = parseDecimal(row[headerIdx["bank_amount"]]) || 0;
      const creditAmt = parseDecimal(row[headerIdx["credit_amount"]]) || 0;
      const companyAmt = parseDecimal(row[headerIdx["company_amount"]]) || 0;
      const insuranceAmt = parseDecimal(row[headerIdx["insurance_amount"]]) || 0;

      const paidAmt = cashAmt + bankAmt + companyAmt + insuranceAmt;
      const unpaid = creditAmt;
      const net = netAmount;
      const txnStatusBase = bankAmt > 0 ? "REVIEW_REQ" : "UNVERIFIED";

      let pymtStatus, txnStatus;

      if (unpaid > 0 && paidAmt === 0 && unpaid === net) {
        pymtStatus = "UNPAID";
        txnStatus = txnStatusBase;
      } else if (paidAmt > 0 && paidAmt === net) {
        pymtStatus = "FULLYPAID";
        txnStatus = txnStatusBase;
      } else if (paidAmt > 0 && unpaid > 0 && paidAmt + unpaid === net) {
        pymtStatus = "PARTIALPAID";
        txnStatus = txnStatusBase;
      } else {
        pymtStatus = "UNPAID";
        txnStatus = "ERROR";
      }

      try {
        const existing = await prisma.incomeTxn.findFirst({ where: { billNo } });

        let incomeTxn;
        if (existing) {
          incomeTxn = await prisma.incomeTxn.update({
            where: { id: existing.id },
            data: withIncomeTxnStatusData({
              patientId: null,
              billDate: toDateOnly(billDate),
              ipNo: ipNo || null,
              grossAmount: totalAmount,
              discountAmount: discount,
              advAdjt: lessAdvance,
              netAmount,
              errorReason: txnStatus === "ERROR" ? "Payment mismatch" : null,
            }, pymtStatus, txnStatus),
          });
          await prisma.rcvdPymt.deleteMany({ where: { incomeTxnId: existing.id } });
          await prisma.receivable.deleteMany({ where: { incomeTxnId: existing.id } });
          updated++;
        } else {
          incomeTxn = await prisma.incomeTxn.create({
            data: withIncomeTxnStatusData({
              incomeSourceId: ipSource.id,
              patientId: null,
              billNo,
              billDate: toDateOnly(billDate),
              ipNo: ipNo || null,
              grossAmount: totalAmount,
              discountAmount: discount,
              advAdjt: lessAdvance,
              netAmount,
            }, pymtStatus, txnStatus),
          });
          inserted++;
        }

        if (txnStatus !== "ERROR") {
          if (cashAmt > 0) {
            await prisma.rcvdPymt.create({
              data: { incomeTxnId: incomeTxn.id, paymentModeId: modeMap["CASH"] || null, amount: cashAmt, paymentDate: toDateOnly(billDate), paidBy: "SELF" },
            });
          }
          if (bankAmt > 0) {
            await prisma.rcvdPymt.create({
              data: { incomeTxnId: incomeTxn.id, paymentModeId: modeMap["BANK"] || null, amount: bankAmt, paymentDate: toDateOnly(billDate), paidBy: "SELF" },
            });
          }
          if (companyAmt > 0) {
            await prisma.rcvdPymt.create({
              data: { incomeTxnId: incomeTxn.id, paymentModeId: modeMap["COMPANY"] || null, amount: companyAmt, paymentDate: toDateOnly(billDate), paidBy: "SELF" },
            });
          }
          if (insuranceAmt > 0) {
            await prisma.rcvdPymt.create({
              data: { incomeTxnId: incomeTxn.id, paymentModeId: modeMap["INSURANCE"] || null, amount: insuranceAmt, paymentDate: toDateOnly(billDate), paidBy: "SELF" },
            });
          }
        }

        if (ipNo) {
          const existing = await prisma.iPAdm.findFirst({ where: { ipNo } });
          if (existing) {
            await prisma.iPAdm.update({ where: { id: existing.id }, data: { incomeTxnId: incomeTxn.id } });
          } else {
            await prisma.iPAdm.create({ data: { ipNo, incomeTxnId: incomeTxn.id } });
          }
        }
      } catch (err) {
        failed++;
        errors.push({ rowNumber: headerRowIndex + 2 + i, rowData: getRowValuesAsText(row, IP_BILLING_HEADERS, headerIdx), reason: err.message || "Processing error" });
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

    res.json({ message: "IP Billing import complete", importLogId: importLog?.id, total: totalRecords, inserted, updated, skipped, failed, errors });
  } catch (error) {
    console.error("ImportIPBilling error:", error);
    if (importLog) await prisma.importLog.update({ where: { id: importLog.id }, data: { importEnded: new Date() } }).catch(() => {});
    res.status(500).json({ message: "Internal server error" });
  }
};

const importIPDetailReport = async (req, res) => {
  let importLog = null;
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const rows = await readFirstSheetRowsFromBuffer(req.file.buffer, { defval: "" });

    const headerRowIndex = findHeaderRow(rows, ["bill no", "description"]);
    if (headerRowIndex < 0) return res.status(400).json({ message: "Could not find header row with Bill No and Description" });

    const headerRow = rows[headerRowIndex];
    const headerIdx = buildHeaderIndex(headerRow, IP_DETAIL_HEADERS);

    const missing = IP_DETAIL_HEADERS.filter((h) => headerIdx[h] < 0);
    if (missing.length > 0) return res.status(400).json({ message: `Missing columns: ${missing.join(", ")}` });

    importLog = await prisma.importLog.create({
      data: { fileName: req.file.originalname, fileType: "IP_DETAIL", totalRecords: 0, inserted: 0, updated: 0, skipped: 0, failed: 0, createdBy: req.user?.id || null },
    });

    const errors = [];
    let inserted = 0, skipped = 0, failed = 0, totalRecords = 0;

    const dataRows = rows.slice(headerRowIndex + 1);
    const firstBillNo = getFirstDataBillNo(dataRows, headerIdx["Bill No"], headerIdx["S.No"]);
    if (!startsWithPrefix(firstBillNo, "IPB")) {
      return res.status(400).json({ message: "File is not valid IPD file" });
    }

    const billNotFoundCounts = {};

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      if (isSkippableRow(row, headerIdx["S.No"])) continue;
      totalRecords++;

      const billNo = cleanValue(row[headerIdx["Bill No"]]);
      if (!billNo) {
        failed++;
        errors.push({ rowNumber: headerRowIndex + 2 + i, rowData: getRowValuesAsText(row, IP_DETAIL_HEADERS, headerIdx), reason: "Missing Bill No" });
        continue;
      }

      const uhid = cleanValue(row[headerIdx["UHID"]]);
      const name = cleanValue(row[headerIdx["Patient Name"]]);
      const description = cleanValue(row[headerIdx["Description"]]);
      const amount = parseDecimal(row[headerIdx["Amount"]]) || 0;
      const billDate = parseDate(row[headerIdx["Bill Date"]]);

      if (amount <= 0) {
        skipped++;
        continue;
      }

      const incomeTxn = await prisma.incomeTxn.findFirst({ where: { billNo } });
      if (!incomeTxn) {
        if (!billNotFoundCounts[billNo]) billNotFoundCounts[billNo] = { count: 0, rowNumber: headerRowIndex + 2 + i };
        billNotFoundCounts[billNo].count++;
        skipped++;
        continue;
      }

      // Find or create patient by UHID and link to IncomeTxn
      if (uhid) {
        let patient = await prisma.patient.findFirst({ where: { uhid: uhid } });
        if (!patient) {
          patient = await prisma.patient.create({
            data: { name: name || "Unknown", uhid: uhid },
          });
        } else if (!patient.name && name) {
          await prisma.patient.update({ where: { id: patient.id }, data: { name } });
        }

        // Link patient to IncomeTxn if not already linked, or update if reviewed
        if (patient && (!incomeTxn.patientId || incomeTxn.txn_status === "VERIFIED")) {
          const nextTxnStatus = incomeTxn.txn_status === "VERIFIED" ? "UNVERIFIED" : undefined;
          await prisma.incomeTxn.update({
            where: { id: incomeTxn.id },
            data: withIncomeTxnStatusData({
              patientId: patient.id,
            }, undefined, nextTxnStatus),
          });
        }

        // Keep IP Admission's patient in sync once known
        if (patient) {
          const ipAdm = await prisma.iPAdm.findUnique({ where: { incomeTxnId: incomeTxn.id } });
          if (ipAdm) {
            await prisma.iPAdm.update({ where: { id: ipAdm.id }, data: { patientId: patient.id } });
          }
        }
      }

      try {
        await prisma.incomeDtl.create({
          data: {
            incomeTxnId: incomeTxn.id,
            uhid: uhid || null,
            description: description || null,
            amount,
            billDate: toDateOnly(billDate),
            createdBy: req.user?.username || null,
          },
        });
        inserted++;
      } catch (err) {
        failed++;
        errors.push({ rowNumber: headerRowIndex + 2 + i, rowData: getRowValuesAsText(row, IP_DETAIL_HEADERS, headerIdx), reason: err.message || "Processing error" });
      }
    }

    // Generate grouped errors for bill-not-found
    for (const [billNo, info] of Object.entries(billNotFoundCounts)) {
      errors.push({
        rowNumber: info.rowNumber,
        rowData: `Bill No: ${billNo}`,
        reason: `Bill No ${billNo} not found. ${info.count} record(s) not imported.`,
      });
    }

    if (importLog) {
      await prisma.importLog.update({
        where: { id: importLog.id },
        data: { totalRecords, inserted, updated: 0, skipped, failed, importEnded: new Date() },
      });
      if (errors.length > 0) {
        await prisma.importError.createMany({
          data: errors.map((e) => ({ importLogId: importLog.id, rowNumber: e.rowNumber, rowData: e.rowData, reason: e.reason })),
        });
      }
    }

    res.json({ message: "IP Detail import complete", importLogId: importLog?.id, total: totalRecords, inserted, skipped, failed, errors });
  } catch (error) {
    console.error("ImportIPDetailReport error:", error);
    if (importLog) await prisma.importLog.update({ where: { id: importLog.id }, data: { importEnded: new Date() } }).catch(() => {});
    res.status(500).json({ message: "Internal server error" });
  }
};

const getIPDashboard = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const ipSource = await prisma.incomeSource.findFirst({ where: { code: "IP" } });
    if (!ipSource) return res.json({ cash: 0, bank: 0, credit: 0, total: 0, doctorFeeLiability: 0 });

    const where = { incomeSourceId: ipSource.id };
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

    const payableWhere = { incomeTxn: { incomeSourceId: ipSource.id }, status: "PENDING" };
    if (fromDate || toDate) {
      payableWhere.billDate = {};
      if (fromDate) payableWhere.billDate.gte = new Date(`${fromDate}T00:00:00.000Z`);
      if (toDate) payableWhere.billDate.lte = new Date(`${toDate}T23:59:59.999Z`);
    }
    const liability = await prisma.payable.aggregate({ where: payableWhere, _sum: { balanceAmt: true } });
    const doctorFeeLiability = parseFloat(String(liability._sum.balanceAmt)) || 0;

    res.json({ cash, bank, credit, total: cash + bank + credit, doctorFeeLiability });
  } catch (error) {
    console.error("GetIPDashboard error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getIPTxns = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "", fromDate, toDate, paymentMode, doctorId, pymtStatus, txnStatus, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const ipSource = await prisma.incomeSource.findFirst({ where: { code: "IP" } });
    if (!ipSource) return res.json({ txns: [], pagination: { total: 0, page: 1, limit: 10, pages: 0 } });

    const andConditions = [{ incomeSourceId: ipSource.id }];

    if (search) {
      andConditions.push({
        OR: [
          { billNo: { contains: search, mode: "insensitive" } },
          { ipNo: { contains: search, mode: "insensitive" } },
          { patient: { name: { contains: search, mode: "insensitive" } } },
          { patient: { uhid: { contains: search, mode: "insensitive" } } },
        ],
      });
    }

    if (fromDate || toDate) {
      const dateFilter = {};
      if (fromDate) dateFilter.gte = new Date(`${fromDate}T00:00:00.000Z`);
      if (toDate) dateFilter.lte = new Date(`${toDate}T23:59:59.999Z`);
      andConditions.push({ billDate: dateFilter });
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
      andConditions.push({ pymt_status: { in: pymtStatuses } });
    }
    if (txnStatus) {
      const txnStatuses = txnStatus.split(",").map((s) => s.trim().toUpperCase());
      andConditions.push({ txn_status: { in: txnStatuses } });
    }
    if (statusTokens.length > 0) {
      const legacyPymtStatuses = statusTokens.filter((s) => paymentStatuses.includes(s));
      const legacyTxnStatuses = statusTokens.filter((s) => transactionStatuses.includes(s));
      if (legacyPymtStatuses.length > 0) {
        andConditions.push({ pymt_status: { in: legacyPymtStatuses } });
      }
      if (legacyTxnStatuses.length > 0) {
        andConditions.push({ txn_status: { in: legacyTxnStatuses } });
      }
    }

    const where = andConditions.length > 0 ? { AND: andConditions } : {};

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
    console.error("GetIPTxns error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getIPTxnDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const txn = await prisma.incomeTxn.findUnique({
      where: { id: parseInt(id) },
      include: {
        patient: true,
        incomeSource: true,
        rcvdPymts: { include: { paymentMode: true } },
        payables: { include: { doctor: true, bizPartner: true } },
        incomeDtls: true,
        receivables: { include: { bizPartner: true }, orderBy: { id: "asc" } },
      },
    });
    if (!txn) return res.status(404).json({ message: "Transaction not found" });
    res.json(txn);
  } catch (error) {
    console.error("GetIPTxnDetail error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const updateIPTxnError = async (req, res) => {
  try {
    const { id } = req.params;
    const { pymt_status, txn_status, errorReason, grossAmount, discountAmount, advAdjt, netAmount } = req.body;

    const txn = await prisma.incomeTxn.findUnique({ where: { id: parseInt(id) } });
    if (!txn) return res.status(404).json({ message: "Transaction not found" });
    if (txn.txn_status !== "ERROR") return res.status(400).json({ message: "Only ERROR records can be updated" });

    const data = {};
    if (pymt_status && ["FULLYPAID", "PARTIALPAID", "UNPAID"].includes(pymt_status)) {
      data.pymt_status = pymt_status;
    }
    if (txn_status && ["VERIFIED", "UNVERIFIED", "ERROR"].includes(txn_status)) data.txn_status = txn_status;
    if (errorReason !== undefined) data.errorReason = errorReason || null;
    if (grossAmount !== undefined) data.grossAmount = parseFloat(grossAmount) || 0;
    if (discountAmount !== undefined) data.discountAmount = parseFloat(discountAmount) || 0;
    if (advAdjt !== undefined) data.advAdjt = parseFloat(advAdjt) || 0;
    if (netAmount !== undefined) data.netAmount = parseFloat(netAmount) || 0;

    const updated = await prisma.incomeTxn.update({ where: { id: parseInt(id) }, data });
    res.json(updated);
  } catch (error) {
    console.error("UpdateIPTxnError error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const reviewIPTxn = async (req, res) => {
  try {
    const { id } = req.params;
    const { rcvdPymts, payables } = req.body;

    const txn = await prisma.incomeTxn.findUnique({ where: { id: parseInt(id) } });
    if (!txn) return res.status(404).json({ message: "Transaction not found" });
    if (!txn.patientId) return res.status(400).json({ message: "Patient is required to create receivables" });

    let newPymtStatus = null;

    // Update received payments
    if (rcvdPymts && Array.isArray(rcvdPymts)) {
      const insuranceMode = await prisma.paymentMode.findFirst({ where: { code: "INSURANCE" } });
      if (!insuranceMode) {
        await prisma.paymentMode.create({ data: { code: "INSURANCE", name: "Insurance" } });
      }

      await prisma.rcvdPymt.deleteMany({ where: { incomeTxnId: parseInt(id) } });
      await prisma.receivable.deleteMany({ where: { incomeTxnId: parseInt(id) } });

      const paymentModeIds = [...new Set(rcvdPymts
        .map((p) => (p.paymentModeId ? parseInt(p.paymentModeId) : null))
        .filter((v) => Number.isInteger(v)))];
      const modeRows = paymentModeIds.length > 0
        ? await prisma.paymentMode.findMany({ where: { id: { in: paymentModeIds } } })
        : [];
      const modeById = {};
      modeRows.forEach((m) => { modeById[m.id] = m; });

      let insuranceAndCreditTotal = 0;

      for (const p of rcvdPymts) {
        if (!p.amount || parseFloat(p.amount) <= 0) continue;
        const paymentModeId = p.paymentModeId ? parseInt(p.paymentModeId) : null;
        const modeCode = paymentModeId && modeById[paymentModeId] ? modeById[paymentModeId].code : null;
        const amount = parseFloat(p.amount);

        if (!paymentModeId) {
          return res.status(400).json({ message: "Payment mode is required for each payment row" });
        }

        if (modeCode === "INSURANCE" && !p.insurancePartnerId) {
          return res.status(400).json({ message: "Insurance company is required for insurance payment mode" });
        }

        await prisma.rcvdPymt.create({
          data: {
            incomeTxnId: parseInt(id),
            paymentModeId,
            amount,
            paymentDate: p.paymentDate ? toDateOnly(p.paymentDate) : null,
            transactionNo: p.transactionNo || null,
            bankName: p.bankName || null,
            paidBy: p.paidBy || null,
            remarks: p.remarks || null,
          },
        });

        if (modeCode === "INSURANCE" || modeCode === "CREDIT") {
          if (modeCode === "INSURANCE") {
            insuranceAndCreditTotal += amount;
          } else if (modeCode === "CREDIT") {
            insuranceAndCreditTotal += amount;
          }

          await prisma.receivable.create({
            data: {
              arType: modeCode === "INSURANCE" ? "INSURANCE" : "PATIENT",
              bpId: modeCode === "INSURANCE" ? parseInt(p.insurancePartnerId) : null,
              patId: txn.patientId,
              incomeTxnId: parseInt(id),
              billDate: txn.billDate || new Date(),
              dueDate: p.paymentDate ? toDateOnly(p.paymentDate) : null,
              dueAmt: amount,
              balanceAmt: amount,
              status: "PENDING",
              remarks: modeCode === "INSURANCE" ? "Insurance receivable" : "Credit receivable",
              createdBy: req.user?.username || null,
            },
          });
        }
      }

      const netAmt = parseFloat(String(txn.netAmount)) || 0;
      if (insuranceAndCreditTotal > 0) {
        if (Math.abs(netAmt - insuranceAndCreditTotal) <= 0.01) newPymtStatus = "UNPAID";
        else if (netAmt > insuranceAndCreditTotal + 0.01) newPymtStatus = "PARTIALPAID";
        else newPymtStatus = "FULLYPAID";
      } else {
        const allPymts = await prisma.rcvdPymt.findMany({ where: { incomeTxnId: parseInt(id) } });
        const totalPaid = allPymts.reduce((sum, pm) => sum + (parseFloat(String(pm.amount)) || 0), 0);
        if (totalPaid >= netAmt - 0.01) newPymtStatus = "FULLYPAID";
        else if (totalPaid > 0) newPymtStatus = "PARTIALPAID";
        else newPymtStatus = "UNPAID";
      }
    }

    // Create payables from income_dtl descriptions
    if (payables && Array.isArray(payables)) {
      const keptPayableIds = [];
      for (const pay of payables) {
        if (!pay.description) continue;
        const payAmt = parseFloat(pay.payableAmt) || 0;
        if (payAmt <= 0) continue;

        const billedAmt = parseFloat(pay.billedAmt) || payAmt;
        const partyType = pay.partyType || "DOCTOR";
        const doctorId = pay.doctorId ? parseInt(pay.doctorId) : null;
        const bizPartnerId = pay.bizPartnerId ? parseInt(pay.bizPartnerId) : null;

        // Validate payable amount <= billed amount
        if (payAmt > billedAmt) continue;

        // Skip if no party ID provided (except for optional items)
        if (!doctorId && !bizPartnerId && !pay.isOptional) continue;
        if (pay.isOptional && !doctorId && !bizPartnerId) continue;

          const baseData = {
          partyType,
          incomeTxn: { connect: { id: parseInt(id) } },
          billDate: txn.billDate || new Date(),
          dueDate: txn.billDate ? new Date(`${addDays(txn.billDate.toISOString().split("T")[0], 15)}T00:00:00.000Z`) : null,
          billedAmt,
          payableAmt: payAmt,
          balanceAmt: payAmt,
          status: "PENDING",
          remarks: pay.name || null,
          createdBy: req.user?.username || null,
        };

        const existingPayable = pay.payableId
          ? await prisma.payable.findFirst({ where: { id: parseInt(pay.payableId), incomeTxnId: parseInt(id) } })
          : await prisma.payable.findFirst({
              where: { incomeTxnId: parseInt(id), partyType, billedAmt, remarks: pay.name || null },
            });

        if (existingPayable) {
          const updateData = {
            partyType,
            payableAmt: payAmt,
            balanceAmt: payAmt,
            status: "PENDING",
            drId: partyType === "DOCTOR" ? doctorId : null,
            bpId: partyType === "VENDOR" ? bizPartnerId : null,
          };
          const updatedPayable = await prisma.payable.update({
            where: { id: existingPayable.id },
            data: updateData,
          });
          keptPayableIds.push(updatedPayable.id);
        } else if (partyType === "DOCTOR") {
          const createdPayable = await prisma.payable.create({
            data: {
              ...baseData,
              doctor: { connect: { id: doctorId } },
            },
          });
          keptPayableIds.push(createdPayable.id);
        } else if (partyType === "VENDOR") {
          const createdPayable = await prisma.payable.create({
            data: {
              ...baseData,
              bizPartner: { connect: { id: bizPartnerId } },
            },
          });
          keptPayableIds.push(createdPayable.id);
        }
      }

      await prisma.payable.deleteMany({
        where: {
          incomeTxnId: parseInt(id),
          id: { notIn: keptPayableIds.length > 0 ? keptPayableIds : [0] },
        },
      });
    }

    await prisma.incomeTxn.update({
      where: { id: parseInt(id) },
      data: withIncomeTxnStatusData({ errorReason: null }, newPymtStatus || undefined, "VERIFIED"),
    });

    res.json({ message: "Review saved successfully" });
  } catch (error) {
    console.error("ReviewIPTxn error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getIPDoctorSummary = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const ipSource = await prisma.incomeSource.findFirst({ where: { code: "IP" } });
    if (!ipSource) return res.json({ summary: [], grandTotal: 0 });

    const where = { status: "PENDING", incomeTxn: { incomeSourceId: ipSource.id } };
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
    console.error("GetIPDoctorSummary error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getIPDoctorPayables = async (req, res) => {
  try {
    const { doctorId } = req.query;
    if (!doctorId) return res.status(400).json({ message: "doctorId is required" });

    const ipSource = await prisma.incomeSource.findFirst({ where: { code: "IP" } });

    const payables = await prisma.payable.findMany({
      where: { drId: parseInt(doctorId), status: { in: ["PENDING", "PARTIALLY_PAID"] }, incomeTxn: { incomeSourceId: ipSource?.id } },
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
    console.error("GetIPDoctorPayables error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const recordIPPayablePayment = async (req, res) => {
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
    console.error("RecordIPPayablePayment error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getIPImportLogs = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = { fileType: { in: ["IP", "IP_DETAIL"] } };

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
    console.error("GetIPImportLogs error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getIPImportErrors = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await prisma.importLog.findUnique({ where: { id: parseInt(id) }, include: { errors: { orderBy: { rowNumber: "asc" } } } });
    if (!log) return res.status(404).json({ message: "Import log not found" });
    res.json(log);
  } catch (error) {
    console.error("GetIPImportErrors error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getIPPaymentModes = async (req, res) => {
  try {
    const insuranceMode = await prisma.paymentMode.findFirst({ where: { code: "INSURANCE" } });
    if (!insuranceMode) {
      await prisma.paymentMode.create({ data: { code: "INSURANCE", name: "Insurance" } });
    }
    const modes = await prisma.paymentMode.findMany({ orderBy: { name: "asc" } });
    res.json(modes);
  } catch (error) {
    console.error("GetIPPaymentModes error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getIPInsurancePartners = async (req, res) => {
  try {
    const partners = await prisma.bizPartner.findMany({
      where: { bpType: "INSURANCE", isActive: true },
      orderBy: { bpName: "asc" },
      select: { id: true, bpName: true, contactName: true, mobile: true },
    });
    res.json(partners);
  } catch (error) {
    console.error("GetIPInsurancePartners error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  importIPBilling, importIPDetailReport, getIPDashboard, getIPTxns, getIPTxnDetail,
  updateIPTxnError, reviewIPTxn, getIPDoctorSummary, getIPDoctorPayables,
  recordIPPayablePayment, getIPImportLogs, getIPImportErrors, getIPPaymentModes, getIPInsurancePartners,
};
