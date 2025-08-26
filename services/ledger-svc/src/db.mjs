import pg from 'pg';


const pool = new pg.Pool({
host: process.env.PGHOST || 'localhost',
port: +(process.env.PGPORT || 5432),
user: process.env.PGUSER || 'sp',
password: process.env.PGPASSWORD || 'sp',
database: process.env.PGDATABASE || 'sp'
});


export async function migrate() {
await pool.query(`
create table if not exists users (
id uuid primary key,
name text not null,
created_at timestamptz not null default now()
);
create table if not exists accounts (
id uuid primary key,
user_id uuid not null references users(id),
balance numeric(18,2) not null,
created_at timestamptz not null default now()
);
create table if not exists transfers (
id uuid primary key,
from_account uuid not null references accounts(id),
to_account uuid not null references accounts(id),
amount numeric(18,2) not null,
status text not null,
reason text,
created_at timestamptz not null default now()
);
create table if not exists ledger_entries (
id bigserial primary key,
transfer_id uuid not null references transfers(id),
account_id uuid not null references accounts(id),
delta numeric(18,2) not null,
balance_after numeric(18,2) not null,
created_at timestamptz not null default now()
);
create table if not exists auth_users (
id uuid primary key,
user_id uuid not null references users(id) on delete cascade,
username text not null unique,
password_hash text not null,
created_at timestamptz not null default now()
);
`);
}


export async function withTx(fn) {
const client = await pool.connect();
try {
await client.query('begin');
const res = await fn(client);
await client.query('commit');
return res;
} catch (e) {
await client.query('rollback');
throw e;
} finally {
client.release();
}
}


export { pool };