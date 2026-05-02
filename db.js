const { Pool } = require("pg");
require("dotenv").config();
const dns = require("dns");

dns.setDefaultResultOrder("ipv4first");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
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