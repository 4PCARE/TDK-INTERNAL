
import { db } from './server/db.js';
import fs from 'fs';

async function runMigration() {
  try {
    const migrationSQL = fs.readFileSync('./migrations/add_agent_web_search_whitelist.sql', 'utf8');
    await db.execute(migrationSQL);
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  }
  process.exit(0);
}

runMigration();
