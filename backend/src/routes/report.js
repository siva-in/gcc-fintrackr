const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const { getPayableReport, getReceivableReport, getIncomeSources, getIPAdmissionReport, getIncomeSummary } = require("../controllers/reportController");

router.get("/payables", authenticate, getPayableReport);
router.get("/receivables", authenticate, getReceivableReport);
router.get("/income-sources", authenticate, getIncomeSources);
router.get("/ip-admissions", authenticate, getIPAdmissionReport);
router.get("/income-summary", authenticate, getIncomeSummary);

module.exports = router;
