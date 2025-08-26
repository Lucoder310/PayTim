// api-svc/src/db.mjs
import pkg from 'pg';
const { Pool } = pkg;

export const pool = new Pool({
  host: process.env.PGHOST || 'postgres',
  user: process.env.PGUSER || 'sp',
  password: process.env.PGPASSWORD || 'sp',
  database: process.env.PGDATABASE || 'sp',
  port: process.env.PGPORT || 5432,
});

export async function withTx(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
