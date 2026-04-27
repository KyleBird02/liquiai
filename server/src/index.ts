import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import schemaRoutes from "./routes/schema.js";
import changesRoutes from "./routes/changes.js";
import liquibaseRoutes from "./routes/liquibase.js";
import githubRoutes from "./routes/github.js";
import gridRoutes from "./routes/grid.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Register routes
app.use("/api/schema", schemaRoutes);
app.use("/api/changes", changesRoutes);
app.use("/api/liquibase", liquibaseRoutes);
app.use("/api/github", githubRoutes);
app.use("/api/grid", gridRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handling middleware
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    console.error(err.stack);
    res.status(500).json({ error: "Internal server error" });
  },
);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
