import Database from 'better-sqlite3';
const db = new Database('/home/tomas/my-projects/emdash/data.db');

// List tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log("Tables in database:", tables.map(t => t.name));

// Check emdash collections table or equivalent
for (const table of tables) {
  try {
    const count = db.prepare(`SELECT count(*) as count FROM "${table.name}"`).get();
    console.log(`Table ${table.name} has ${count.count} rows`);
  } catch (err) {
    // Ignore
  }
}

// Query ec_exhibitions
try {
  const exhibitions = db.prepare("SELECT * FROM ec_exhibitions LIMIT 5").all();
  console.log("Exhibitions:", JSON.stringify(exhibitions, null, 2));
} catch (err) {
  console.log("Error querying ec_exhibitions:", err.message);
}

