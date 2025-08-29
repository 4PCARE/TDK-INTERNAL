
/**
 * Simple test runner for SQLite service
 */

import { runAllTests } from './server/test-sqlite-service.js';

console.log('🧪 SQLite Service Test Runner');
console.log('Testing Step 1: SQLite database creation from Excel');
console.log('This will test Excel validation, SQLite creation, and safety checks\n');

runAllTests().catch(console.error);
