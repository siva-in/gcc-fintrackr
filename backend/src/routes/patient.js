const express = require("express");
const multer = require("multer");
const router = express.Router();
const { getPatients, getPatient, createPatient, updatePatient, deletePatient, importPatients, validation } = require("../controllers/patientController");
const { authenticate } = require("../middleware/auth");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate);

router.get("/", getPatients);
router.get("/:id", getPatient);
router.post("/", validation.create, createPatient);
router.put("/:id", validation.update, updatePatient);
router.delete("/:id", deletePatient);
router.post("/import", upload.single("file"), importPatients);

module.exports = router;
