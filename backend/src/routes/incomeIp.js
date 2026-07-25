const express = require("express");
const multer = require("multer");
const router = express.Router();
const {
  importIPBilling, importIPDetailReport, getIPDashboard, getIPTxns, getIPTxnDetail,
  updateIPTxnError, reviewIPTxn, getIPDoctorSummary, getIPDoctorPayables,
  recordIPPayablePayment, getIPImportLogs, getIPImportErrors, getIPPaymentModes, getIPInsurancePartners,
} = require("../controllers/incomeIpController");
const { authenticate, requireCompanyRole } = require("../middleware/auth");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate, requireCompanyRole());

router.get("/dashboard", getIPDashboard);
router.get("/doctor-summary", getIPDoctorSummary);
router.get("/txns", getIPTxns);
router.get("/txns/:id", getIPTxnDetail);
router.patch("/txns/:id/error", updateIPTxnError);
router.post("/txns/:id/review", reviewIPTxn);
router.get("/doctor-payables", getIPDoctorPayables);
router.post("/payable-pymts", recordIPPayablePayment);
router.get("/payment-modes", getIPPaymentModes);
router.get("/insurance-partners", getIPInsurancePartners);
router.get("/import-logs", getIPImportLogs);
router.get("/import-logs/:id/errors", getIPImportErrors);
router.post("/import", upload.single("file"), importIPBilling);
router.post("/import-detail", upload.single("file"), importIPDetailReport);

module.exports = router;
