const { prisma } = require("../middleware/auth");
const XLSX = require("xlsx");

const DUMMY_VALUES = ["--none--", "undefined", "null", "n/a", "na", "-"];

const EXPECTED_HEADERS = ["S.No", "Date", "Bill No", "UHID No", "Patient Name", "Terms", "Net Amount", "Mobile No", "Cash_Amt", "Bank Amt", "Credit Amt", "Remarks", "Credit status"];
const DETAIL_HEADERS = ["S.No", "Bill Date", "Bill No", "UHID", "Patient Name", "Description", "Amount", "age", "Sex", "Consult Dr"];

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

const addDays = (dateStr, days) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const toDateOnly = (dateStr) => dateStr ? new Date(`${dateStr}T00:00:00.000Z`) : null;

const importOPBilling = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  const importStarted = new Date();
  let importLogId = null;

  try {
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rows.length < 2) return res.status(400).json({ message: "Excel file is empty or has no data rows" });

    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const rowStr = rows[i].map((c) => String(c || "").toLowerCase()).join("|");
      if (rowStr.includes("bill no") && rowStr.includes("patient name")) {
        headerRowIndex = i;
        break;
      }
    }
    if (headerRowIndex === -1) {
      return res.status(400).json({ message: "Could not find header row. Expected 'Bill No' and 'Patient Name' columns." });
    }

    const headers = rows[headerRowIndex].map((h) => String(h || "").trim());
    const missing = EXPECTED_HEADERS.filter((h) => !headers.includes(h));
    if (missing.length > 0) {
      return res.status(400).json({ message: `Missing columns: ${missing.join(", ")}` });
    }

    const headerIdx = {};
    EXPECTED_HEADERS.forEach((h) => { headerIdx[h] = headers.indexOf(h); });

    const dataRows = rows.slice(headerRowIndex + 1).filter((r) => {
      if (!r.some((c) => c != null && String(c).trim() !== "")) return false;
      const sNo = String(r[0] || "").trim();
      const terms = String(r[5] || "").trim().toLowerCase();
      if (sNo === "" || terms.includes("total") || terms.includes("page total")) return false;
      return true;
    });

    const opSource = await prisma.incomeSource.findFirst({ where: { code: "OP" } });
    if (!opSource) return res.status(500).json({ message: "OP income source not found in database" });

    const allPaymentModes = await prisma.paymentMode.findMany();
    const modeMap = {};
    allPaymentModes.forEach((pm) => { modeMap[pm.code] = pm.id; });

    const importLog = await prisma.importLog.create({
      data: {
        fileName: req.file.originalname,
        fileType: "OP",
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
      try {
        const billNo = cleanValue(row[headerIdx["Bill No"]]);
        if (!billNo) {
          failed++;
          errors.push({ rowNumber: headerRowIndex + 2 + i, rowData: getRowValuesAsText(row, EXPECTED_HEADERS, headerIdx), reason: "Missing Bill No" });
          continue;
        }

        const rowData = getRowValuesAsText(row, EXPECTED_HEADERS, headerIdx);
        const rowNum = headerRowIndex + 2 + i;

        const uhidNo = cleanValue(row[headerIdx["UHID No"]]);
        const patientName = cleanValue(row[headerIdx["Patient Name"]]);
        const mobileNo = cleanValue(row[headerIdx["Mobile No"]]);
        let patientId = null;

        if (uhidNo) {
          const patient = await prisma.patient.findFirst({ where: { uhidNo } });
          if (patient) {
            patientId = patient.id;
          } else {
            failed++;
            errors.push({ rowNumber: rowNum, rowData, reason: `UHID ${uhidNo} not found in database` });
            continue;
          }
        } else if (patientName) {
          const existingPatient = await prisma.patient.findFirst({ where: { patientName } });
          if (existingPatient) {
            patientId = existingPatient.id;
          } else {
            const count = await prisma.patient.count();
            const newUhid = `FT_${String(count + 1).padStart(4, "0")}`;
            const newPatient = await prisma.patient.create({
              data: {
                regDate: new Date(),
                uhidNo: newUhid,
                patientName,
                mobileNo: mobileNo || null,
              },
            });
            patientId = newPatient.id;
          }
        } else {
          failed++;
          errors.push({ rowNumber: rowNum, rowData, reason: "Missing UHID No and Patient Name" });
          continue;
        }

        const billDate = parseDate(row[headerIdx["Date"]]);
        const netAmount = parseDecimal(row[headerIdx["Net Amount"]]);
        const creditStatus = cleanValue(row[headerIdx["Credit status"]]);
        const terms = cleanValue(row[headerIdx["Terms"]]);
        const cashAmt = parseDecimal(row[headerIdx["Cash_Amt"]]) || 0;
        const bankAmt = parseDecimal(row[headerIdx["Bank Amt"]]) || 0;
        const creditAmt = parseDecimal(row[headerIdx["Credit Amt"]]) || 0;
        const isReceived = creditStatus && creditStatus.toLowerCase() === "received";
        const termsLower = (terms || "").toLowerCase();

        if (termsLower === "cash") {
          if (cashAmt <= 0) {
            failed++;
            errors.push({ rowNumber: rowNum, rowData, reason: "TERM=CASH but Cash_Amt is 0 or empty" });
            continue;
          }
          if (creditAmt > 0 && isReceived) {
            failed++;
            errors.push({ rowNumber: rowNum, rowData, reason: "TERM=CASH with Credit_Amt > 0 and Credit status=Received" });
            continue;
          }
        } else if (termsLower === "credit") {
          if (creditAmt <= 0) {
            failed++;
            errors.push({ rowNumber: rowNum, rowData, reason: "TERM=CREDIT but Credit_Amt is 0 or empty" });
            continue;
          }
          if (isReceived) {
            failed++;
            errors.push({ rowNumber: rowNum, rowData, reason: "TERM=CREDIT with Credit status=Received" });
            continue;
          }
        } else {
          if (bankAmt <= 0) {
            failed++;
            errors.push({ rowNumber: rowNum, rowData, reason: `TERM=${terms || "EMPTY"} but Bank_Amt is 0 or empty` });
            continue;
          }
          if (creditAmt > 0 && isReceived) {
            failed++;
            errors.push({ rowNumber: rowNum, rowData, reason: `TERM=${terms} with Credit_Amt > 0 and Credit status=Received` });
            continue;
          }
        }

        const status = isReceived ? "FULLYPAID" : "UNPAID";

        const existing = await prisma.incomeTxn.findFirst({ where: { billNo } });

        let incomeTxn;
        if (existing) {
          incomeTxn = await prisma.incomeTxn.update({
            where: { id: existing.id },
            data: { patientId, billDate: toDateOnly(billDate), grossAmount: netAmount, netAmount, status },
          });
          await prisma.rcvdPymt.deleteMany({ where: { incomeTxnId: existing.id } });
          updated++;
        } else {
          incomeTxn = await prisma.incomeTxn.create({
            data: {
              incomeSourceId: opSource.id, patientId, billNo, billDate: toDateOnly(billDate), ipNo: null,
              grossAmount: netAmount, discountAmount: 0, advAdjt: 0, netAmount, status,
            },
          });
          inserted++;
        }

        const pymtsToCreate = [];

        if (termsLower === "cash") {
          pymtsToCreate.push({ amount: cashAmt, mode: "CASH" });
          if (bankAmt > 0) pymtsToCreate.push({ amount: bankAmt, mode: "UPI" });
          if (creditAmt > 0 && !isReceived) pymtsToCreate.push({ amount: creditAmt, mode: "CREDIT" });
        } else if (termsLower === "credit") {
          if (cashAmt > 0) pymtsToCreate.push({ amount: cashAmt, mode: "CASH" });
          if (bankAmt > 0) pymtsToCreate.push({ amount: bankAmt, mode: "UPI" });
          pymtsToCreate.push({ amount: creditAmt, mode: "CREDIT" });
        } else {
          if (cashAmt > 0) pymtsToCreate.push({ amount: cashAmt, mode: "CASH" });
          pymtsToCreate.push({ amount: bankAmt, mode: "UPI" });
          if (creditAmt > 0 && !isReceived) pymtsToCreate.push({ amount: creditAmt, mode: "CREDIT" });
        }

        for (const pmt of pymtsToCreate) {
          await prisma.rcvdPymt.create({
            data: {
              incomeTxnId: incomeTxn.id,
              paymentModeId: modeMap[pmt.mode] || null,
              amount: pmt.amount,
              paymentDate: toDateOnly(billDate),
              transactionNo: null,
              bankName: null,
              paidBy: "SELF",
              remarks: null,
            },
          });
        }
      } catch (err) {
        failed++;
        errors.push({ rowNumber: headerRowIndex + 2 + i, rowData: getRowValuesAsText(row, EXPECTED_HEADERS, headerIdx), reason: err.message || "Import failed" });
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
      message: "Import completed",
      importLogId: importLog.id,
      total: dataRows.length,
      inserted,
      updated,
      failed,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    });
  } catch (error) {
    console.error("ImportOPBilling error:", error);
    if (importLogId) {
      await prisma.importLog.update({ where: { id: importLogId }, data: { importEnded: new Date() } }).catch(() => {});
    }
    res.status(500).json({ message: "Failed to process file" });
  }
};

