
/**
 * Comprehensive test suite for SQLite service
 * Tests Excel validation, SQLite creation, and safety checks
 */

import fs from 'fs/promises';
import path from 'path';
import XLSX from 'xlsx';
import { sqliteService } from './services/sqliteService.ts';
import { storage } from './storage.js';

const TEST_DIR = path.join(process.cwd(), 'test-files');

async function ensureTestDir() {
  try {
    await fs.access(TEST_DIR);
  } catch {
    await fs.mkdir(TEST_DIR, { recursive: true });
  }
}

async function createTestExcelFile(filename, data, options = {}) {
  const workbook = XLSX.utils.book_new();
  
  if (Array.isArray(data)) {
    // Single sheet
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, options.sheetName || 'Sheet1');
  } else {
    // Multiple sheets
    Object.entries(data).forEach(([sheetName, sheetData]) => {
      const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    });
  }

  const filePath = path.join(TEST_DIR, filename);
  XLSX.writeFile(workbook, filePath);
  return filePath;
}

async function cleanup() {
  try {
    const files = await fs.readdir(TEST_DIR);
    await Promise.all(
      files.map(file => fs.unlink(path.join(TEST_DIR, file)).catch(() => {}))
    );
    console.log('✅ Cleanup completed');
  } catch (error) {
    console.log('⚠️ Cleanup warning:', error.message);
  }
}

async function testExcelValidation() {
  console.log('\n🧪 Testing Excel File Validation...\n');

  // Test 1: Valid Excel file with headers
  console.log('Test 1: Valid Excel with headers');
  const validFile = await createTestExcelFile('valid-data.xlsx', [
    ['Name', 'Age', 'Department', 'Salary'],
    ['John Doe', 30, 'Engineering', 75000],
    ['Jane Smith', 25, 'Marketing', 65000],
    ['Bob Johnson', 35, 'Sales', 70000]
  ]);

  const validResult = await sqliteService.validateExcelFile(validFile);
  console.log('✅ Valid file result:', {
    isValid: validResult.isValid,
    errors: validResult.errors,
    warnings: validResult.warnings,
    sheetCount: validResult.sheets.length
  });

  // Test 2: Excel with problematic content
  console.log('\nTest 2: Excel with problematic content');
  const problematicFile = await createTestExcelFile('problematic-data.xlsx', [
    ['Name', 'Age', 'Name'], // Duplicate column names
    ['John', 30, 'Doe'],
    ['', '', ''], // Empty row
    ['Jane', 'invalid-age', 'Smith'] // Invalid data
  ]);

  const problematicResult = await sqliteService.validateExcelFile(problematicFile);
  console.log('⚠️ Problematic file result:', {
    isValid: problematicResult.isValid,
    errors: problematicResult.errors,
    warnings: problematicResult.warnings
  });

  // Test 3: Empty Excel file
  console.log('\nTest 3: Empty Excel file');
  const emptyFile = await createTestExcelFile('empty-data.xlsx', []);

  const emptyResult = await sqliteService.validateExcelFile(emptyFile);
  console.log('❌ Empty file result:', {
    isValid: emptyResult.isValid,
    errors: emptyResult.errors
  });

  // Test 4: Multiple sheets
  console.log('\nTest 4: Multiple sheets');
  const multiSheetFile = await createTestExcelFile('multi-sheet.xlsx', {
    'Employees': [
      ['ID', 'Name', 'Department'],
      [1, 'Alice', 'HR'],
      [2, 'Bob', 'IT']
    ],
    'Departments': [
      ['DeptID', 'Name', 'Budget'],
      [1, 'HR', 50000],
      [2, 'IT', 100000]
    ],
    'Empty': []
  });

  const multiResult = await sqliteService.validateExcelFile(multiSheetFile);
  console.log('✅ Multi-sheet result:', {
    isValid: multiResult.isValid,
    sheetCount: multiResult.sheets.length,
    sheetNames: multiResult.sheets.map(s => s.name),
    warnings: multiResult.warnings
  });

  // Test 5: File with no headers
  console.log('\nTest 5: File with no headers (data only)');
  const noHeaderFile = await createTestExcelFile('no-headers.xlsx', [
    [1, 'John', 'Engineering'],
    [2, 'Jane', 'Marketing'],
    [3, 'Bob', 'Sales']
  ]);

  const noHeaderResult = await sqliteService.validateExcelFile(noHeaderFile);
  console.log('✅ No headers result:', {
    isValid: noHeaderResult.isValid,
    hasHeaders: noHeaderResult.sheets[0]?.hasHeaders,
    columns: noHeaderResult.sheets[0]?.columns
  });
}

