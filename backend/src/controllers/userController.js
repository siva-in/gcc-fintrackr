const { body, validationResult } = require("express-validator");
const { hashPassword } = require("../utils/helpers");
const { prisma } = require("../middleware/auth");

const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "" } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = search
      ? {
          OR: [
            { username: { contains: search, mode: "insensitive" } },
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { mobile: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          mobile: true,
          status: true,
          userLevel: true,
          createdAt: true,
          _count: { select: { userRoles: true } },
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (error) {
    console.error("GetUsers error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getUser = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(req.params.id) },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        mobile: true,
        status: true,
        userLevel: true,
        createdAt: true,
        updatedAt: true,
        userRoles: { include: { role: { include: { org: { select: { id: true, name: true, status: true } } } } } },
      },
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (error) {
    console.error("GetUser error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const createUser = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { username, password, firstName, lastName, mobile, status, userLevel } = req.body;

    if (req.user.userLevel === "ORG" && userLevel === "COMPANY") {
      return res.status(403).json({ message: "ORG-level users cannot create COMPANY-level users" });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) return res.status(409).json({ message: "Username already exists" });

    const hashedPassword = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        firstName,
        lastName,
        mobile,
        status: status || "ACTIVE",
        userLevel: userLevel || "ORG",
      },
      select: { id: true, username: true, firstName: true, lastName: true, mobile: true, status: true, userLevel: true, createdAt: true },
    });

    // If COMPANY level and first company user, assign a default role
    if (user.userLevel === "COMPANY") {
      const companyAdminRole = await prisma.role.findFirst({ where: { name: "VIEWER", type: "COMPANY" } });
      if (companyAdminRole) {
        const hasCompanyRole = await prisma.userRole.findFirst({
          where: { roleId: companyAdminRole.id },
        });
        // Don't auto-assign roles; user will be assigned later by admin
      }
    }

    res.status(201).json(user);
  } catch (error) {
    console.error("CreateUser error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const updateUser = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { id } = req.params;
    const { firstName, lastName, mobile, status, password, userLevel } = req.body;

    if (req.user.userLevel === "ORG" && userLevel === "COMPANY") {
      return res.status(403).json({ message: "ORG-level users cannot set COMPANY level" });
    }

    const user = await prisma.user.findUnique({ where: { id: parseInt(id) } });
    if (!user) return res.status(404).json({ message: "User not found" });

    const data = {};
    if (firstName) data.firstName = firstName;
    if (lastName) data.lastName = lastName;
    if (mobile) data.mobile = mobile;
    if (status) data.status = status;
    if (userLevel) data.userLevel = userLevel;
    if (password) data.password = await hashPassword(password);

    const updated = await prisma.user.update({
      where: { id: parseInt(id) },
      data,
      select: { id: true, username: true, firstName: true, lastName: true, mobile: true, status: true, userLevel: true, updatedAt: true },
    });

    res.json(updated);
  } catch (error) {
    console.error("UpdateUser error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id: parseInt(id) } });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.username === "admin") return res.status(403).json({ message: "Cannot delete the system admin" });

    await prisma.user.delete({ where: { id: parseInt(id) } });
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("DeleteUser error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getUsers, getUser, createUser, updateUser, deleteUser };
module.exports.validation = {
  create: [
    body("username").notEmpty().withMessage("Username is required").isLength({ min: 3 }),
    body("password").notEmpty().withMessage("Password is required").isLength({ min: 6 }),
    body("firstName").notEmpty(),
    body("lastName").notEmpty(),
    body("mobile").notEmpty().matches(/^\d{10}$/).withMessage("Mobile must be exactly 10 digits"),
    body("status").optional().isIn(["ACTIVE", "INACTIVE"]),
    body("userLevel").optional().isIn(["COMPANY", "ORG"]),
  ],
  update: [
    body("firstName").optional().notEmpty(),
    body("lastName").optional().notEmpty(),
    body("mobile").optional().matches(/^\d{10}$/),
    body("status").optional().isIn(["ACTIVE", "INACTIVE"]),
    body("userLevel").optional().isIn(["COMPANY", "ORG"]),
    body("password").optional().isLength({ min: 6 }),
  ],
};
