const { body, validationResult } = require("express-validator");
const { prisma } = require("../middleware/auth");

const getRequests = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = "" } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = { orgId: req.orgId };
    if (status) where.status = status;

    const [requests, total] = await Promise.all([
      prisma.request.findMany({
        where,
        include: {
          creator: { select: { id: true, username: true, firstName: true, lastName: true } },
          approvals: {
            include: { approver: { select: { id: true, username: true, firstName: true, lastName: true } } },
          },
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: "desc" },
      }),
      prisma.request.count({ where }),
    ]);

    res.json({ requests, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (error) {
    console.error("GetRequests error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getRequest = async (req, res) => {
  try {
    const request = await prisma.request.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        creator: { select: { id: true, username: true, firstName: true, lastName: true } },
        approvals: {
          include: { approver: { select: { id: true, username: true, firstName: true, lastName: true } } },
        },
        organization: { select: { id: true, name: true } },
      },
    });

    if (!request) return res.status(404).json({ message: "Request not found" });
    res.json(request);
  } catch (error) {
    console.error("GetRequest error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const createRequest = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { title, description } = req.body;

    const request = await prisma.request.create({
      data: { orgId: req.orgId, title, description, createdBy: req.user.id, status: "PENDING" },
    });

    // Auto-create pending approvals for all users with LEADER role in this org
    const leaderRole = await prisma.role.findFirst({
      where: { name: "LEADER", type: "ORG", orgId: req.orgId },
    });

    if (leaderRole) {
      const leaders = await prisma.userRole.findMany({
        where: { roleId: leaderRole.id },
      });

      if (leaders.length > 0) {
        await prisma.approval.createMany({
          data: leaders.map((l) => ({
            requestId: request.id,
            approverId: l.userId,
            status: "PENDING",
          })),
        });
      }
    }

    const fullRequest = await prisma.request.findUnique({
      where: { id: request.id },
      include: {
        creator: { select: { id: true, username: true, firstName: true, lastName: true } },
        approvals: {
          include: { approver: { select: { id: true, username: true, firstName: true, lastName: true } } },
        },
      },
    });

    res.status(201).json(fullRequest);
  } catch (error) {
    console.error("CreateRequest error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const approveOrRejectRequest = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { id } = req.params;
    const { status, comment } = req.body;

    const request = await prisma.request.findUnique({
      where: { id: parseInt(id) },
      include: { approvals: true },
    });

    if (!request) return res.status(404).json({ message: "Request not found" });
    if (request.status !== "PENDING") return res.status(400).json({ message: "Request is not pending" });

    const approval = request.approvals.find((a) => a.approverId === req.user.id);
    if (!approval) return res.status(403).json({ message: "You are not an approver for this request" });
    if (approval.status !== "PENDING") return res.status(400).json({ message: "You have already voted" });

    await prisma.approval.update({
      where: { id: approval.id },
      data: { status, comment },
    });

    const updatedApprovals = await prisma.approval.findMany({
      where: { requestId: parseInt(id) },
    });

    const allVoted = updatedApprovals.every((a) => a.status !== "PENDING");

    if (allVoted) {
      const allApproved = updatedApprovals.every((a) => a.status === "APPROVED");
      const anyRejected = updatedApprovals.some((a) => a.status === "REJECTED");
      await prisma.request.update({
        where: { id: parseInt(id) },
        data: { status: anyRejected ? "REJECTED" : allApproved ? "APPROVED" : "REJECTED" },
      });
    }

    const fullRequest = await prisma.request.findUnique({
      where: { id: parseInt(id) },
      include: {
        creator: { select: { id: true, username: true, firstName: true, lastName: true } },
        approvals: {
          include: { approver: { select: { id: true, username: true, firstName: true, lastName: true } } },
        },
      },
    });

    res.json(fullRequest);
  } catch (error) {
    console.error("ApproveOrRejectRequest error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getMyPendingApprovals = async (req, res) => {
  try {
    const approvals = await prisma.approval.findMany({
      where: { approverId: req.user.id, status: "PENDING", request: { orgId: req.orgId } },
      include: {
        request: {
          include: { creator: { select: { id: true, username: true, firstName: true, lastName: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(approvals);
  } catch (error) {
    console.error("GetMyPendingApprovals error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getRequests, getRequest, createRequest, approveOrRejectRequest, getMyPendingApprovals };
module.exports.validation = {
  create: [body("title").notEmpty(), body("description").optional().isString()],
  approve: [body("status").isIn(["APPROVED", "REJECTED"]), body("comment").optional().isString()],
};
