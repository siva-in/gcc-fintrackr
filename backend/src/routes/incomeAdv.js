const express = require("express");
const multer = require("multer");
const router = express.Router();
const {
  importAdvBilling, getAdvDashboard, getAdvTxns, getAdvTxnDetail,
  getAdvImportLogs, getAdvImportErrors, getAdvPaymentModes,
  bulkRealiseAdvTxns,
} = require("../controllers/incomeAdvController");
const { authenticate, requireCompanyRole } = require("../middleware/auth");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate, requireCompanyRole());

router.get("/dashboard", getAdvDashboard);
router.get("/txns", getAdvTxns);
router.get("/txns/:id", getAdvTxnDetail);
router.get("/payment-modes", getAdvPaymentModes);
router.get("/import-logs", getAdvImportLogs);
router.get("/import-logs/:id/errors", getAdvImportErrors);
router.post("/import", upload.single("file"), importAdvBilling);
router.post("/txns/bulk-realise", bulkRealiseAdvTxns);

module.exports = router;