const importOPDetailReport = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  const importStarted = new Date();
  let importLogId = null;

  try {
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rows.length < 2) return res.status(400).json({ message: "Excel file is empty or has no data rows" });

    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const rowStr = rows[i].map((c) => String(c || "").toLowerCase()).join("|");
      if (rowStr.includes("bill no") && rowStr.includes("description")) {
        headerRowIndex = i;
        break;
      }
    }
    if (headerRowIndex === -1) {
      return res.status(400).json({ message: "Could not find header row. Expected 'Bill No' and 'Description' columns." });
    }

    const headers = rows[headerRowIndex].map((h) => String(h || "").trim());
    const missing = DETAIL_HEADERS.filter((h) => !headers.includes(h));
    if (missing.length > 0) {
      return res.status(400).json({ message: `Missing columns: ${missing.join(", ")}` });
    }

    const headerIdx = {};
    DETAIL_HEADERS.forEach((h) => { headerIdx[h] = headers.indexOf(h); });

    const dataRows = rows.slice(headerRowIndex + 1).filter((r) => {
      if (!r.some((c) => c != null && String(c).trim() !== "")) return false;
      const sNo = String(r[0] || "").trim();
      const desc = String(r[5] || "").trim().toLowerCase();
      if (sNo === "" || desc.includes("total") || desc.includes("page total")) return false;
      return true;
    });

    const allDoctors = await prisma.doctor.findMany();
    const doctorByDesc = {};
    allDoctors.forEach((doc) => { doctorByDesc[doc.descName.toLowerCase()] = doc.id; });

    const importLog = await prisma.importLog.create({
      data: {
        fileName: req.file.originalname,
        fileType: "OP_DETAIL",
        totalRecords: dataRows.length,
        importStarted,
        createdBy: req.user?.id || null,
      },
    });
    importLogId = importLog.id;

    let inserted = 0;
    let updated = 0;
    let failed = 0;
    let skipped = 0;
    const errors = [];
    const billDetailTotals = {};

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      try {
        const billNo = cleanValue(row[headerIdx["Bill No"]]);
        if (!billNo) {
          failed++;
          errors.push({ rowNumber: headerRowIndex + 2 + i, rowData: getRowValuesAsText(row, DETAIL_HEADERS, headerIdx), reason: "Missing Bill No" });
          continue;
        }

        const description = cleanValue(row[headerIdx["Description"]]);
        const amount = parseDecimal(row[headerIdx["Amount"]]);
        const billDate = parseDate(row[headerIdx["Bill Date"]]);

        if (!amount || amount === 0) {
          failed++;
          errors.push({ rowNumber: headerRowIndex + 2 + i, rowData: getRowValuesAsText(row, DETAIL_HEADERS, headerIdx), reason: "Missing or zero Amount" });
          continue;
        }

        const incomeTxn = await prisma.incomeTxn.findFirst({ where: { billNo } });

        if (!incomeTxn) {
          failed++;
          errors.push({ rowNumber: headerRowIndex + 2 + i, rowData: getRowValuesAsText(row, DETAIL_HEADERS, headerIdx), reason: `Bill No ${billNo} not found in OP billing data` });
          continue;
        }

        if (!billDetailTotals[billNo]) {
          billDetailTotals[billNo] = { txnId: incomeTxn.id, netAmount: parseFloat(String(incomeTxn.netAmount)) || 0, total: 0 };
        }
        billDetailTotals[billNo].total += amount;

        let partyId = null;
        if (description) {
          const matchedId = doctorByDesc[description.toLowerCase()];
          if (matchedId) {
            partyId = matchedId;
          } else {
            skipped++;
            continue;
          }
        } else {
          skipped++;
          continue;
        }

        const patientName = incomeTxn.patient?.patientName || null;

        const dueDate = billDate ? addDays(billDate, 15) : null;

        const existingPayable = await prisma.payable.findFirst({
          where: { incomeTxnId: incomeTxn.id, partyId, billedAmt: amount, remarks: patientName },
        });

        if (existingPayable) {
          await prisma.payable.update({
            where: { id: existingPayable.id },
            data: { billDate: toDateOnly(billDate) || new Date(), dueDate: toDateOnly(dueDate) },
          });
          updated++;
        } else {
          await prisma.payable.create({
            data: {
              payableType: "DOCTOR",
              doctor: { connect: { id: partyId } },
              incomeTxn: { connect: { id: incomeTxn.id } },
              billDate: toDateOnly(billDate) || new Date(),
              dueDate: toDateOnly(dueDate),
              billedAmt: amount,
              payableAmt: null,
              balanceAmt: amount,
              status: "PENDING",
              remarks: patientName,
              createdBy: req.user?.username || null,
            },
          });
          inserted++;
        }
      } catch (err) {
        failed++;
        errors.push({ rowNumber: headerRowIndex + 2 + i, rowData: getRowValuesAsText(row, DETAIL_HEADERS, headerIdx), reason: err.message || "Import failed" });
      }
    }

    for (const billNo of Object.keys(billDetailTotals)) {
      const info = billDetailTotals[billNo];
      if (info.total > info.netAmount + 0.01) {
        const errorReason = `Amount discrepancy: Detail total (${info.total}) > Bill net amount (${info.netAmount})`;
        await prisma.incomeTxn.update({
          where: { id: info.txnId },
          data: { status: "ERROR", errorReason },
        });
        failed++;
        errors.push({ rowNumber: 0, rowData: `Bill No: ${billNo}`, reason: errorReason });
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
      data: { inserted, updated, skipped, failed, importEnded },
    });

    res.json({
      message: "Import completed",
      importLogId: importLog.id,
      total: dataRows.length,
      inserted,
      updated,
      skipped,
      failed,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    });
  } catch (error) {
    console.error("ImportOPDetailReport error:", error);
    if (importLogId) {
      await prisma.importLog.update({ where: { id: importLogId }, data: { importEnded: new Date() } }).catch(() => {});
    }
    res.status(500).json({ message: "Failed to process file" });
  }
};

