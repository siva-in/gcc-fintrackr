const { prisma } = require("../middleware/auth");
const { readFirstSheetRowsFromBuffer } = require("../utils/excel");

const DUMMY_VALUES = ["--none--", "undefined", "null", "n/a", "na", "-"];

const PHARMA_HEADERS = ["S.No", "Entry Name", "Entry Date", "Entry No", "Customer", "Total Amt", "Discount", "Tax", "Net Amount", "Patient_name", "Payment Mode", "Mobile No", "Credit Status"];

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

const startsWithPrefix = (value, prefix) => String(value || "").trim().toUpperCase().startsWith(prefix);

const withIncomeTxnStatusData = (data, pymtStatus, txnStatus) => {
  const next = { ...data };
  if (pymtStatus != null) next.pymt_status = pymtStatus;
  if (txnStatus != null) next.txn_status = txnStatus;
  return next;
};

const importPharmaBilling = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  const importStarted = new Date();
  let importLogId = null;

  try {
    const rows = await readFirstSheetRowsFromBuffer(req.file.buffer);

    if (rows.length < 2) return res.status(400).json({ message: "Excel file is empty or has no data rows" });

    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const rowStr = rows[i].map((c) => String(c || "").toLowerCase()).join("|");
      if (rowStr.includes("entry no") && rowStr.includes("net amount")) {
        headerRowIndex = i;
        break;
      }
    }
    if (headerRowIndex === -1) {
      return res.status(400).json({ message: "Could not find header row. Expected 'Entry No' and 'Net Amount' columns." });
    }

    const headers = rows[headerRowIndex].map((h) => String(h || "").trim());
    const missing = PHARMA_HEADERS.filter((h) => !headers.includes(h));
    if (missing.length > 0) {
      return res.status(400).json({ message: `Missing columns: ${missing.join(", ")}` });
    }

    const headerIdx = {};
    PHARMA_HEADERS.forEach((h) => { headerIdx[h] = headers.indexOf(h); });

    const dataRows = rows.slice(headerRowIndex + 1).filter((r) => {
      if (!r.some((c) => c != null && String(c).trim() !== "")) return false;
      const sNo = String(r[0] || "").trim();
      const entryName = String(r[1] || "").trim().toLowerCase();
      if (sNo === "" || entryName.includes("total") || entryName.includes("page total")) return false;
      return true;
    });

    const pharmaSource = await prisma.incomeSource.findFirst({ where: { code: "PHARMACY" } })
      || await prisma.incomeSource.findFirst({ where: { code: "PHARMA" } });
    if (!pharmaSource) return res.status(500).json({ message: "PHARMA income source not found in database" });

    const allPaymentModes = await prisma.paymentMode.findMany();
    const modeMap = {};
    allPaymentModes.forEach((pm) => { modeMap[pm.code] = pm.id; });

    const importLog = await prisma.importLog.create({
      data: {
        fileName: req.file.originalname,
        fileType: "PHARMA",
        totalRecords: dataRows.length,
        importStarted,
        createdBy: req.user?.id || null,
      },
    });
    importLogId = importLog.id;

    let inserted = 0;
    let updated = 0;
    let failed = 0;
    const errors = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = headerRowIndex + 2 + i;
      const rowData = getRowValuesAsText(row, PHARMA_HEADERS, headerIdx);
      try {
        const billNo = cleanValue(row[headerIdx["Entry No"]]);
        if (!billNo) {
          failed++;
          errors.push({ rowNumber: rowNum, rowData, reason: "Missing Entry No" });
          continue;
        }

        const billDate = parseDate(row[headerIdx["Entry Date"]]);
        const grossAmount = parseDecimal(row[headerIdx["Total Amt"]]) || 0;
        const discountAmount = parseDecimal(row[headerIdx["Discount"]]) || 0;
        const billAmt = parseDecimal(row[headerIdx["Net Amount"]]) || 0;
        const tax = parseDecimal(row[headerIdx["Tax"]]) || 0;

        // Patient lookup: only when Customer starts with GCCH
        let patientId = null;
        const customer = cleanValue(row[headerIdx["Customer"]]);
        if (customer && customer.toUpperCase().startsWith("GCCH")) {
          const uhid = customer.split("-")[0].trim();
          const patient = await prisma.patient.findFirst({ where: { uhid } });
          if (patient) patientId = patient.id;
        }

        // IPAdm association
        let ipId = null;
        let ipError = null;
        if (patientId) {
          const adms = await prisma.iPAdm.findMany({ where: { patId: patientId }, orderBy: { id: "desc" } });
          let adm = adms.find((a) => a.status === "ADMITTED");
          if (!adm) {
            adm = adms.find(
              (a) =>
                a.status === "DISCHARGED" &&
                a.dischargeDt &&
                billDate &&
                billDate >= toDateStr(a.date) &&
                billDate <= toDateStr(a.dischargeDt),
            );
          }
          if (startsWithPrefix(billNo, "IPS")) {
            if (!adm) ipError = "IP Not found";
            else ipId = adm.id;
          } else if (adm) {
            ipId = adm.id;
          }
        }

        // Payment mode parsing
        const paymentModeRaw = cleanValue(row[headerIdx["Payment Mode"]]) || "";
        const modes = paymentModeRaw.split(",").map((m) => m.trim()).filter(Boolean);
        const lower = paymentModeRaw.toLowerCase();
        const hasCredit = lower.includes("credit");
        const exactCredit = lower === "credit";
        const hasCash = lower.includes("cash");
        const hasBank = lower.includes("bank");

        let pymtStatus;
        if (exactCredit) pymtStatus = "UNPAID";
        else if (hasCredit) pymtStatus = "PARTIALPAID";
        else pymtStatus = "FULLYPAID";

        let txnStatus = "UNVERIFIED";
        let errorReason = null;

        if (ipError) {
          txnStatus = "ERROR";
          errorReason = ipError;
        } else if (modes.length > 1 || hasBank) {
          txnStatus = "REVIEW_REQ";
          errorReason = paymentModeRaw;
        }

        const existing = await prisma.incomeTxn.findFirst({ where: { billNo } });

        let incomeTxn;
        if (existing) {
          incomeTxn = await prisma.incomeTxn.update({
            where: { id: existing.id },
            data: withIncomeTxnStatusData({
              patientId,
              billDate: toDateOnly(billDate),
              ipId,
              grossAmount,
              discountAmount,
              billAmt,
              tax,
              errorReason,
            }, pymtStatus, txnStatus),
          });
          await prisma.rcvdPymt.deleteMany({ where: { incomeTxnId: existing.id } });
          await prisma.receivable.deleteMany({ where: { incomeTxnId: existing.id } });
          updated++;
        } else {
          incomeTxn = await prisma.incomeTxn.create({
            data: withIncomeTxnStatusData({
              incomeSourceId: pharmaSource.id,
              patientId,
              billNo,
              billDate: toDateOnly(billDate),
              ipId,
              grossAmount,
              discountAmount,
              billAmt,
              tax,
              errorReason,
            }, pymtStatus, txnStatus),
          });
          inserted++;
        }

        if (txnStatus !== "ERROR") {
          // Create received payments / receivables
          if (hasCredit) {
            if (patientId) {
              await prisma.receivable.create({
                data: {
                  arType: "PATIENT",
                  patId: patientId,
                  incomeTxnId: incomeTxn.id,
                  billDate: toDateOnly(billDate) || new Date(),
                  dueDate: toDateOnly(billDate),
                  dueAmt: billAmt,
                  balanceAmt: billAmt,
                  status: "PENDING",
                  remarks: "Credit sale",
                },
              });
            }
          }
          if (hasCash) {
            await prisma.rcvdPymt.create({
              data: {
                incomeTxnId: incomeTxn.id,
                paymentModeId: modeMap["CASH"] || null,
                amount: billAmt,
                paymentDate: toDateOnly(billDate),
                paidBy: "SELF",
                remarks: paymentModeRaw || null,
              },
            });
          } else if (hasBank) {
            await prisma.rcvdPymt.create({
              data: {
                incomeTxnId: incomeTxn.id,
                paymentModeId: modeMap["BANK"] || null,
                amount: billAmt,
                paymentDate: toDateOnly(billDate),
                paidBy: "SELF",
                remarks: paymentModeRaw || null,
              },
            });
          }
        }
      } catch (err) {
        failed++;
        errors.push({ rowNumber: rowNum, rowData, reason: err.message || "Import failed" });
      }
    }

    const importEnded = new Date();

    if (errors.length > 0) {
      await prisma.importError.createMany({
        data: errors.map((e) => ({ importLogId: importLog.id, ...e })),
      });
    }

    await prisma.importLog.update({
      where: { id: importLog.id },
      data: { inserted, updated, failed, importEnded },
    });

    res.json({
      message: "Pharma import complete",
      importLogId,
      total: dataRows.length,
      inserted,
      updated,
      skipped: 0,
      failed,
      errors: errors.slice(0, 50),
    });
  } catch (error) {
    console.error("ImportPharmaBilling error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getPharmaPaymentModes = async (req, res) => {
  try {
    const modes = await prisma.paymentMode.findMany({ orderBy: { name: "asc" } });
    res.json(modes);
  } catch (error) {
    console.error("GetPharmaPaymentModes error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getPharmaSource = async () => {
  return await prisma.incomeSource.findFirst({ where: { code: "PHARMACY" } })
    || await prisma.incomeSource.findFirst({ where: { code: "PHARMA" } });
};

const getPharmaDashboard = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const source = await getPharmaSource();
    if (!source) return res.json({ cash: 0, bank: 0, credit: 0, total: 0 });

    const where = { incomeSourceId: source.id };
    if (fromDate || toDate) {
      where.billDate = {};
      if (fromDate) where.billDate.gte = new Date(`${fromDate}T00:00:00.000Z`);
      if (toDate) where.billDate.lte = new Date(`${toDate}T23:59:59.999Z`);
    }

    const txns = await prisma.incomeTxn.findMany({
      where,
      include: { rcvdPymts: { include: { paymentMode: true } }, receivables: true },
    });

    let cash = 0, bank = 0, credit = 0;
    for (const txn of txns) {
      for (const pmt of txn.rcvdPymts) {
        const code = pmt.paymentMode?.code;
        const amt = parseFloat(String(pmt.amount)) || 0;
        if (code === "CASH") cash += amt;
        else if (["BANK", "CARD", "UPI", "CHEQUE"].includes(code)) bank += amt;
      }
      for (const rec of txn.receivables) {
        credit += parseFloat(String(rec.dueAmt)) || 0;
      }
    }

    const total = cash + bank + credit;
    res.json({ cash, bank, credit, total });
  } catch (error) {
    console.error("GetPharmaDashboard error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getPharmaTxns = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "", fromDate, toDate, paymentMode, pymtStatus, txnStatus } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const source = await getPharmaSource();
    if (!source) return res.json({ txns: [], pagination: { total: 0, page: 1, pages: 0 } });

    const andConditions = [{ incomeSourceId: source.id }];

    if (search) {
      andConditions.push({
        OR: [
          { billNo: { contains: search, mode: "insensitive" } },
          { patient: { name: { contains: search, mode: "insensitive" } } },
          { patient: { uhid: { contains: search, mode: "insensitive" } } },
          { ipAdm: { ipNo: { contains: search, mode: "insensitive" } } },
        ],
      });
    }

    if (fromDate) andConditions.push({ billDate: { gte: new Date(`${fromDate}T00:00:00.000Z`) } });
    if (toDate) {
      const to = new Date(`${toDate}T23:59:59.999Z`);
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
          patient: { select: { id: true, name: true, uhid: true, mobileNo: true } },
          incomeSource: { select: { code: true, name: true } },
          ipAdm: { select: { id: true, ipNo: true } },
          rcvdPymts: { include: { paymentMode: true } },
          receivables: true,
        },
      }),
      prisma.incomeTxn.count({ where }),
    ]);

    res.json({ txns, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (error) {
    console.error("GetPharmaTxns error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getPharmaTxnDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const txn = await prisma.incomeTxn.findUnique({
      where: { id: parseInt(id) },
      include: {
        patient: true,
        incomeSource: true,
        ipAdm: { select: { id: true, ipNo: true } },
        rcvdPymts: { include: { paymentMode: true } },
        receivables: { include: { bizPartner: true } },
      },
    });
    if (!txn) return res.status(404).json({ message: "Transaction not found" });
    res.json(txn);
  } catch (error) {
    console.error("GetPharmaTxnDetail error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getPharmaImportLogs = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = { fileType: "PHARMA" };
    const [logs, total] = await Promise.all([
      prisma.importLog.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { id: "desc" },
        include: { _count: { select: { errors: true } } },
      }),
      prisma.importLog.count({ where }),
    ]);
    res.json({ logs, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (error) {
    console.error("GetPharmaImportLogs error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getPharmaImportErrors = async (req, res) => {
  try {
    const { id } = req.params;
    const errors = await prisma.importError.findMany({
      where: { importLogId: parseInt(id) },
      orderBy: { rowNumber: "asc" },
      take: 200,
    });
    res.json({ errors });
  } catch (error) {
    console.error("GetPharmaImportErrors error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const toDateStr = (d) => {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString().split("T")[0];
};

const bulkVerifyPharmaTxns = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "ids array is required" });
    }

    const pharmaSource = await prisma.incomeSource.findFirst({ where: { code: "PHARMACY" } })
      || await prisma.incomeSource.findFirst({ where: { code: "PHARMA" } });
    if (!pharmaSource) return res.status(500).json({ message: "PHARMA income source not found" });

    const invalid = await prisma.incomeTxn.findMany({
      where: { id: { in: ids.map(Number) }, incomeSourceId: pharmaSource.id, txn_status: { in: ["ERROR", "REVIEW_REQ"] } },
      select: { id: true, billNo: true, txn_status: true },
    });
    if (invalid.length > 0) {
      return res.status(400).json({
        message: `Cannot verify transactions in ERROR or REVIEW_REQ status: ${invalid.map((t) => `${t.billNo} (${t.txn_status})`).join(", ")}`,
      });
    }

    const result = await prisma.incomeTxn.updateMany({
      where: { id: { in: ids.map(Number) }, incomeSourceId: pharmaSource.id, txn_status: "UNVERIFIED" },
      data: { txn_status: "VERIFIED" },
    });

    res.json({ message: `${result.count} transaction(s) verified`, count: result.count });
  } catch (error) {
    console.error("BulkVerifyPharmaTxns error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const updatePharmaTxn = async (req, res) => {
  try {
    const { id } = req.params;
    const txnId = parseInt(id);
    const { payments } = req.body;

    const txn = await prisma.incomeTxn.findUnique({ where: { id: txnId }, include: { patient: true } });
    if (!txn) return res.status(404).json({ message: "Transaction not found" });

    const unknownBp = await prisma.bizPartner.findFirst({ where: { bpName: "UNKNOWN" } });

    await prisma.rcvdPymt.deleteMany({ where: { incomeTxnId: txnId } });
    await prisma.receivable.deleteMany({ where: { incomeTxnId: txnId } });

    let receivedTotal = 0;
    let creditTotal = 0;
    if (Array.isArray(payments)) {
      const paymentModeIds = [...new Set(
        payments.map((p) => (p.paymentModeId ? parseInt(p.paymentModeId) : null)).filter((v) => Number.isInteger(v)),
      )];
      const modeRows = paymentModeIds.length > 0
        ? await prisma.paymentMode.findMany({ where: { id: { in: paymentModeIds } } })
        : [];
      const modeById = {};
      modeRows.forEach((m) => { modeById[m.id] = m; });

      for (const pmt of payments) {
        if (!pmt.paymentModeId || !pmt.amount) continue;
        const modeId = parseInt(pmt.paymentModeId);
        const modeCode = modeById[modeId]?.code || null;
        const amount = parseFloat(pmt.amount) || 0;
        const paymentDate = pmt.paymentDate ? new Date(pmt.paymentDate) : null;

        if (modeCode === "INSURANCE" || modeCode === "CREDIT" || modeCode === "COMPANY") {
          if (modeCode === "CREDIT") creditTotal += amount;
          else receivedTotal += amount;

          await prisma.receivable.create({
            data: {
              arType: modeCode === "INSURANCE" ? "INSURANCE" : modeCode === "COMPANY" ? "CORPORATE" : "PATIENT",
              bpId: modeCode === "INSURANCE" ? (pmt.insurancePartnerId ? parseInt(pmt.insurancePartnerId) : null) : modeCode === "COMPANY" ? (unknownBp ? unknownBp.id : null) : null,
              patId: txn.patientId,
              incomeTxnId: txnId,
              billDate: txn.billDate || new Date(),
              dueDate: paymentDate,
              dueAmt: amount,
              balanceAmt: amount,
              status: "PENDING",
              remarks: modeCode === "INSURANCE" ? "Insurance receivable" : modeCode === "COMPANY" ? "Company receivable" : "Credit receivable",
              createdBy: req.user?.username || null,
            },
          });
        } else {
          receivedTotal += amount;
          await prisma.rcvdPymt.create({
            data: {
              incomeTxnId: txnId,
              paymentModeId: modeId,
              amount,
              paymentDate,
              transactionNo: pmt.transactionNo || null,
              bankName: pmt.bankName || null,
              paidBy: pmt.paidBy || null,
              remarks: pmt.remarks || null,
            },
          });
        }
      }
    }

    const data = {};
    const net = parseFloat(String(txn.billAmt)) || 0;
    if (receivedTotal >= net - 0.01) data.pymt_status = "FULLYPAID";
    else if (receivedTotal > 0) data.pymt_status = "PARTIALPAID";
    else data.pymt_status = "UNPAID";
    data.txn_status = "VERIFIED";

    await prisma.incomeTxn.update({ where: { id: txnId }, data });

    const updated = await prisma.incomeTxn.findUnique({
      where: { id: txnId },
      include: {
        patient: true,
        incomeSource: true,
        ipAdm: { select: { id: true, ipNo: true } },
        rcvdPymts: { include: { paymentMode: true } },
        receivables: { include: { bizPartner: true } },
      },
    });

    res.json(updated);
  } catch (error) {
    console.error("UpdatePharmaTxn error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  importPharmaBilling,
  getPharmaPaymentModes,
  getPharmaDashboard,
  getPharmaTxns,
  getPharmaTxnDetail,
  getPharmaImportLogs,
  getPharmaImportErrors,
  bulkVerifyPharmaTxns,
  updatePharmaTxn,
};
