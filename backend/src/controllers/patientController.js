const { body, validationResult } = require("express-validator");
const { prisma } = require("../middleware/auth");
const XLSX = require("xlsx");

const EXPECTED_HEADERS = ["Reg.Date", "UHID No", "Patient Name", "Address1", "Age", "Blood Group", "Mobile NO"];
const DUMMY_VALUES = ["--none--", "undefined", "null", "n/a", "na", "-"];

const parseDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) return val;

  // Handle Excel serial date numbers
  if (typeof val === "number") {
    const d = new Date((val - 25569) * 86400 * 1000);
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(val).trim();

  // Handle DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

const parseIntSafe = (val) => {
  if (!val) return null;
  const n = parseInt(String(val).trim(), 10);
  return isNaN(n) ? null : n;
};

const getPatients = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "" } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = search
      ? {
          OR: [
            { patientName: { contains: search, mode: "insensitive" } },
            { uhidNo: { contains: search, mode: "insensitive" } },
            { mobileNo: { contains: search, mode: "insensitive" } },
            { bloodGroup: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: "desc" },
      }),
      prisma.patient.count({ where }),
    ]);

    res.json({ patients, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (error) {
    console.error("GetPatients error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getPatient = async (req, res) => {
  try {
    const patient = await prisma.patient.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!patient) return res.status(404).json({ message: "Patient not found" });
    res.json(patient);
  } catch (error) {
    console.error("GetPatient error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const createPatient = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { regDate, uhidNo, patientName, address1, age, bloodGroup, mobileNo } = req.body;

    let finalUhid = uhidNo || null;
    if (!finalUhid) {
      const count = await prisma.patient.count();
      finalUhid = `FT_${String(count + 1).padStart(4, "0")}`;
    }

    const patient = await prisma.patient.create({
      data: {
        regDate: parseDate(regDate),
        uhidNo: finalUhid,
        patientName,
        address1: address1 || null,
        age: parseIntSafe(age),
        bloodGroup: bloodGroup || null,
        mobileNo: mobileNo || null,
      },
    });

    res.status(201).json(patient);
  } catch (error) {
    console.error("CreatePatient error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const updatePatient = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { regDate, uhidNo, patientName, address1, age, bloodGroup, mobileNo } = req.body;
    const data = {};
    if (regDate !== undefined) data.regDate = parseDate(regDate);
    if (uhidNo !== undefined) data.uhidNo = uhidNo || null;
    if (patientName !== undefined) data.patientName = patientName;
    if (address1 !== undefined) data.address1 = address1 || null;
    if (age !== undefined) data.age = parseIntSafe(age);
    if (bloodGroup !== undefined) data.bloodGroup = bloodGroup || null;
    if (mobileNo !== undefined) data.mobileNo = mobileNo || null;

    const patient = await prisma.patient.update({
      where: { id: parseInt(req.params.id) },
      data,
    });
    res.json(patient);
  } catch (error) {
    console.error("UpdatePatient error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const deletePatient = async (req, res) => {
  try {
    await prisma.patient.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: "Patient deleted" });
  } catch (error) {
    console.error("DeletePatient error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const importPatients = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  try {
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rows.length < 2) return res.status(400).json({ message: "Excel file is empty or has no data rows" });

    // Find header row — scan first 10 rows looking for a row that contains "Patient Name"
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const rowStr = rows[i].map((c) => String(c || "").toLowerCase()).join("|");
      if (rowStr.includes("patient name")) {
        headerRowIndex = i;
        break;
      }
    }
    if (headerRowIndex === -1) {
      return res.status(400).json({ message: "Could not find header row. Expected column 'Patient Name' not found in first 10 rows." });
    }

    const headers = rows[headerRowIndex].map((h) => String(h || "").trim());
    const missing = EXPECTED_HEADERS.filter((h) => !headers.includes(h));
    if (missing.length > 0) {
      return res.status(400).json({ message: `Invalid Excel format. Missing columns: ${missing.join(", ")}. Expected: ${EXPECTED_HEADERS.join(", ")}` });
    }

    const headerIdx = {};
    EXPECTED_HEADERS.forEach((h) => { headerIdx[h] = headers.indexOf(h); });

    const dataRows = rows.slice(headerRowIndex + 1).filter((r) => r.some((c) => c != null && String(c).trim() !== ""));
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    const cleanValue = (val) => {
      if (val == null) return null;
      const s = String(val).trim();
      if (s === "" || DUMMY_VALUES.includes(s.toLowerCase())) return null;
      return s;
    };

    const existingCount = await prisma.patient.count();

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      try {
        const patientName = cleanValue(row[headerIdx["Patient Name"]]);

        if (!patientName) {
          skipped++;
          errors.push({ row: headerRowIndex + 2 + i, reason: "Missing Patient Name" });
          continue;
        }

        const regDate = parseDate(row[headerIdx["Reg.Date"]]);
        const address1 = cleanValue(row[headerIdx["Address1"]]);
        const age = parseIntSafe(row[headerIdx["Age"]]);
        const bloodGroup = cleanValue(row[headerIdx["Blood Group"]]);
        const mobileNo = cleanValue(row[headerIdx["Mobile NO"]]);

        let uhidNo = cleanValue(row[headerIdx["UHID No"]]);
        let existing = null;

        if (uhidNo) {
          existing = await prisma.patient.findFirst({ where: { uhidNo } });
        } else {
          existing = await prisma.patient.findFirst({
            where: { patientName, mobileNo: mobileNo || null },
          });
          if (!existing) {
            uhidNo = `FT_${String(existingCount + created + 1).padStart(4, "0")}`;
          }
        }

        if (existing) {
          await prisma.patient.update({
            where: { id: existing.id },
            data: { regDate, uhidNo: uhidNo || existing.uhidNo, patientName, address1, age, bloodGroup, mobileNo },
          });
          updated++;
        } else {
          await prisma.patient.create({
            data: { regDate, uhidNo, patientName, address1, age, bloodGroup, mobileNo },
          });
          created++;
        }
      } catch (err) {
        skipped++;
        errors.push({ row: headerRowIndex + 2 + i, reason: err.message || "Import failed" });
      }
    }

    res.json({
      message: "Import completed",
      total: dataRows.length,
      created,
      updated,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("ImportPatients error:", error);
    res.status(500).json({ message: "Failed to process file" });
  }
};

module.exports = { getPatients, getPatient, createPatient, updatePatient, deletePatient, importPatients };
module.exports.validation = {
  create: [
    body("patientName").notEmpty().withMessage("Patient name is required"),
    body("regDate").optional().isISO8601(),
    body("uhidNo").optional().isString(),
    body("address1").optional().isString(),
    body("age").optional().isInt({ min: 0, max: 200 }),
    body("bloodGroup").optional().isString(),
    body("mobileNo").optional().isString(),
  ],
  update: [
    body("patientName").optional().notEmpty(),
    body("regDate").optional().isISO8601(),
    body("uhidNo").optional().isString(),
    body("address1").optional().isString(),
    body("age").optional().isInt({ min: 0, max: 200 }),
    body("bloodGroup").optional().isString(),
    body("mobileNo").optional().isString(),
  ],
};
