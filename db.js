const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  host: "db.tvhywwmevtpsjipdxxrs.supabase.co",
  port: 5432,
  database: "postgres",
  user: "postgres",
  password: "Pacande1225.",
  ssl: { rejectUnauthorized: false },
  family: 4,
});

pool.connect((err, client, release) => {
  if (err) {
    console.error("❌ Error conectando a Supabase:", err.message);
  } else {
    console.log("✅ Conectado a Supabase correctamente");
    release();
  }
});

module.exports = pool;