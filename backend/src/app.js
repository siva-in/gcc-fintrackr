require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const orgRoutes = require("./routes/organizations");
const roleRoutes = require("./routes/roles");
const doctorRoutes = require("./routes/doctor");
const patientRoutes = require("./routes/patient");
const requestRoutes = require("./routes/requests");
const incomeRoutes = require("./routes/income");
const incomeIpRoutes = require("./routes/incomeIp");
const incomeLabRoutes = require("./routes/incomeLab");
const incomeAdvRoutes = require("./routes/incomeAdv");
const incomePharmaRoutes = require("./routes/incomePharma");
const bizPartnerRoutes = require("./routes/bizPartner");
const configRoutes = require("./routes/config");
const reportRoutes = require("./routes/report");

const app = express();

app.use(helmet());
app.use(morgan("dev"));
app.use(cookieParser());
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:3000", credentials: true }));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/organizations", orgRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/income", incomeRoutes);
app.use("/api/income/ip", incomeIpRoutes);
app.use("/api/income/lab", incomeLabRoutes);
app.use("/api/income/adv", incomeAdvRoutes);
app.use("/api/income/pharma", incomePharmaRoutes);
app.use("/api/biz-partners", bizPartnerRoutes);
app.use("/api/config", configRoutes);
app.use("/api/reports", reportRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || "Internal Server Error" });
});

module.exports = app;
