// routes/clientes.js
const express = require("express");
const db      = require("../db");
const auth    = require("../middleware/auth");

const router = express.Router();
router.use(auth);

// GET /api/clientes?cartera_id=1&estado=activo
router.get("/", async (req, res) => {
  const { cartera_id, estado } = req.query;
  if (!cartera_id)
    return res.status(400).json({ error: "cartera_id requerido" });
  try {
    let query = "SELECT * FROM clientes WHERE cartera_id = $1";
    const params = [cartera_id];
    if (estado) {
      query += " AND estado = $2";
      params.push(estado);
    }
    query += " ORDER BY nombre ASC";
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Error del servidor" });
  }
});

// GET /api/clientes/:id
router.get("/:id", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM clientes WHERE id = $1", [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: "Cliente no encontrado" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Error del servidor" });
  }
});

// POST /api/clientes
router.post("/", async (req, res) => {
  const { cartera_id, nombre, cedula, telefono, barrio, direccion, ocupacion, fiador } = req.body;
  if (!cartera_id || !nombre)
    return res.status(400).json({ error: "cartera_id y nombre requeridos" });
  try {
    const result = await db.query(
      `INSERT INTO clientes (cartera_id, nombre, cedula, telefono, barrio, direccion, ocupacion, fiador)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [cartera_id, nombre.toUpperCase(), cedula, telefono, barrio, direccion, ocupacion, fiador]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Error del servidor" });
  }
});

// PUT /api/clientes/:id
router.put("/:id", async (req, res) => {
  const { nombre, cedula, telefono, barrio, direccion, ocupacion, fiador, estado } = req.body;
  try {
    const result = await db.query(
      `UPDATE clientes SET
        nombre=$1, cedula=$2, telefono=$3, barrio=$4,
        direccion=$5, ocupacion=$6, fiador=$7, estado=$8,
        actualizado=NOW()
       WHERE id=$9 RETURNING *`,
      [nombre?.toUpperCase(), cedula, telefono, barrio, direccion, ocupacion, fiador, estado, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Cliente no encontrado" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Error del servidor" });
  }
});

// DELETE /api/clientes/:id (solo si no tiene negocios activos)
router.delete("/:id", async (req, res) => {
  try {
    const negs = await db.query(
      "SELECT id FROM negocios WHERE cliente_id=$1 AND estado='activo'",
      [req.params.id]
    );
    if (negs.rows.length > 0)
      return res.status(400).json({ error: "El cliente tiene negocios activos. Ciérralos primero." });

    await db.query("DELETE FROM clientes WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Error del servidor" });
  }
});

// GET /api/clientes/:id/historial — info completa + negocios + pagos
router.get("/:id/historial", async (req, res) => {
  try {
    const cliente = await db.query("SELECT * FROM clientes WHERE id=$1", [req.params.id]);
    if (!cliente.rows[0]) return res.status(404).json({ error: "Cliente no encontrado" });

    const negocios = await db.query(
      "SELECT * FROM negocios WHERE cliente_id=$1 ORDER BY creado_en DESC",
      [req.params.id]
    );

    const negIds = negocios.rows.map(n => n.id);
    let pagos = [];
    if (negIds.length > 0) {
      const pagoResult = await db.query(
        "SELECT * FROM pagos WHERE negocio_id = ANY($1) ORDER BY fecha DESC",
        [negIds]
      );
      pagos = pagoResult.rows;
    }

    res.json({ cliente: cliente.rows[0], negocios: negocios.rows, pagos });
  } catch (err) {
    res.status(500).json({ error: "Error del servidor" });
  }
});

module.exports = router;