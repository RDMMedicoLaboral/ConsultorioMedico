import { Router } from "express";
import { db } from "../db.js";

export const cie11Router = Router();

// GET /api/cie11?q=diabet  -> hasta 10 coincidencias por código o descripción
cie11Router.get("/", (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) return res.json([]);
  const like = `%${q}%`;
  const rows = db
    .prepare(
      `SELECT code, label FROM cie11_catalog
       WHERE label LIKE ? OR code LIKE ?
       ORDER BY label LIMIT 10`
    )
    .all(like, like);
  res.json(rows);
});
