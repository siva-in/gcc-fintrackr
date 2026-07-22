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

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || "Internal Server Error" });
});

module.exports = app;
