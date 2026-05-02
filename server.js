require("dotenv").config();
const express = require("express");
const cors    = require("cors");

const app = express();

const allowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error("CORS: origen no permitido → " + origin));
  },
  credentials: true,
}));
app.use(express.json());

app.use("/api/auth",     require("./routes/auth"));
app.use("/api/carteras", require("./routes/carteras"));
app.use("/api/clientes", require("./routes/clientes"));
app.use("/api/negocios", require("./routes/negocios"));
app.use("/api/pagos",    require("./routes/pagos"));

app.get("/", (req, res) => {
  res.json({
    sistema: "SIAGC API",
    version: "1.0.0",
    estado: "✅ Funcionando",
    db: "Supabase PostgreSQL",
  });
});

app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 SIAGC API corriendo en puerto ${PORT}`);
  console.log(`📍 Ambiente: ${process.env.NODE_ENV || "development"}`);
});
