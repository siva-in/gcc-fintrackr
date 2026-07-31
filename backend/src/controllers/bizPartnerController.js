const { body, validationResult } = require("express-validator");
const { prisma } = require("../middleware/auth");

const getBizPartners = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "", bpType } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (search) {
      where.OR = [
        { bpName: { contains: search, mode: "insensitive" } },
        { contactName: { contains: search, mode: "insensitive" } },
        { mobile: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }
    if (bpType) where.bpType = bpType;

    const [bizPartners, total] = await Promise.all([
      prisma.bizPartner.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { bpName: "asc" },
      }),
      prisma.bizPartner.count({ where }),
    ]);

    res.json({ bizPartners, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (error) {
    console.error("GetBizPartners error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getBizPartner = async (req, res) => {
  try {
    const bizPartner = await prisma.bizPartner.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!bizPartner) return res.status(404).json({ message: "Business Partner not found" });
    res.json(bizPartner);
  } catch (error) {
    console.error("GetBizPartner error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const createBizPartner = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { bpType, bpName, contactName, mobile, email, address, gstNumber, isActive } = req.body;
    const bizPartner = await prisma.bizPartner.create({
      data: {
        bpType,
        bpName,
        contactName: contactName || null,
        mobile: mobile || null,
        email: email || null,
        address: address || null,
        gstNumber: gstNumber || null,
        isActive: isActive !== undefined ? isActive : true,
      },
    });
    res.status(201).json(bizPartner);
  } catch (error) {
    console.error("CreateBizPartner error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const updateBizPartner = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { bpType, bpName, contactName, mobile, email, address, gstNumber, isActive } = req.body;
    const data = {};
    if (bpType !== undefined) data.bpType = bpType;
    if (bpName !== undefined) data.bpName = bpName;
    if (contactName !== undefined) data.contactName = contactName;
    if (mobile !== undefined) data.mobile = mobile;
    if (email !== undefined) data.email = email;
    if (address !== undefined) data.address = address;
    if (gstNumber !== undefined) data.gstNumber = gstNumber;
    if (isActive !== undefined) data.isActive = isActive;

    const bizPartner = await prisma.bizPartner.update({
      where: { id: parseInt(req.params.id) },
      data,
    });
    res.json(bizPartner);
  } catch (error) {
    console.error("UpdateBizPartner error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const deleteBizPartner = async (req, res) => {
  try {
    await prisma.bizPartner.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: "Business Partner deleted" });
  } catch (error) {
    console.error("DeleteBizPartner error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getBizPartners, getBizPartner, createBizPartner, updateBizPartner, deleteBizPartner };
module.exports.validation = {
  create: [
    body("bpType").isIn(["VENDOR", "INSURANCE", "CORPORATE", "LAB", "RADIOLOGY", "GOVERNMENT", "OTHER", "REFERRAL"]).withMessage("Invalid business partner type"),
    body("bpName").notEmpty().withMessage("Name is required"),
    body("contactName").optional(),
    body("mobile").optional(),
    body("email").optional().isEmail().withMessage("Invalid email"),
    body("address").optional(),
    body("gstNumber").optional(),
    body("isActive").optional().isBoolean(),
  ],
  update: [
    body("bpType").optional().isIn(["VENDOR", "INSURANCE", "CORPORATE", "LAB", "RADIOLOGY", "GOVERNMENT", "OTHER", "REFERRAL"]),
    body("bpName").optional().notEmpty(),
    body("contactName").optional(),
    body("mobile").optional(),
    body("email").optional().isEmail().withMessage("Invalid email"),
    body("address").optional(),
    body("gstNumber").optional(),
    body("isActive").optional().isBoolean(),
  ],
};