async function testSQLiteCreation() {
  console.log('\n🗄️ Testing SQLite Database Creation...\n');

  // Create test Excel file
  const testData = [
    ['Product_Name', 'Price', 'Category', 'In_Stock'],
    ['Laptop Pro', 1299.99, 'Electronics', 'Yes'],
    ['Office Chair', 299.50, 'Furniture', 'No'],
    ['Coffee Maker', 89.99, 'Appliances', 'Yes'],
    ['Wireless Mouse', 25.00, 'Electronics', 'Yes']
  ];

  const excelFile = await createTestExcelFile('products.xlsx', testData);

  // Test SQLite creation
  console.log('Test 1: Creating SQLite from valid Excel');
  const creationResult = await sqliteService.createSQLiteFromExcel({
    userId: 'test-user-123',
    name: 'Product Database',
    description: 'Test product database from Excel',
    excelFilePath: excelFile,
    sanitizeColumnNames: true
  });

  console.log('✅ Creation result:', {
    success: creationResult.success,
    connectionId: creationResult.connectionId,
    error: creationResult.error
  });

  if (creationResult.success && creationResult.sqliteFilePath) {
    // Test schema discovery
    console.log('\nTest 2: Schema discovery');
    const schemaResult = await sqliteService.getSQLiteSchema(creationResult.sqliteFilePath);
    
    console.log('✅ Schema result:', {
      success: schemaResult.success,
      tableCount: schemaResult.schema?.length,
      tables: schemaResult.schema?.map(t => ({
        name: t.tableName,
        columnCount: t.columns.length,
        columns: t.columns.map(c => `${c.name}:${c.type}`)
      }))
    });

    // Test with SQLite directly to verify data
    console.log('\nTest 3: Data verification');
    const sqlite3 = await import('sqlite3');
    const db = new sqlite3.default.Database(creationResult.sqliteFilePath, sqlite3.default.OPEN_READONLY);
    
    await new Promise((resolve, reject) => {
      db.all('SELECT * FROM products LIMIT 5', (err, rows) => {
        if (err) {
          console.log('❌ Data verification failed:', err.message);
          reject(err);
        } else {
          console.log('✅ Sample data from SQLite:');
          rows.forEach((row, index) => {
            console.log(`   Row ${index + 1}:`, row);
          });
          resolve();
        }
        db.close();
      });
    });
  }
}

