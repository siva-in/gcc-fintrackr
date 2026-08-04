const express = require("express");
const multer = require("multer");
const router = express.Router();
const {
  importPharmaBilling,
  getPharmaPaymentModes,
  getPharmaDashboard,
  getPharmaTxns,
  getPharmaTxnDetail,
  getPharmaImportLogs,
  getPharmaImportErrors,
  bulkVerifyPharmaTxns,
  updatePharmaTxn,
} = require("../controllers/incomePharmaController");
const { authenticate, requireCompanyRole } = require("../middleware/auth");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate, requireCompanyRole());

router.get("/dashboard", getPharmaDashboard);
router.get("/txns", getPharmaTxns);
router.get("/txns/:id", getPharmaTxnDetail);
router.put("/txns/:id", updatePharmaTxn);
router.post("/txns/bulk-verify", bulkVerifyPharmaTxns);
router.get("/payment-modes", getPharmaPaymentModes);
router.get("/import-logs", getPharmaImportLogs);
router.get("/import-logs/:id/errors", getPharmaImportErrors);
router.post("/import", upload.single("file"), importPharmaBilling);

module.exports = router;
