// routes/negocios.js
const express = require("express");
const db      = require("../db");
const auth    = require("../middleware/auth");

const router = express.Router();
router.use(auth);

// GET /api/negocios?cartera_id=1&estado=activo
router.get("/", async (req, res) => {
  const { cartera_id, estado } = req.query;
  if (!cartera_id)
    return res.status(400).json({ error: "cartera_id requerido" });
  try {
    let query = `
      SELECT n.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
      FROM negocios n
      JOIN clientes c ON c.id = n.cliente_id
      WHERE n.cartera_id = $1
    `;
    const params = [cartera_id];
    if (estado) {
      query += " AND n.estado = $2";
      params.push(estado);
    }
    query += " ORDER BY n.mora DESC, c.nombre ASC";
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Error del servidor" });
  }
});

// GET /api/negocios/:id
router.get("/:id", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT n.*, c.nombre AS cliente_nombre FROM negocios n
       JOIN clientes c ON c.id = n.cliente_id WHERE n.id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Negocio no encontrado" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Error del servidor" });
  }
});

// POST /api/negocios — crear préstamo
router.post("/", async (req, res) => {
  const { cartera_id, cliente_id, monto, cuota_val, cuota_num, porcentaje, periodo, fecha_ini, fecha_fin } = req.body;
  if (!cartera_id || !cliente_id || !monto || !cuota_num)
    return res.status(400).json({ error: "Faltan campos requeridos" });

  const deuda = parseFloat(monto) + parseFloat(monto) * (parseFloat(porcentaje) / 100);

  try {
    const result = await db.query(
      `INSERT INTO negocios
        (cartera_id, cliente_id, monto, cuota_val, cuota_num, porcentaje, periodo,
         deuda, fecha_ini, fecha_fin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [cartera_id, cliente_id, monto, cuota_val, cuota_num, porcentaje, periodo,
       deuda.toFixed(2), fecha_ini, fecha_fin || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// PUT /api/negocios/:id — editar negocio
router.put("/:id", async (req, res) => {
  const { monto, cuota_val, cuota_num, porcentaje, periodo, fecha_ini, fecha_fin, mora } = req.body;
  try {
    const result = await db.query(
      `UPDATE negocios SET
        monto=$1, cuota_val=$2, cuota_num=$3, porcentaje=$4,
        periodo=$5, fecha_ini=$6, fecha_fin=$7, mora=$8, actualizado=NOW()
       WHERE id=$9 RETURNING *`,
      [monto, cuota_val, cuota_num, porcentaje, periodo, fecha_ini, fecha_fin, mora || 0, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Negocio no encontrado" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Error del servidor" });
  }
});

// DELETE /api/negocios/:id
router.delete("/:id", async (req, res) => {
  try {
    // Los pagos se borran en cascada (ON DELETE CASCADE en schema)
    await db.query("DELETE FROM negocios WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Error del servidor" });
  }
});

// POST /api/negocios/:id/sac — SAC: sacar cliente del listado
router.post("/:id/sac", async (req, res) => {
  const { opcion, nota_cierre } = req.body;
  // opcion: 'saldada' | 'renovar' | 'extracurricular'
  const estadoNeg = opcion === "renovar" ? "renovar" : "pagado";
  const estadoCli = opcion === "renovar" ? "renovar" : "pagado";
  const notaFinal = opcion === "extracurricular"
    ? "[EXTRACURRICULAR] " + nota_cierre
    : nota_cierre;

  try {
    // Actualizar negocio
    const neg = await db.query(
      `UPDATE negocios SET estado=$1, nota_cierre=$2, fecha_cierre=NOW(), actualizado=NOW()
       WHERE id=$3 RETURNING *`,
      [estadoNeg, notaFinal, req.params.id]
    );
    if (!neg.rows[0]) return res.status(404).json({ error: "Negocio no encontrado" });

    // Actualizar cliente si no tiene otros negocios activos
    const otrosActivos = await db.query(
      "SELECT id FROM negocios WHERE cliente_id=$1 AND estado='activo' AND id!=$2",
      [neg.rows[0].cliente_id, req.params.id]
    );
    if (otrosActivos.rows.length === 0) {
      await db.query(
        "UPDATE clientes SET estado=$1, actualizado=NOW() WHERE id=$2",
        [estadoCli, neg.rows[0].cliente_id]
      );
    }

    res.json({ negocio: neg.rows[0], ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// POST /api/negocios/:id/renovar — renovar con mismos términos
router.post("/:id/renovar", async (req, res) => {
  try {
    const negAnterior = await db.query("SELECT * FROM negocios WHERE id=$1", [req.params.id]);
    if (!negAnterior.rows[0]) return res.status(404).json({ error: "Negocio no encontrado" });
    const n = negAnterior.rows[0];
    const deuda = parseFloat(n.monto) + parseFloat(n.monto) * (parseFloat(n.porcentaje) / 100);
    const hoy = new Date().toISOString().split("T")[0];

    const nuevo = await db.query(
      `INSERT INTO negocios
        (cartera_id, cliente_id, monto, cuota_val, cuota_num, porcentaje, periodo, deuda, fecha_ini)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [n.cartera_id, n.cliente_id, n.monto, n.cuota_val, n.cuota_num, n.porcentaje, n.periodo, deuda.toFixed(2), hoy]
    );

    // Marcar cliente como activo de nuevo
    await db.query("UPDATE clientes SET estado='activo', actualizado=NOW() WHERE id=$1", [n.cliente_id]);

    res.status(201).json(nuevo.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  }
});

module.exports = router;