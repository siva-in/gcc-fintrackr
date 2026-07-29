const express = require("express");
const multer = require("multer");
const router = express.Router();
const {
  importLabBilling, getLabDashboard, getLabTxns, getLabTxnDetail, updateLabTxnError,
  getLabDoctorSummary, getLabDoctorPayables, recordLabPayablePayment,
  getLabImportLogs, getLabImportErrors, getLabPaymentModes, updateLabPayments,
  bulkVerifyLabTxns,
} = require("../controllers/incomeLabController");
const { authenticate, requireCompanyRole } = require("../middleware/auth");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate, requireCompanyRole());

router.get("/dashboard", getLabDashboard);
router.get("/doctor-summary", getLabDoctorSummary);
router.get("/txns", getLabTxns);
router.get("/txns/:id", getLabTxnDetail);
router.patch("/txns/:id/error", updateLabTxnError);
router.get("/doctor-payables", getLabDoctorPayables);
router.post("/payable-pymts", recordLabPayablePayment);
router.get("/payment-modes", getLabPaymentModes);
router.get("/import-logs", getLabImportLogs);
router.get("/import-logs/:id/errors", getLabImportErrors);
router.post("/import", upload.single("file"), importLabBilling);
router.put("/txns/:id/payments", updateLabPayments);
router.post("/txns/bulk-verify", bulkVerifyLabTxns);

module.exports = router;
