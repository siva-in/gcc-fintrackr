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
        orderBy: { billDate: "desc" },
        include: {
          incomeTxn: {
            select: {
              id: true,
              billNo: true,
              billDate: true,
              netAmount: true,
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
    const { page = 1, limit = 20, fromDate, toDate, status, arType, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const andConditions = [];

    if (status) {
      if (status === "PENDING") andConditions.push({ status: "PENDING" });
      else andConditions.push({ status: "PAID" });
    } else {
      andConditions.push({ status: "PENDING" });
    }

    if (arType) {
      andConditions.push({ arType });
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
        orderBy: { billDate: "desc" },
        include: {
          patient: { select: { id: true, name: true, uhid: true, mobileNo: true } },
          bizPartner: { select: { id: true, bpName: true } },
          incomeTxn: {
            select: {
              id: true,
              billNo: true,
              billDate: true,
              netAmount: true,
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

module.exports = { getPayableReport, getReceivableReport };
