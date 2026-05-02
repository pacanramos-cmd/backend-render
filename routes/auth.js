// routes/auth.js — Login y registro de usuarios
const express = require("express");
const bcrypt  = require("bcrypt");
const jwt     = require("jsonwebtoken");
const db      = require("../db");
const auth    = require("../middleware/auth");

const router = express.Router();

// ── POST /api/auth/login ─────────────────────────────────
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email y contraseña requeridos" });

  try {
    const result = await db.query(
      "SELECT * FROM usuarios WHERE email = $1 AND activo = TRUE",
      [email.toLowerCase().trim()]
    );
    const usuario = result.rows[0];
    if (!usuario)
      return res.status(401).json({ error: "Credenciales incorrectas" });

    const match = await bcrypt.compare(password, usuario.password);
    if (!match)
      return res.status(401).json({ error: "Credenciales incorrectas" });

    const token = jwt.sign(
      { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({
      token,
      usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// ── POST /api/auth/registro (solo admin puede crear usuarios) ──
router.post("/registro", auth, async (req, res) => {
  if (req.usuario.rol !== "admin")
    return res.status(403).json({ error: "Solo el administrador puede crear usuarios" });

  const { nombre, email, password, rol } = req.body;
  if (!nombre || !email || !password)
    return res.status(400).json({ error: "Nombre, email y contraseña requeridos" });

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      "INSERT INTO usuarios (nombre, email, password, rol) VALUES ($1,$2,$3,$4) RETURNING id, nombre, email, rol",
      [nombre, email.toLowerCase().trim(), hash, rol || "cobrador"]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505")
      return res.status(400).json({ error: "Ese email ya está registrado" });
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// ── GET /api/auth/me — datos del usuario logueado ────────
router.get("/me", auth, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, nombre, email, rol FROM usuarios WHERE id = $1",
      [req.usuario.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Error del servidor" });
  }
});

module.exports = router;