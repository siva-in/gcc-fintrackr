const { body, validationResult } = require("express-validator");
const { prisma } = require("../middleware/auth");

const getRoleAssignments = async (req, res) => {
  try {
    const userRoles = await prisma.userRole.findMany({
      include: {
        user: { select: { id: true, username: true, firstName: true, lastName: true, mobile: true, status: true, userLevel: true } },
        role: { select: { id: true, name: true, type: true, orgId: true, org: { select: { id: true, name: true } } } },
      },
      orderBy: [{ role: { type: "asc" } }, { user: { firstName: "asc" } }],
    });

    res.json({ assignments: userRoles });
  } catch (error) {
    console.error("GetRoleAssignments error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const assignRole = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { userId, roleName, type, orgId } = req.body;

    const user = await prisma.user.findUnique({ where: { id: parseInt(userId) } });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (type === "COMPANY" && user.userLevel !== "COMPANY") {
      return res.status(400).json({ message: "Only COMPANY-level users can be assigned company roles" });
    }
    if (type === "ORG" && user.userLevel !== "ORG") {
      return res.status(400).json({ message: "Only ORG-level users can be assigned org roles" });
    }

    const where = type === "COMPANY"
      ? { name: roleName, type: "COMPANY" }
      : { name: roleName, type: "ORG", orgId: parseInt(orgId) };

    let roleRecord = await prisma.role.findFirst({ where });

    if (!roleRecord) {
      roleRecord = await prisma.role.create({
        data: { name: roleName, type, ...(type === "ORG" ? { orgId: parseInt(orgId) } : {}) },
      });
    }

    const userRole = await prisma.userRole.upsert({
      where: { userId_roleId: { userId: parseInt(userId), roleId: roleRecord.id } },
      update: {},
      create: { userId: parseInt(userId), roleId: roleRecord.id },
      include: {
        user: { select: { id: true, username: true, firstName: true, lastName: true } },
        role: { select: { id: true, name: true, type: true, org: { select: { id: true, name: true } } } },
      },
    });

    res.json(userRole);
  } catch (error) {
    console.error("AssignRole error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getRoles = async (req, res) => {
  try {
    const roles = await prisma.role.findMany({
      include: {
        org: { select: { id: true, name: true } },
        _count: { select: { userRoles: true } },
      },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
    res.json({ roles });
  } catch (error) {
    console.error("GetRoles error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const createRole = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { name, type, orgId } = req.body;

    const existing = await prisma.role.findFirst({
      where: type === "COMPANY"
        ? { name, type: "COMPANY", orgId: null }
        : { name, type: "ORG", orgId: parseInt(orgId) },
    });
    if (existing) return res.status(400).json({ message: `Role "${name}" already exists${type === "ORG" ? " in this organization" : ""}` });

    const role = await prisma.role.create({
      data: { name, type, ...(type === "ORG" && orgId ? { orgId: parseInt(orgId) } : {}) },
      include: { org: { select: { id: true, name: true } } },
    });

    res.status(201).json(role);
  } catch (error) {
    console.error("CreateRole error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const updateRole = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { id } = req.params;
    const { name } = req.body;

    const role = await prisma.role.findUnique({ where: { id: parseInt(id) } });
    if (!role) return res.status(404).json({ message: "Role not found" });

    const duplicate = await prisma.role.findFirst({
      where: { name, type: role.type, orgId: role.orgId, id: { not: parseInt(id) } },
    });
    if (duplicate) return res.status(400).json({ message: `Role "${name}" already exists` });

    const updated = await prisma.role.update({
      where: { id: parseInt(id) },
      data: { name },
      include: { org: { select: { id: true, name: true } } },
    });

    res.json(updated);
  } catch (error) {
    console.error("UpdateRole error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const deleteRole = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.role.delete({ where: { id: parseInt(id) } });
    res.json({ message: "Role deleted" });
  } catch (error) {
    console.error("DeleteRole error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const removeRoleAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.userRole.delete({ where: { id: parseInt(id) } });
    res.json({ message: "Role assignment removed" });
  } catch (error) {
    console.error("RemoveRoleAssignment error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getRoleAssignments, assignRole, removeRoleAssignment, getRoles, createRole, updateRole, deleteRole };
module.exports.validation = {
  assign: [
    body("userId").notEmpty().isInt(),
    body("roleName").notEmpty(),
    body("type").isIn(["COMPANY", "ORG"]),
    body("orgId").optional({ nullable: true }),
  ],
  createRole: [
    body("name").notEmpty().trim(),
    body("type").isIn(["COMPANY", "ORG"]),
    body("orgId").optional({ nullable: true }),
  ],
  updateRole: [
    body("name").notEmpty().trim(),
  ],
};
