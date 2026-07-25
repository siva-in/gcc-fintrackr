const express = require("express");
const multer = require("multer");
const router = express.Router();
const { importOPBilling, importOPDetailReport, getImportLogs, getImportErrors, getDashboard, getIncomeTxns, getPayables, getDoctorPayableSummary, getIncomeTxnDetail, updateIncomeTxnError, getDoctorPayables, recordPayablePayment, getPaymentModes } = require("../controllers/incomeController");
const { authenticate } = require("../middleware/auth");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate);

router.get("/dashboard", getDashboard);
router.get("/doctor-summary", getDoctorPayableSummary);
router.get("/txns", getIncomeTxns);
router.get("/txns/:id", getIncomeTxnDetail);
router.patch("/txns/:id/error", updateIncomeTxnError);
router.get("/payables", getPayables);
router.get("/payment-modes", getPaymentModes);
router.get("/import-logs", getImportLogs);
router.get("/import-logs/:id/errors", getImportErrors);
router.get("/doctor-payables", getDoctorPayables);
router.post("/payable-pymts", recordPayablePayment);
router.post("/import", upload.single("file"), importOPBilling);
router.post("/import-detail", upload.single("file"), importOPDetailReport);

module.exports = router;