const getImportLogs = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [logs, total] = await Promise.all([
      prisma.importLog.findMany({
        skip,
        take: parseInt(limit),
        orderBy: { importStarted: "desc" },
        include: { _count: { select: { errors: true } } },
      }),
      prisma.importLog.count(),
    ]);

    res.json({ logs, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (error) {
    console.error("GetImportLogs error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getImportErrors = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await prisma.importLog.findUnique({ where: { id: parseInt(id) } });
    if (!log) return res.status(404).json({ message: "Import log not found" });

    const errors = await prisma.importError.findMany({
      where: { importLogId: parseInt(id) },
      orderBy: { rowNumber: "asc" },
    });

    res.json({ log, errors });
  } catch (error) {
    console.error("GetImportErrors error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getDashboard = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const opSource = await prisma.incomeSource.findFirst({ where: { code: "OP" } });
    if (!opSource) return res.json({ cash: 0, bank: 0, credit: 0, total: 0, doctorFeeLiability: 0 });

    const andConditions = [{ incomeSourceId: opSource.id }];

    if (fromDate) {
      andConditions.push({ billDate: { gte: new Date(fromDate) } });
    }
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      andConditions.push({ billDate: { lte: to } });
    }

    const txns = await prisma.incomeTxn.findMany({
      where: { AND: andConditions },
      include: { rcvdPymts: { include: { paymentMode: true } } },
    });

    let cash = 0;
    let bank = 0;
    let credit = 0;

    for (const txn of txns) {
      for (const pmt of txn.rcvdPymts) {
        const amt = pmt.amount ? parseFloat(String(pmt.amount)) : 0;
        const code = pmt.paymentMode?.code;
        if (code === "CASH") cash += amt;
        else if (code === "BANK" || code === "CARD" || code === "UPI") bank += amt;
        else if (code === "CREDIT") credit += amt;
      }
    }

    const payableWhere = { status: "PENDING" };
    if (fromDate) {
      payableWhere.billDate = { gte: new Date(fromDate) };
    }
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      if (payableWhere.billDate) {
        payableWhere.billDate = { gte: payableWhere.billDate.gte, lte: to };
      } else {
        payableWhere.billDate = { lte: to };
      }
    }

    const pendingPayables = await prisma.payable.aggregate({
      where: payableWhere,
      _sum: { balanceAmt: true },
    });

    const doctorFeeLiability = pendingPayables._sum.balanceAmt ? parseFloat(String(pendingPayables._sum.balanceAmt)) : 0;

    res.json({ cash, bank, credit, total: cash + bank + credit, doctorFeeLiability });
  } catch (error) {
    console.error("GetDashboard error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getIncomeTxns = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "", fromDate, toDate, paymentMode, doctorId, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const opSource = await prisma.incomeSource.findFirst({ where: { code: "OP" } });
    if (!opSource) return res.json({ txns: [], pagination: { total: 0, page: 1, pages: 0 } });

    const andConditions = [{ incomeSourceId: opSource.id }];

    if (search) {
      andConditions.push({
        OR: [
          { billNo: { contains: search, mode: "insensitive" } },
          { patient: { patientName: { contains: search, mode: "insensitive" } } },
          { patient: { uhidNo: { contains: search, mode: "insensitive" } } },
        ],
      });
    }

    if (fromDate) {
      andConditions.push({ billDate: { gte: new Date(fromDate) } });
    }
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
      andConditions.push({ payables: { some: { partyId: parseInt(doctorId) } } });
    }

    if (status) {
      const statuses = status.split(",").map((s) => s.trim().toUpperCase());
      andConditions.push({ status: { in: statuses } });
    }

    const where = { AND: andConditions };

    const [txns, total] = await Promise.all([
      prisma.incomeTxn.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { billDate: "desc" },
        include: {
          patient: { select: { id: true, patientName: true, uhidNo: true, mobileNo: true } },
          rcvdPymts: { include: { paymentMode: true } },
          payables: { include: { doctor: true } },
        },
      }),
      prisma.incomeTxn.count({ where }),
    ]);

    res.json({ txns, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (error) {
    console.error("GetIncomeTxns error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getPayables = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "", fromDate, toDate, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const andConditions = [];

    if (status) {
      andConditions.push({ status });
    } else {
      andConditions.push({ status: { in: ["PENDING", "PARTIALLY_PAID"] } });
    }

    if (search) {
      andConditions.push({
        OR: [
          { remarks: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    if (fromDate) {
      andConditions.push({ billDate: { gte: new Date(fromDate) } });
    }
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      andConditions.push({ billDate: { lte: to } });
    }

    const where = andConditions.length > 0 ? { AND: andConditions } : {};

    const [payables, total] = await Promise.all([
      prisma.payable.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { billDate: "desc" },
        include: {
          incomeTxn: {
            select: {
              id: true,
              billNo: true,
              patient: { select: { id: true, patientName: true, uhidNo: true } },
            },
          },
        },
      }),
      prisma.payable.count({ where }),
    ]);

    const doctorIds = [...new Set(payables.map((p) => p.partyId).filter(Boolean))];
    const doctors = doctorIds.length > 0 ? await prisma.doctor.findMany({ where: { id: { in: doctorIds } }, select: { id: true, name: true, descName: true } }) : [];
    const doctorMap = {};
    doctors.forEach((d) => { doctorMap[d.id] = d; });

    const enriched = payables.map((p) => ({
      ...p,
      doctor: doctorMap[p.partyId] || null,
    }));

    res.json({ payables: enriched, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (error) {
    console.error("GetPayables error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getDoctorPayableSummary = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const where = { status: "PENDING" };
    if (fromDate) where.billDate = { gte: new Date(fromDate) };
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      where.billDate = where.billDate ? { ...where.billDate, lte: to } : { lte: to };
    }

    const payables = await prisma.payable.findMany({
      where,
      select: {
        partyId: true,
        balanceAmt: true,
        incomeTxn: { select: { patient: { select: { patientName: true } } } },
      },
    });

    const doctorTotals = {};
    for (const p of payables) {
      if (!p.partyId) continue;
      if (!doctorTotals[p.partyId]) doctorTotals[p.partyId] = { count: 0, total: 0, patients: [] };
      doctorTotals[p.partyId].count++;
      doctorTotals[p.partyId].total += parseFloat(String(p.balanceAmt)) || 0;
      const name = p.incomeTxn?.patient?.patientName;
      if (name && !doctorTotals[p.partyId].patients.includes(name)) {
        doctorTotals[p.partyId].patients.push(name);
      }
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
    console.error("GetDoctorPayableSummary error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getIncomeTxnDetail = async (req, res) => {
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
    console.error("GetIncomeTxnDetail error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const updateIncomeTxnError = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, errorReason, grossAmount, discountAmount, advAdjt, netAmount } = req.body;

    const txn = await prisma.incomeTxn.findUnique({ where: { id: parseInt(id) } });
    if (!txn) return res.status(404).json({ message: "Transaction not found" });
    if (txn.status !== "ERROR") return res.status(400).json({ message: "Only ERROR records can be updated" });

    const data = {};
    if (status && ["FULLYPAID", "UNPAID"].includes(status)) data.status = status;
    if (errorReason !== undefined) data.errorReason = errorReason || null;
    if (grossAmount !== undefined) data.grossAmount = parseFloat(grossAmount) || 0;
    if (discountAmount !== undefined) data.discountAmount = parseFloat(discountAmount) || 0;
    if (advAdjt !== undefined) data.advAdjt = parseFloat(advAdjt) || 0;
    if (netAmount !== undefined) data.netAmount = parseFloat(netAmount) || 0;

    const updated = await prisma.incomeTxn.update({ where: { id: parseInt(id) }, data });
    res.json(updated);
  } catch (error) {
    console.error("UpdateIncomeTxnError error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getDoctorPayables = async (req, res) => {
  try {
    const { doctorId } = req.query;
    if (!doctorId) return res.status(400).json({ message: "doctorId is required" });

    const payables = await prisma.payable.findMany({
      where: { partyId: parseInt(doctorId), status: { in: ["PENDING", "PARTIALLY_PAID"] } },
      orderBy: { billDate: "desc" },
      include: {
        incomeTxn: { select: { id: true, billNo: true, patient: { select: { id: true, patientName: true, uhidNo: true } } } },
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
    console.error("GetDoctorPayables error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const recordPayablePayment = async (req, res) => {
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
        paymentDate: paymentDate ? new Date(`${paymentDate}T00:00:00.000Z`) : null,
        transactionNo: transactionNo || null,
        bankName: bankName || null,
        paidBy: paidBy || null,
        remarks: remarks || null,
      },
    });

    const newBalance = balance - payAmt;
    const newStatus = newBalance <= 0 ? "PAID" : "PARTIALLY_PAID";

    await prisma.payable.update({
      where: { id: parseInt(payableId) },
      data: { balanceAmt: newBalance, status: newStatus },
    });

    res.json({ payment: pymt, newBalance, newStatus });
  } catch (error) {
    console.error("RecordPayablePayment error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getPaymentModes = async (req, res) => {
  try {
    const modes = await prisma.paymentMode.findMany({ orderBy: { name: "asc" } });
    res.json(modes);
  } catch (error) {
    console.error("GetPaymentModes error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { importOPBilling, importOPDetailReport, getImportLogs, getImportErrors, getDashboard, getIncomeTxns, getPayables, getDoctorPayableSummary, getIncomeTxnDetail, updateIncomeTxnError, getDoctorPayables, recordPayablePayment, getPaymentModes };
