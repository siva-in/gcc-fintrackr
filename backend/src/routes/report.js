const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const { getPayableReport, getReceivableReport } = require("../controllers/reportController");

router.get("/payables", authenticate, getPayableReport);
router.get("/receivables", authenticate, getReceivableReport);

module.exports = router;
