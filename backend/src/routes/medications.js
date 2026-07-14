import { Router } from "express";
import { db } from "../db.js";

export const medicationsRouter = Router();

// GET /api/medications?q=parac -> hasta 10 coincidencias
medicationsRouter.get("/", (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) return res.json([]);
  const like = `%${q}%`;
  const rows = db
    .prepare(
      `SELECT id, generic_name, commercial_names, presentation FROM medications_catalog
       WHERE generic_name LIKE ? OR commercial_names LIKE ?
       ORDER BY generic_name LIMIT 10`
    )
    .all(like, like);
  res.json(rows);
});
