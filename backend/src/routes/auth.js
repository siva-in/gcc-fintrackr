const express = require("express");
const router = express.Router();
const { login, getMe, validation } = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");

router.post("/login", validation.login, login);
router.get("/me", authenticate, getMe);

module.exports = router;
