const { prisma } = require("../middleware/auth");

const getPayableReport = async (req, res) => {
  try {
    const { page = 1, limit = 20, fromDate, toDate, status, partyType, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const andConditions = [];

    if (status) {
      andConditions.push({ status });
    } else {
      andConditions.push({ status: { in: ["PENDING", "PARTIALLY_PAID"] } });
    }

    if (partyType) {
      andConditions.push({ partyType });
    }

    if (fromDate) {
      andConditions.push({ billDate: { gte: new Date(fromDate) } });
    }
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      andConditions.push({ billDate: { lte: to } });
    }

    if (search) {
      andConditions.push({
        OR: [
          { remarks: { contains: search, mode: "insensitive" } },
          { incomeTxn: { billNo: { contains: search, mode: "insensitive" } } },
        ],
      });
    }

    const where = andConditions.length > 0 ? { AND: andConditions } : {};

    const [payables, total] = await Promise.all([
      prisma.payable.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: [{ billDate: "desc" }, { id: "desc" }],
        include: {
          incomeTxn: {
            select: {
              id: true,
              billNo: true,
              billDate: true,
              billAmt: true,
              incomeSource: { select: { code: true, name: true } },
              patient: { select: { id: true, name: true, uhid: true } },
            },
          },
          doctor: { select: { id: true, name: true } },
          bizPartner: { select: { id: true, bpName: true } },
        },
      }),
      prisma.payable.count({ where }),
    ]);

    const totalPayableAmt = payables.reduce((sum, p) => sum + parseFloat(String(p.payableAmt || 0)), 0);
    const totalBalanceAmt = payables.reduce((sum, p) => sum + parseFloat(String(p.balanceAmt || 0)), 0);

    res.json({
      payables,
      summary: { totalPayableAmt, totalBalanceAmt, count: total },
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    console.error("GetPayableReport error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getReceivableReport = async (req, res) => {
  try {
    const { page = 1, limit = 20, fromDate, toDate, status, arType, source, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const andConditions = [];

    if (status) {
      const statuses = String(status).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
      if (statuses.length > 0) andConditions.push({ status: { in: statuses } });
    }

    if (arType) {
      andConditions.push({ arType });
    }

    if (source) {
      andConditions.push({ incomeTxn: { incomeSource: { code: source } } });
    }

    if (fromDate) {
      andConditions.push({ billDate: { gte: new Date(fromDate) } });
    }
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      andConditions.push({ billDate: { lte: to } });
    }

    if (search) {
      andConditions.push({
        OR: [
          { patient: { name: { contains: search, mode: "insensitive" } } },
          { patient: { uhid: { contains: search, mode: "insensitive" } } },
          { incomeTxn: { billNo: { contains: search, mode: "insensitive" } } },
        ],
      });
    }

    const where = andConditions.length > 0 ? { AND: andConditions } : {};

    const [receivables, total, agingRows] = await Promise.all([
      prisma.receivable.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: [{ billDate: "desc" }, { id: "desc" }],
        include: {
          patient: { select: { id: true, name: true, uhid: true, mobileNo: true } },
          bizPartner: { select: { id: true, bpName: true } },
          incomeTxn: {
            select: {
              id: true,
              billNo: true,
              billDate: true,
              billAmt: true,
              incomeSource: { select: { code: true, name: true } },
            },
          },
        },
      }),
      prisma.receivable.count({ where }),
      prisma.receivable.findMany({
        where,
        select: {
          dueAmt: true,
          balanceAmt: true,
          dueDate: true,
          incomeTxn: { select: { incomeSource: { select: { code: true, name: true } } } },
        },
      }),
    ]);

    const totalDueAmt = agingRows.reduce((sum, r) => sum + parseFloat(String(r.dueAmt || 0)), 0);
    const totalBalanceAmt = agingRows.reduce((sum, r) => sum + parseFloat(String(r.balanceAmt || 0)), 0);

    const aging = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0 };
    const now = Date.now();
    const DAY = 86400000;
    const sourceMap = {};
    for (const r of agingRows) {
      const bal = parseFloat(String(r.balanceAmt)) || 0;
      let days = 0;
      if (r.dueDate) {
        const due = new Date(r.dueDate).getTime();
        days = Math.floor((now - due) / DAY);
      }
      if (days <= 0) aging.current += bal;
      else if (days <= 30) aging.d1_30 += bal;
      else if (days <= 60) aging.d31_60 += bal;
      else if (days <= 90) aging.d61_90 += bal;
      else aging.d90 += bal;

      const code = r.incomeTxn?.incomeSource?.code || "OTHER";
      const name = r.incomeTxn?.incomeSource?.name || "Other";
      if (!sourceMap[code]) sourceMap[code] = { code, name, dueAmt: 0, balanceAmt: 0 };
      sourceMap[code].dueAmt += parseFloat(String(r.dueAmt || 0));
      sourceMap[code].balanceAmt += bal;
    }
    const bySource = Object.values(sourceMap).map((s) => ({
      ...s,
      dueAmt: Number(s.dueAmt.toFixed(2)),
      balanceAmt: Number(s.balanceAmt.toFixed(2)),
      receivedAmt: Number((s.dueAmt - s.balanceAmt).toFixed(2)),
    }));

    const [modeGroups, paymentModes, pendingBills] = await Promise.all([
      prisma.rcvlPymt.groupBy({
        by: ["paymentModeId"],
        where: { receivable: where },
        _sum: { amount: true },
      }),
      prisma.paymentMode.findMany({ select: { id: true, code: true, name: true } }),
      prisma.receivable.count({ where: { AND: [...andConditions, { status: { not: "PAID" } }] } }),
    ]);
    const modeNameMap = new Map(paymentModes.map((m) => [m.id, m]));
    const modeMap = {};
    for (const g of modeGroups) {
      const mode = g.paymentModeId != null ? modeNameMap.get(g.paymentModeId) : null;
      const code = mode?.code || "OTHER";
      const name = mode?.name || "Other";
      if (!modeMap[code]) modeMap[code] = { code, name, amount: 0 };
      modeMap[code].amount += parseFloat(String(g._sum.amount || 0));
    }
    const byMode = Object.values(modeMap)
      .map((m) => ({ ...m, amount: Number(m.amount.toFixed(2)) }))
      .sort((a, b) => b.amount - a.amount);

    res.json({
      receivables,
      summary: { totalDueAmt, totalBalanceAmt, count: total },
      pendingBills,
      aging,
      bySource,
      byMode,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    console.error("GetReceivableReport error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getIncomeSources = async (_req, res) => {
  try {
    const sources = await prisma.incomeSource.findMany({
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    });
    res.json(sources);
  } catch (error) {
    console.error("GetIncomeSources error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const round2 = (n) => Math.round(n * 100) / 100;

const getIPAdmissionReport = async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const andConditions = [];
    const s = String(search || "").trim();
    if (s) {
      andConditions.push({
        OR: [
          { ipNo: { contains: s, mode: "insensitive" } },
          { patient: { name: { contains: s, mode: "insensitive" } } },
          { patient: { uhid: { contains: s, mode: "insensitive" } } },
          { incomeTxns: { some: { incomeSource: { code: "IP" }, billNo: { contains: s, mode: "insensitive" } } } },
        ],
      });
    }

    const where = andConditions.length > 0 ? { AND: andConditions } : {};

    const [adms, total] = await Promise.all([
      prisma.iPAdm.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: [{ date: "desc" }, { id: "desc" }],
        include: {
          patient: { select: { id: true, name: true, uhid: true } },
          incomeTxns: {
            select: {
              billAmt: true,
              incomeSource: { select: { code: true } },
              payables: { select: { balanceAmt: true, status: true } },
              receivables: { select: { balanceAmt: true, status: true } },
            },
          },
        },
      }),
      prisma.iPAdm.count({ where }),
    ]);

    const rows = adms.map((adm) => {
      let ipAmt = 0;
      let pharmaAmt = 0;
      let labAmt = 0;
      let payable = 0;
      let receivable = 0;
      for (const txn of adm.incomeTxns) {
        const amt = parseFloat(String(txn.billAmt)) || 0;
        const code = txn.incomeSource?.code;
        if (code === "IP") ipAmt += amt;
        else if (code === "PHARMACY" || code === "PHARMA") pharmaAmt += amt;
        else if (code === "LAB") labAmt += amt;
        for (const p of txn.payables) {
          if (p.status === "PENDING" || p.status === "PARTIALLY_PAID") {
            payable += parseFloat(String(p.balanceAmt)) || 0;
          }
        }
        for (const r of txn.receivables) {
          if (r.status === "PENDING" || r.status === "PARTIALLY_PAID") {
            receivable += parseFloat(String(r.balanceAmt)) || 0;
          }
        }
      }
      return {
        id: adm.id,
        ipNo: adm.ipNo,
        status: adm.status,
        admittedDate: adm.date,
        dischargeDate: adm.dischargeDt,
        patient: adm.patient,
        ipBillAmt: round2(ipAmt),
        pharmaBillAmt: round2(pharmaAmt),
        labBillAmt: round2(labAmt),
        totalAmt: round2(ipAmt + pharmaAmt + labAmt),
        totalPayable: round2(payable),
        totalReceivables: round2(receivable),
      };
    });

    res.json({
      rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    console.error("GetIPAdmissionReport error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getIncomeSummary = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const where = {};
    if (fromDate || toDate) {
      where.billDate = {};
      if (fromDate) where.billDate.gte = new Date(`${fromDate}T00:00:00.000Z`);
      if (toDate) where.billDate.lte = new Date(`${toDate}T23:59:59.999Z`);
    }

    const [grouped, sources] = await Promise.all([
      prisma.incomeTxn.groupBy({ by: ["incomeSourceId"], where, _sum: { billAmt: true } }),
      prisma.incomeSource.findMany(),
    ]);

    const sourceMap = {};
    sources.forEach((s) => { sourceMap[s.id] = s; });

    const byCode = {};
    for (const g of grouped) {
      const src = sourceMap[g.incomeSourceId];
      if (!src) continue;
      if (!byCode[src.code]) byCode[src.code] = { code: src.code, name: src.name, total: 0 };
      byCode[src.code].total += parseFloat(String(g._sum.billAmt)) || 0;
    }

    // Split ADV into realised/unrealised; realised advances count toward IP income
    // attributed by the IP bill date they were applied to (realisedByTxn)
    const advSource = sources.find((s) => s.code === "ADV");
    if (advSource) {
      const dateCond = where.billDate ? { billDate: where.billDate } : {};
      const realisedAgg = await prisma.incomeTxn.aggregate({
        where: {
          incomeSourceId: advSource.id,
          pymt_status: "REALISED",
          realisedByTxn: { incomeSource: { code: "IP" }, ...dateCond },
        },
        _sum: { billAmt: true },
      });
      const realisedAdv = parseFloat(String(realisedAgg._sum.billAmt)) || 0;

      const unrealisedAgg = await prisma.incomeTxn.aggregate({
        where: { ...where, incomeSourceId: advSource.id, pymt_status: { not: "REALISED" } },
        _sum: { billAmt: true },
      });
      const unrealisedAdv = parseFloat(String(unrealisedAgg._sum.billAmt)) || 0;

      if (byCode["ADV"]) byCode["ADV"].total = unrealisedAdv;
      if (byCode["IP"]) byCode["IP"].total += realisedAdv;
      else if (realisedAdv > 0) byCode["IP"] = { code: "IP", name: "In Patient", total: realisedAdv };
    }

    const order = ["OP", "IP", "LAB", "PHARMACY", "PHARMA"];
    const rows = order
      .filter((c) => byCode[c])
      .map((c) => byCode[c])
      .concat(Object.values(byCode).filter((r) => !order.includes(r.code)));

    res.json({ sources: rows, total: rows.reduce((sum, r) => sum + r.total, 0) });
  } catch (error) {
    console.error("GetIncomeSummary error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getBookOfAccounts = async (req, res) => {
  try {
    const { source = "ALL", fromDate, toDate } = req.query;

    const dateFilter = {};
    if (fromDate) dateFilter.gte = new Date(`${fromDate}T00:00:00.000Z`);
    if (toDate) dateFilter.lte = new Date(`${toDate}T23:59:59.999Z`);

    const paymentModes = await prisma.paymentMode.findMany();
    const modeCodeById = {};
    paymentModes.forEach((m) => { modeCodeById[m.id] = m.code; });

    const isCash = (code) => code === "CASH";
    const isBank = (code) => ["BANK", "NEFT", "CHEQUE", "UPI", "CARD"].includes(code);
    const split = (rows) => {
      let cash = 0, bank = 0, total = 0;
      for (const r of rows) {
        const amt = parseFloat(String(r._sum.amount)) || 0;
        const code = modeCodeById[r.paymentModeId];
        total += amt;
        if (isCash(code)) cash += amt;
        else if (isBank(code)) bank += amt;
      }
      return { cash, bank, total };
    };

    const requested = source === "ALL"
      ? [["OP", "Out Patient"], ["IP", "In Patient"], ["LAB", "Lab"], ["PHARMACY", "Pharma"]]
      : [[source, source]];

    const advSource = await prisma.incomeSource.findFirst({ where: { code: "ADV" } });
    let advanceCollected = { cash: 0, bank: 0, total: 0 };
    if (advSource) {
      const advPmts = await prisma.rcvdPymt.groupBy({
        by: ["paymentModeId"],
        where: { paymentDate: dateFilter, incomeTxn: { incomeSourceId: advSource.id } },
        _sum: { amount: true },
      });
      advanceCollected = split(advPmts);
    }

    const rows = [];
    for (const [code, name] of requested) {
      let sourceRec = await prisma.incomeSource.findFirst({ where: { code } });
      if (!sourceRec && code === "PHARMACY") {
        sourceRec = await prisma.incomeSource.findFirst({ where: { code: "PHARMA" } });
      }
      if (!sourceRec) continue;
      const sid = sourceRec.id;

      const [newCreditAgg, advAdjAgg, creditPmts, incomePmts] = await Promise.all([
        prisma.receivable.aggregate({
          where: { billDate: dateFilter, incomeTxn: { incomeSourceId: sid } },
          _sum: { dueAmt: true },
        }),
        prisma.incomeTxn.aggregate({
          where: { incomeSourceId: sid, billDate: dateFilter },
          _sum: { advAdjt: true },
        }),
        prisma.rcvlPymt.groupBy({
          by: ["paymentModeId"],
          where: { paymentDate: dateFilter, receivable: { incomeTxn: { incomeSourceId: sid } } },
          _sum: { amount: true },
        }),
        prisma.rcvdPymt.groupBy({
          by: ["paymentModeId"],
          where: { paymentDate: dateFilter, incomeTxn: { incomeSourceId: sid } },
          _sum: { amount: true },
        }),
      ]);

      rows.push({
        sourceCode: code,
        source: name,
        newCredit: parseFloat(String(newCreditAgg._sum.dueAmt)) || 0,
        advanceAdjusted: parseFloat(String(advAdjAgg._sum.advAdjt)) || 0,
        advanceCollected: code === "IP" ? advanceCollected : { cash: 0, bank: 0, total: 0 },
        creditCollected: split(creditPmts),
        income: split(incomePmts),
      });
    }

    res.json({ rows });
  } catch (error) {
    console.error("GetBookOfAccounts error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getReportPaymentModes = async (_req, res) => {
  try {
    const modes = await prisma.paymentMode.findMany({ orderBy: { name: "asc" } });
    res.json(modes);
  } catch (error) {
    console.error("GetReportPaymentModes error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const recordReceivablePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, paymentModeId, paymentDate, transactionNo, bankName, paidBy, remarks } = req.body;

    const rcvlId = parseInt(id);
    if (!rcvlId) return res.status(400).json({ message: "Invalid receivable id" });

    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return res.status(400).json({ message: "Amount must be greater than zero" });

    const receivable = await prisma.receivable.findUnique({ where: { id: rcvlId } });
    if (!receivable) return res.status(404).json({ message: "Receivable not found" });

    if (!["INSURANCE", "CORPORATE"].includes(receivable.arType)) {
      return res.status(400).json({ message: "Payments can only be recorded for Insurance or Company receivables" });
    }

    const balanceAmt = parseFloat(String(receivable.balanceAmt)) || 0;
    if (amt > balanceAmt + 0.01) {
      return res.status(400).json({ message: `Payment amount exceeds balance of ${balanceAmt}` });
    }

    if (!paymentModeId) return res.status(400).json({ message: "Payment mode is required" });
    const mode = await prisma.paymentMode.findUnique({ where: { id: parseInt(paymentModeId) } });
    if (!mode) return res.status(400).json({ message: "Invalid payment mode" });

    const newBalance = Math.max(0, Math.round((balanceAmt - amt) * 100) / 100);

    await prisma.$transaction([
      prisma.receivable.update({
        where: { id: rcvlId },
        data: { balanceAmt: newBalance, status: newBalance <= 0 ? "PAID" : "PARTIALLY_PAID" },
      }),
      prisma.rcvlPymt.create({
        data: {
          rcvlId,
          paymentModeId: mode.id,
          amount: amt,
          paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
          transactionNo: transactionNo || null,
          bankName: bankName || null,
          paidBy: paidBy || "SELF",
          remarks: remarks || null,
        },
      }),
    ]);

    res.json({ message: "Payment recorded successfully", balanceAmt: newBalance, status: newBalance <= 0 ? "PAID" : "PARTIALLY_PAID" });
  } catch (error) {
    console.error("RecordReceivablePayment error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getPayableReport, getReceivableReport, getIncomeSources, getIPAdmissionReport, getIncomeSummary, getBookOfAccounts, getReportPaymentModes, recordReceivablePayment };
