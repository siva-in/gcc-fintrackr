const { body, validationResult } = require("express-validator");
const { prisma } = require("../middleware/auth");

const getDoctors = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "" } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { degree: { contains: search, mode: "insensitive" } },
            { descName: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    const [doctors, total] = await Promise.all([
      prisma.doctor.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { name: "asc" },
      }),
      prisma.doctor.count({ where }),
    ]);

    res.json({ doctors, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (error) {
    console.error("GetDoctors error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getDoctor = async (req, res) => {
  try {
    const doctor = await prisma.doctor.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });
    res.json(doctor);
  } catch (error) {
    console.error("GetDoctor error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const createDoctor = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { name, degree, descName, isActive } = req.body;
    const doctor = await prisma.doctor.create({
      data: { name, degree, descName, isActive: isActive !== undefined ? isActive : true },
    });
    res.status(201).json(doctor);
  } catch (error) {
    console.error("CreateDoctor error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const updateDoctor = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { name, degree, descName, isActive } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (degree !== undefined) data.degree = degree;
    if (descName !== undefined) data.descName = descName;
    if (isActive !== undefined) data.isActive = isActive;

    const doctor = await prisma.doctor.update({
      where: { id: parseInt(req.params.id) },
      data,
    });
    res.json(doctor);
  } catch (error) {
    console.error("UpdateDoctor error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const deleteDoctor = async (req, res) => {
  try {
    await prisma.doctor.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: "Doctor deleted" });
  } catch (error) {
    console.error("DeleteDoctor error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getDoctors, getDoctor, createDoctor, updateDoctor, deleteDoctor };
module.exports.validation = {
  create: [
    body("name").notEmpty().withMessage("Name is required"),
    body("degree").notEmpty().withMessage("Degree is required"),
    body("descName").notEmpty().withMessage("Desc name is required"),
    body("isActive").optional().isBoolean(),
  ],
  update: [
    body("name").optional().notEmpty(),
    body("degree").optional().notEmpty(),
    body("descName").optional().notEmpty(),
    body("isActive").optional().isBoolean(),
  ],
};
