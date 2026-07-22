const { body, validationResult } = require("express-validator");
const { prisma } = require("../middleware/auth");

const getOrganizations = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "" } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = search ? { name: { contains: search, mode: "insensitive" } } : {};

    const [organizations, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        include: { _count: { select: { requests: true, roles: true } } },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: "desc" },
      }),
      prisma.organization.count({ where }),
    ]);

    const orgs = organizations.map((org) => ({
      ...org,
      _count: { ...org._count, orgUsers: org._count.roles },
    }));

    res.json({ organizations: orgs, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (error) {
    console.error("GetOrganizations error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getOrganization = async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { _count: { select: { requests: true, roles: true } } },
    });

    if (!org) return res.status(404).json({ message: "Organization not found" });

    // Get all users assigned to this org via roles
    const userRoles = await prisma.userRole.findMany({
      where: { role: { orgId: org.id } },
      include: {
        user: { select: { id: true, username: true, firstName: true, lastName: true, mobile: true, status: true } },
        role: { select: { id: true, name: true } },
      },
    });

    const orgUsers = userRoles.map((ur) => ({
      id: ur.id,
      userId: ur.userId,
      role: ur.role.name,
      roleId: ur.role.id,
      user: ur.user,
    }));

    res.json({ ...org, orgUsers });
  } catch (error) {
    console.error("GetOrganization error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const createOrganization = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { name, status } = req.body;

    const org = await prisma.organization.create({
      data: { name, status: status || "ACTIVE" },
    });

    // Auto-create org roles
    const ORG_ROLES = ["MANAGER", "ACCOUNTANT", "LEADER", "HR", "USER"];
    for (const name of ORG_ROLES) {
      await prisma.role.create({
        data: { name, type: "ORG", orgId: org.id },
      });
    }

    res.status(201).json(org);
  } catch (error) {
    console.error("CreateOrganization error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const updateOrganization = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const org = await prisma.organization.update({
      where: { id: parseInt(req.params.id) },
      data: { name: req.body.name, status: req.body.status },
    });
    res.json(org);
  } catch (error) {
    console.error("UpdateOrganization error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const deleteOrganization = async (req, res) => {
  try {
    await prisma.organization.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: "Organization deleted successfully" });
  } catch (error) {
    console.error("DeleteOrganization error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const assignUserRole = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { orgId } = req.params;
    const { userId, role } = req.body;

    const user = await prisma.user.findUnique({ where: { id: parseInt(userId) } });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.userLevel !== "ORG") {
      return res.status(400).json({ message: "Only ORG-level users can be assigned to organizations" });
    }

    const org = await prisma.organization.findUnique({ where: { id: parseInt(orgId) } });
    if (!org) return res.status(404).json({ message: "Organization not found" });

    // Find or create the role
    let roleRecord = await prisma.role.findFirst({
      where: { name: role, type: "ORG", orgId: parseInt(orgId) },
    });

    if (!roleRecord) {
      roleRecord = await prisma.role.create({
        data: { name: role, type: "ORG", orgId: parseInt(orgId) },
      });
    }

    // Upsert the user-role mapping
    const userRole = await prisma.userRole.upsert({
      where: {
        userId_roleId: { userId: parseInt(userId), roleId: roleRecord.id },
      },
      update: {},
      create: { userId: parseInt(userId), roleId: roleRecord.id },
      include: {
        user: { select: { id: true, username: true, firstName: true, lastName: true } },
        role: { select: { id: true, name: true, org: { select: { id: true, name: true } } } },
      },
    });

    res.json(userRole);
  } catch (error) {
    console.error("AssignUserRole error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const removeUserRole = async (req, res) => {
  try {
    const { orgId, userId } = req.params;

    // Find all user-role records for this user in this org
    const userRoles = await prisma.userRole.findMany({
      where: { userId: parseInt(userId), role: { orgId: parseInt(orgId) } },
    });

    for (const ur of userRoles) {
      await prisma.userRole.delete({ where: { id: ur.id } });
    }

    res.json({ message: "User removed from organization" });
  } catch (error) {
    console.error("RemoveUserRole error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getOrganizations, getOrganization, createOrganization, updateOrganization, deleteOrganization, assignUserRole, removeUserRole };
module.exports.validation = {
  create: [
    body("name").notEmpty(),
    body("status").optional().isIn(["ACTIVE", "INACTIVE"]),
  ],
  update: [
    body("name").optional().notEmpty(),
    body("status").optional().isIn(["ACTIVE", "INACTIVE"]),
  ],
  assignRole: [
    body("userId").notEmpty().isInt(),
    body("role").notEmpty().isIn(["MANAGER", "ACCOUNTANT", "LEADER", "HR", "USER"]),
  ],
};
