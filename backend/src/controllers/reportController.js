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

    const [receivables, total] = await Promise.all([
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
    ]);

    const totalDueAmt = receivables.reduce((sum, r) => sum + parseFloat(String(r.dueAmt || 0)), 0);
    const totalBalanceAmt = receivables.reduce((sum, r) => sum + parseFloat(String(r.balanceAmt || 0)), 0);

    res.json({
      receivables,
      summary: { totalDueAmt, totalBalanceAmt, count: total },
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

module.exports = { getPayableReport, getReceivableReport, getIncomeSources, getIPAdmissionReport, getIncomeSummary, getBookOfAccounts };
