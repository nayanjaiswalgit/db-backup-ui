import express from "express";
import { PORT } from "./src/config/index.js";
import { logger } from "./src/utils/logger.js";
import routes from "./src/routes/index.js";

const app = express();

app.use(express.json());
app.use(express.static("public"));

app.use("/api", routes);

app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal server error";

  logger.error(`Request error: ${req.method} ${req.path}`, {
    error: message,
    statusCode,
  });

  res.status(statusCode).json({ message });
});

app.listen(PORT, () => {
  logger.success(`Server running on http://localhost:${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
});
