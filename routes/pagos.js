// routes/pagos.js
const express = require("express");
const db      = require("../db");
const auth    = require("../middleware/auth");

const router = express.Router();
router.use(auth);

// GET /api/pagos?negocio_id=5
router.get("/", async (req, res) => {
  const { negocio_id, cartera_id } = req.query;
  try {
    let query, params;
    if (negocio_id) {
      query  = "SELECT * FROM pagos WHERE negocio_id=$1 ORDER BY fecha DESC, creado_en DESC";
      params = [negocio_id];
    } else if (cartera_id) {
      query  = "SELECT p.*, c.nombre AS cliente_nombre, n.monto AS negocio_monto FROM pagos p JOIN negocios n ON n.id=p.negocio_id JOIN clientes c ON c.id=n.cliente_id WHERE p.cartera_id=$1 ORDER BY p.fecha DESC, p.creado_en DESC";
      params = [cartera_id];
    } else {
      return res.status(400).json({ error: "Requiere negocio_id o cartera_id" });
    }
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Error del servidor" });
  }
});

// POST /api/pagos — registrar pago (ING)
router.post("/", async (req, res) => {
  const { negocio_id, cartera_id, fecha, monto, tipo, nota } = req.body;
  if (!negocio_id || !monto || !tipo)
    return res.status(400).json({ error: "negocio_id, monto y tipo requeridos" });

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Insertar pago
    const pago = await client.query(
      `INSERT INTO pagos (negocio_id, cartera_id, fecha, monto, tipo, nota, registrado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [negocio_id, cartera_id, fecha || new Date().toISOString().split("T")[0],
       monto, tipo, nota || "", req.usuario.id]
    );

    // Actualizar negocio
    const montoN = parseFloat(monto);
    const esCuota = tipo === "Cuota";
    const neg = await client.query(
      `UPDATE negocios SET
        abono   = abono + $1,
        deuda   = GREATEST(0, deuda - $1),
        pagadas = pagadas + $2,
        mora    = GREATEST(0, mora - $3),
        ult_pago = $4,
        estado  = CASE WHEN GREATEST(0, deuda - $1) = 0 THEN 'pagado' ELSE estado END,
        actualizado = NOW()
       WHERE id = $5
       RETURNING *`,
      [montoN, esCuota ? 1 : 0, esCuota ? 1 : 0,
       fecha || new Date().toISOString().split("T")[0], negocio_id]
    );

    // Si quedó en 0, actualizar cliente
    if (parseFloat(neg.rows[0].deuda) === 0) {
      const otrosActivos = await client.query(
        "SELECT id FROM negocios WHERE cliente_id=$1 AND estado='activo' AND id!=$2",
        [neg.rows[0].cliente_id, negocio_id]
      );
      if (otrosActivos.rows.length === 0) {
        await client.query(
          "UPDATE clientes SET estado='pagado', actualizado=NOW() WHERE id=$1",
          [neg.rows[0].cliente_id]
        );
      }
    }

    await client.query("COMMIT");
    res.status(201).json({ pago: pago.rows[0], negocio: neg.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  } finally {
    client.release();
  }
});

// PUT /api/pagos/:id — editar pago
router.put("/:id", async (req, res) => {
  const { monto, tipo, nota, fecha } = req.body;
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Pago anterior
    const anterior = await client.query("SELECT * FROM pagos WHERE id=$1", [req.params.id]);
    if (!anterior.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Pago no encontrado" });
    }
    const pagoViejo = anterior.rows[0];
    const diff = parseFloat(monto) - parseFloat(pagoViejo.monto);

    // Actualizar pago
    await client.query(
      "UPDATE pagos SET monto=$1, tipo=$2, nota=$3, fecha=$4 WHERE id=$5",
      [monto, tipo, nota, fecha, req.params.id]
    );

    // Ajustar deuda del negocio
    await client.query(
      `UPDATE negocios SET
        abono = abono + $1,
        deuda = GREATEST(0, deuda - $1),
        actualizado = NOW()
       WHERE id = $2`,
      [diff, pagoViejo.negocio_id]
    );

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  } finally {
    client.release();
  }
});

// DELETE /api/pagos/:id — anular pago
router.delete("/:id", async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const pg = await client.query("SELECT * FROM pagos WHERE id=$1", [req.params.id]);
    if (!pg.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Pago no encontrado" });
    }
    const p = pg.rows[0];

    // Revertir en negocio
    const esCuota = p.tipo === "Cuota";
    await client.query(
      `UPDATE negocios SET
        abono   = GREATEST(0, abono - $1),
        deuda   = deuda + $1,
        pagadas = GREATEST(0, pagadas - $2),
        actualizado = NOW()
       WHERE id = $3`,
      [p.monto, esCuota ? 1 : 0, p.negocio_id]
    );

    await client.query("DELETE FROM pagos WHERE id=$1", [req.params.id]);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  } finally {
    client.release();
  }
});

module.exports = router;