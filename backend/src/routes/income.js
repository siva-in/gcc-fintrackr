const express = require("express");
const multer = require("multer");
const router = express.Router();
const { importOPBilling, importOPDetailReport, getImportLogs, getImportErrors, getDashboard, getIncomeTxns, getPayables, getDoctorPayableSummary, getIncomeTxnDetail, updateIncomeTxnError, updateIncomeTxnFull, getDoctorPayables, recordPayablePayment, getPaymentModes, bulkVerifyTxns, getInsurancePartners } = require("../controllers/incomeController");
const { authenticate, requireCompanyRole } = require("../middleware/auth");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate, requireCompanyRole());

router.get("/dashboard", getDashboard);
router.get("/doctor-summary", getDoctorPayableSummary);
router.get("/txns", getIncomeTxns);
router.get("/txns/:id", getIncomeTxnDetail);
router.patch("/txns/:id/error", updateIncomeTxnError);
router.put("/txns/:id", updateIncomeTxnFull);
router.post("/txns/bulk-verify", bulkVerifyTxns);
router.get("/payables", getPayables);
router.get("/payment-modes", getPaymentModes);
router.get("/insurance-partners", getInsurancePartners);
router.get("/import-logs", getImportLogs);
router.get("/import-logs/:id/errors", getImportErrors);
router.get("/doctor-payables", getDoctorPayables);
router.post("/payable-pymts", recordPayablePayment);
router.post("/import", upload.single("file"), importOPBilling);
router.post("/import-detail", upload.single("file"), importOPDetailReport);

module.exports = router;
