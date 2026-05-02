// routes/carteras.js
const express = require("express");
const db      = require("../db");
const auth    = require("../middleware/auth");

const router = express.Router();
router.use(auth); // todas las rutas requieren login

// GET /api/carteras
router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM carteras WHERE activa = TRUE ORDER BY id"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Error del servidor" });
  }
});

// GET /api/carteras/:id/resumen
router.get("/:id/resumen", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM vista_resumen_cartera WHERE cartera_id = $1",
      [req.params.id]
    );
    res.json(result.rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: "Error del servidor" });
  }
});

// POST /api/carteras (solo admin)
router.post("/", async (req, res) => {
  if (req.usuario.rol !== "admin")
    return res.status(403).json({ error: "Sin permisos" });
  const { label, cobrador, usuario_id } = req.body;
  try {
    const result = await db.query(
      "INSERT INTO carteras (label, cobrador, usuario_id) VALUES ($1,$2,$3) RETURNING *",
      [label, cobrador, usuario_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Error del servidor" });
  }
});

module.exports = router;