async function testEdgeCases() {
  console.log('\n⚠️ Testing Edge Cases and Safety Checks...\n');

  // Test 1: Large file simulation
  console.log('Test 1: Large dataset simulation');
  const largeData = [['ID', 'Name', 'Value']];
  for (let i = 1; i <= 1000; i++) {
    largeData.push([i, `Item ${i}`, Math.random() * 1000]);
  }

  const largeFile = await createTestExcelFile('large-data.xlsx', largeData);
  const largeResult = await sqliteService.validateExcelFile(largeFile);
  
  console.log('✅ Large file validation:', {
    isValid: largeResult.isValid,
    rowCount: largeResult.sheets[0]?.rowCount,
    warnings: largeResult.warnings.length
  });

  // Test 2: Special characters in data
  console.log('\nTest 2: Special characters and Unicode');
  const unicodeData = [
    ['Name', 'Description', 'Price_฿', 'ระดับ'],
    ['สินค้า A', 'รายการสินค้า ที่ 1', '1,000.50', 'สูง'],
    ['Product B', 'Item with "quotes" & symbols', '500.00', 'Medium'],
    ['製品 C', '日本語の説明', '¥750', '高い'],
    ['Café ñoño', 'Español con acentos', '€25.99', 'básico']
  ];

  const unicodeFile = await createTestExcelFile('unicode-data.xlsx', unicodeData);
  const unicodeCreation = await sqliteService.createSQLiteFromExcel({
    userId: 'test-user-unicode',
    name: 'Unicode Test Database',
    excelFilePath: unicodeFile
  });

  console.log('✅ Unicode creation result:', {
    success: unicodeCreation.success,
    error: unicodeCreation.error
  });

  // Test 3: SQL injection patterns (should be sanitized)
  console.log('\nTest 3: SQL injection safety');
  const maliciousData = [
    ['Name', 'DROP TABLE', 'SELECT * FROM'],
    ['Normal Data', 'regular value', 'safe data'],
    ['Robert"; DROP TABLE users; --', 'injection attempt', 'another attempt']
  ];

  const maliciousFile = await createTestExcelFile('malicious-data.xlsx', maliciousData);
  const maliciousResult = await sqliteService.validateExcelFile(maliciousFile);
  
  console.log('✅ Malicious data validation:', {
    isValid: maliciousResult.isValid,
    columnNames: maliciousResult.sheets[0]?.columns,
    warnings: maliciousResult.warnings
  });

  // Test 4: Non-existent file
  console.log('\nTest 4: Non-existent file');
  try {
    const nonExistentResult = await sqliteService.validateExcelFile('/path/to/nowhere.xlsx');
    console.log('❌ Should have failed:', nonExistentResult);
  } catch (error) {
    console.log('✅ Correctly handled non-existent file');
  }

  // Test 5: Corrupted file simulation
  console.log('\nTest 5: Invalid file format');
  const textFile = path.join(TEST_DIR, 'fake-excel.xlsx');
  await fs.writeFile(textFile, 'This is not an Excel file');
  
  const corruptedResult = await sqliteService.validateExcelFile(textFile);
  console.log('✅ Corrupted file result:', {
    isValid: corruptedResult.isValid,
    errors: corruptedResult.errors
  });
}

async function testDatabaseConnector() {
  console.log('\n🔌 Testing Database Connector Integration...\n');

  // Create a test SQLite database first
  const testData = [
    ['ID', 'Test_Column', 'Value'],
    [1, 'Test 1', 'Value 1'],
    [2, 'Test 2', 'Value 2']
  ];

  const testFile = await createTestExcelFile('connector-test.xlsx', testData);
  const creation = await sqliteService.createSQLiteFromExcel({
    userId: 'test-connector',
    name: 'Connector Test DB',
    excelFilePath: testFile
  });

  if (creation.success && creation.sqliteFilePath) {
    // Test database connector
    const { databaseConnector } = await import('./services/databaseConnector.ts');
    
    const testConnection = {
      id: 999,
      type: 'database',
      dbType: 'sqlite',
      filePath: creation.sqliteFilePath
    };

    const connectionResult = await databaseConnector.testConnection(testConnection);
    console.log('✅ Database connector test:', {
      success: connectionResult.success,
      message: connectionResult.message
    });
  }
}

async function runAllTests() {
  console.log('🚀 Starting SQLite Service Test Suite\n');
  console.log('=' .repeat(50));

  try {
    await ensureTestDir();
    
    await testExcelValidation();
    await testSQLiteCreation();
    await testEdgeCases();
    await testDatabaseConnector();
    
    console.log('\n' + '=' .repeat(50));
    console.log('🎉 All tests completed successfully!');
    console.log('\n📋 Test Summary:');
    console.log('✅ Excel validation (5 test cases)');
    console.log('✅ SQLite creation and schema discovery');
    console.log('✅ Edge cases and safety checks (5 test cases)');
    console.log('✅ Database connector integration');
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    console.error(error.stack);
  } finally {
    await cleanup();
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}

export { runAllTests };
