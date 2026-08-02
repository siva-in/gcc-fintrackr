const { prisma } = require("../middleware/auth");
const { readFirstSheetRowsFromBuffer } = require("../utils/excel");

const DUMMY_VALUES = ["--none--", "undefined", "null", "n/a", "na", "-"];

const ADV_HEADERS = [
  "S.No", "Vou.No", "Date", "Voucher Type", "Bill Name", "Bill No", "Amount",
  "payment_refno", "cash_amount", "card_amount", "cheque_amount", "neft_amount", "UPI Amt",
];

const parseAdvDate = (val) => {
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
  const mdYMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mdYMatch) {
    const [, month, day, year] = mdYMatch;
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

const toDateOnly = (dateStr) => (dateStr ? new Date(`${dateStr}T00:00:00.000Z`) : null);

const getRowValuesAsText = (row, headers, headerIdx) => {
  const parts = [];
  for (const h of headers) {
    const idx = headerIdx[h];
    const val = idx >= 0 ? row[idx] : "";
    parts.push(val != null ? String(val).trim() : "");
  }
  return parts.join(", ");
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

const importAdvBilling = async (req, res) => {
  let importLog = null;
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const rows = await readFirstSheetRowsFromBuffer(req.file.buffer, { defval: "" });

    const headerRowIndex = findHeaderRow(rows, ["vou.no", "bill no"]);
    if (headerRowIndex < 0) return res.status(400).json({ message: "Could not find header row with Vou.No and Bill No" });

    const headerRow = rows[headerRowIndex];
    const headerIdx = buildHeaderIndex(headerRow, ADV_HEADERS);

    const missing = ADV_HEADERS.filter((h) => headerIdx[h] < 0);
    if (missing.length > 0) return res.status(400).json({ message: `Missing columns: ${missing.join(", ")}` });

    const advSource = await prisma.incomeSource.findFirst({ where: { code: "ADV" } });
    if (!advSource) return res.status(500).json({ message: "ADV income source not found" });

    const allPaymentModes = await prisma.paymentMode.findMany();
    const modeMap = {};
    allPaymentModes.forEach((pm) => { modeMap[pm.code] = pm.id; });

    importLog = await prisma.importLog.create({
      data: { fileName: req.file.originalname, fileType: "ADV", totalRecords: 0, inserted: 0, updated: 0, skipped: 0, failed: 0, createdBy: req.user?.id || null },
    });

    const errors = [];
    let inserted = 0, updated = 0, skipped = 0, failed = 0, totalRecords = 0;

    const dataRows = rows.slice(headerRowIndex + 1);

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      if (isSkippableRow(row, headerIdx["S.No"])) continue;
      totalRecords++;

      const rowNum = headerRowIndex + 2 + i;
      const rowData = getRowValuesAsText(row, ADV_HEADERS, headerIdx);

      const voucherType = cleanValue(row[headerIdx["Voucher Type"]]);
      if (!voucherType || String(voucherType).trim().toLowerCase() !== "advance collection") {
        skipped++;
        continue;
      }

      const billNo = cleanValue(row[headerIdx["Vou.No"]]);
      if (!billNo) {
        failed++;
        errors.push({ rowNumber: rowNum, rowData, reason: "Missing Vou.No" });
        continue;
      }

      try {
        const billDate = parseAdvDate(row[headerIdx["Date"]]);
        const ipNo = cleanValue(row[headerIdx["Bill No"]]);
        const amount = parseDecimal(row[headerIdx["Amount"]]) || 0;

        const ipAdm = ipNo ? await prisma.iPAdm.findUnique({ where: { ipNo } }) : null;
        if (ipNo && !ipAdm) {
          failed++;
          errors.push({ rowNumber: rowNum, rowData, reason: `IPAdm not found for IP No: ${ipNo}` });
          continue;
        }
        const ipId = ipAdm ? ipAdm.id : null;
        const patientId = ipAdm ? ipAdm.patId : null;

        const cashAmt = parseDecimal(row[headerIdx["cash_amount"]]) || 0;
        const cardAmt = parseDecimal(row[headerIdx["card_amount"]]) || 0;
        const chequeAmt = parseDecimal(row[headerIdx["cheque_amount"]]) || 0;
        const neftAmt = parseDecimal(row[headerIdx["neft_amount"]]) || 0;
        const upiAmt = parseDecimal(row[headerIdx["UPI Amt"]]) || 0;

        const existing = await prisma.incomeTxn.findFirst({ where: { billNo } });

        let incomeTxn;
        if (existing) {
          incomeTxn = await prisma.incomeTxn.update({
            where: { id: existing.id },
            data: {
              billDate: toDateOnly(billDate),
              ipId,
              patientId,
              grossAmount: amount,
              discountAmount: 0,
              advAdjt: 0,
              billAmt: amount,
              pymt_status: "UNREALISED",
              txn_status: "VERIFIED",
              errorReason: null,
            },
          });
          await prisma.rcvdPymt.deleteMany({ where: { incomeTxnId: existing.id } });
          updated++;
        } else {
          incomeTxn = await prisma.incomeTxn.create({
            data: {
              incomeSourceId: advSource.id,
              patientId,
              billNo,
              billDate: toDateOnly(billDate),
              ipId,
              grossAmount: amount,
              discountAmount: 0,
              advAdjt: 0,
              billAmt: amount,
              pymt_status: "UNREALISED",
              txn_status: "VERIFIED",
            },
          });
          inserted++;
        }

        const paymentsToCreate = [];
        if (cashAmt > 0) paymentsToCreate.push({ modeCode: "CASH", amount: cashAmt });
        if (cardAmt > 0) paymentsToCreate.push({ modeCode: "CARD", amount: cardAmt });
        if (chequeAmt > 0) paymentsToCreate.push({ modeCode: "CHEQUE", amount: chequeAmt });
        if (neftAmt > 0) paymentsToCreate.push({ modeCode: "BANK", amount: neftAmt });
        if (upiAmt > 0) paymentsToCreate.push({ modeCode: "UPI", amount: upiAmt });

        for (const p of paymentsToCreate) {
          await prisma.rcvdPymt.create({
            data: {
              incomeTxnId: incomeTxn.id,
              paymentModeId: modeMap[p.modeCode] || null,
              amount: p.amount,
              paymentDate: toDateOnly(billDate),
              transactionNo: null,
              bankName: null,
              paidBy: "SELF",
              remarks: ipNo || null,
            },
          });
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

    res.json({ message: "Advance import complete", importLogId: importLog?.id, total: totalRecords, inserted, updated, skipped, failed, errors });
  } catch (error) {
    console.error("ImportAdvBilling error:", error);
    if (importLog) await prisma.importLog.update({ where: { id: importLog.id }, data: { importEnded: new Date() } }).catch(() => {});
    res.status(500).json({ message: "Internal server error" });
  }
};

const getAdvDashboard = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const advSource = await prisma.incomeSource.findFirst({ where: { code: "ADV" } });
    if (!advSource) return res.json({ unrealised: 0, realised: 0, cash: 0, bank: 0, card: 0, total: 0 });

    const where = { incomeSourceId: advSource.id };
    if (fromDate || toDate) {
      where.billDate = {};
      if (fromDate) where.billDate.gte = new Date(`${fromDate}T00:00:00.000Z`);
      if (toDate) where.billDate.lte = new Date(`${toDate}T23:59:59.999Z`);
    }

    const txns = await prisma.incomeTxn.findMany({
      where,
      include: { rcvdPymts: { include: { paymentMode: true } } },
    });

    let unrealised = 0, realised = 0, cash = 0, bank = 0, card = 0;
    for (const txn of txns) {
      const net = parseFloat(String(txn.billAmt)) || 0;
      if (txn.pymt_status === "UNREALISED") unrealised += net;
      if (txn.pymt_status === "REALISED") realised += net;
      for (const pmt of txn.rcvdPymts) {
        const code = pmt.paymentMode?.code;
        const amt = parseFloat(String(pmt.amount)) || 0;
        if (code === "CASH") cash += amt;
        else if (code === "CARD") card += amt;
        else if (["BANK", "UPI", "CHEQUE"].includes(code)) bank += amt;
      }
    }

    res.json({ unrealised, realised, cash, bank, card, total: unrealised + realised });
  } catch (error) {
    console.error("GetAdvDashboard error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getAdvTxns = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "", fromDate, toDate, paymentMode, pymtStatus, txnStatus } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const advSource = await prisma.incomeSource.findFirst({ where: { code: "ADV" } });
    if (!advSource) return res.json({ txns: [], pagination: { total: 0, page: 1, pages: 0 } });

    const andConditions = [{ incomeSourceId: advSource.id }];

    if (search) {
      andConditions.push({
        OR: [
          { billNo: { contains: search, mode: "insensitive" } },
          { ipAdm: { ipNo: { contains: search, mode: "insensitive" } } },
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

    if (pymtStatus) {
      const statuses = pymtStatus.split(",").map((s) => s.trim().toUpperCase());
      andConditions.push({ pymt_status: { in: statuses } });
    }
    if (txnStatus) {
      const statuses = txnStatus.split(",").map((s) => s.trim().toUpperCase());
      andConditions.push({ txn_status: { in: statuses } });
    }

    const where = { AND: andConditions };

    const [txns, total] = await Promise.all([
      prisma.incomeTxn.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: [{ billDate: "desc" }, { id: "desc" }],
        include: {
          incomeSource: { select: { code: true, name: true } },
          ipAdm: { select: { id: true, ipNo: true } },
          rcvdPymts: { include: { paymentMode: true } },
        },
      }),
      prisma.incomeTxn.count({ where }),
    ]);

    res.json({ txns, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (error) {
    console.error("GetAdvTxns error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getAdvTxnDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const txn = await prisma.incomeTxn.findUnique({
      where: { id: parseInt(id) },
      include: {
        incomeSource: true,
        ipAdm: { select: { id: true, ipNo: true } },
        rcvdPymts: { include: { paymentMode: true } },
      },
    });
    if (!txn) return res.status(404).json({ message: "Transaction not found" });
    res.json(txn);
  } catch (error) {
    console.error("GetAdvTxnDetail error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getAdvImportLogs = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = { fileType: { in: ["ADV", "IP_ADM"] } };

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
    console.error("GetAdvImportLogs error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getAdvImportErrors = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await prisma.importLog.findUnique({ where: { id: parseInt(id) }, include: { errors: { orderBy: { rowNumber: "asc" } } } });
    if (!log) return res.status(404).json({ message: "Import log not found" });
    res.json(log);
  } catch (error) {
    console.error("GetAdvImportErrors error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getAdvPaymentModes = async (req, res) => {
  try {
    const modes = await prisma.paymentMode.findMany({ orderBy: { name: "asc" } });
    res.json(modes);
  } catch (error) {
    console.error("GetAdvPaymentModes error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const bulkRealiseAdvTxns = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "ids array is required" });
    }

    const result = await prisma.incomeTxn.updateMany({
      where: { id: { in: ids.map(Number) }, pymt_status: "UNREALISED" },
      data: { pymt_status: "REALISED" },
    });

    res.json({ message: `${result.count} transaction(s) marked as Realised` });
  } catch (error) {
    console.error("BulkRealiseAdvTxns error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  importAdvBilling, getAdvDashboard, getAdvTxns, getAdvTxnDetail,
  getAdvImportLogs, getAdvImportErrors, getAdvPaymentModes,
  bulkRealiseAdvTxns,
};
