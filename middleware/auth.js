// middleware/auth.js — Verifica el token JWT en cada petición protegida
const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ error: "Token requerido" });

  const token = authHeader.split(" ")[1]; // "Bearer TOKEN"
  if (!token) return res.status(401).json({ error: "Token inválido" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded; // { id, nombre, rol }
    next();
  } catch {
    return res.status(401).json({ error: "Token expirado o inválido" });
  }
};