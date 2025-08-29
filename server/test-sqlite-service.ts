
import fs from 'fs/promises';
import path from 'path';
import XLSX from 'xlsx';
import { sqliteService } from './services/sqliteService.js';
import { storage } from './storage.js';

const TEST_DIR = path.join(process.cwd(), 'test-files');

export async function runAllTests() {
  console.log('🧪 Starting SQLite Service Tests');
  console.log('================================');

  try {
    // Ensure test directory exists
    await ensureTestDirectory();
    
    // Create sample Excel file for testing
    const excelFile = await createSampleExcelFile();
    
    // Test 1: Excel validation
    await testExcelValidation(excelFile);
    
    // Test 2: SQLite creation
    await testSQLiteCreation(excelFile);
    
    // Test 3: Schema discovery
    await testSchemaDiscovery();
    
    console.log('\n✅ All SQLite tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    throw error;
  } finally {
    // Cleanup test files
    await cleanup();
  }
}

async function ensureTestDirectory() {
  try {
    await fs.access(TEST_DIR);
  } catch {
    await fs.mkdir(TEST_DIR, { recursive: true });
    console.log('📁 Created test directory');
  }
}

async function createSampleExcelFile(): Promise<string> {
  console.log('\n📊 Creating sample Excel file...');
  
  // Create sample data
  const sampleData = [
    ['Name', 'Age', 'Department', 'Salary'],
    ['John Doe', 30, 'Engineering', 75000],
    ['Jane Smith', 28, 'Marketing', 65000],
    ['Bob Johnson', 35, 'Sales', 70000],
    ['Alice Brown', 32, 'Engineering', 80000]
  ];
  
  // Create workbook
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sampleData);
  XLSX.utils.book_append_sheet(wb, ws, 'Employees');
  
  // Add another sheet with different data
  const projectData = [
    ['Project', 'Status', 'Budget'],
    ['Website Redesign', 'Active', 50000],
    ['Mobile App', 'Planning', 100000],
    ['Database Migration', 'Completed', 25000]
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(projectData);
  XLSX.utils.book_append_sheet(wb, ws2, 'Projects');
  
  const filePath = path.join(TEST_DIR, 'test-data.xlsx');
  XLSX.writeFile(wb, filePath);
  
  console.log('✅ Sample Excel file created');
  return filePath;
}

async function testExcelValidation(excelFile: string) {
  console.log('\n🔍 Testing Excel validation...');
  
  const validation = await sqliteService.validateExcelFile(excelFile);
  
  if (!validation.isValid) {
    throw new Error(`Excel validation failed: ${validation.errors.join(', ')}`);
  }
  
  console.log('✅ Excel validation passed');
  console.log(`📋 Found ${validation.sheets.length} sheets:`);
  
  validation.sheets.forEach(sheet => {
    console.log(`  - ${sheet.name}: ${sheet.rowCount} rows, ${sheet.columnCount} columns`);
    console.log(`    Headers: ${sheet.hasHeaders ? 'Yes' : 'No'}`);
    console.log(`    Columns: ${sheet.columns.join(', ')}`);
  });
  
  if (validation.warnings.length > 0) {
    console.log('⚠️ Warnings:', validation.warnings);
  }
}

async function testSQLiteCreation(excelFile: string) {
  console.log('\n🗄️ Testing SQLite database creation...');
  
  const creation = await sqliteService.createSQLiteFromExcel({
    userId: 'test-user-123',
    name: 'Test Database',
    description: 'A test database created from Excel',
    excelFilePath: excelFile,
    sanitizeColumnNames: true
  });
  
  if (!creation.success || !creation.sqliteFilePath) {
    throw new Error(`SQLite creation failed: ${creation.error}`);
  }
  
  console.log('✅ SQLite database created successfully');
  console.log(`📁 File path: ${creation.sqliteFilePath}`);
  console.log(`🔢 Connection ID: ${creation.connectionId}`);
  
  // Verify file exists
  try {
    await fs.access(creation.sqliteFilePath);
    console.log('✅ Database file exists');
  } catch {
    throw new Error('Database file was not created');
  }
  
  if (creation.success && creation.sqliteFilePath) {
    // Test database connector
    const { databaseConnector } = await import('./services/databaseConnector.js');
    
    const testConnection = {
      id: 999,
      userId: 'test-user-123',
      name: 'Test Database',
      type: 'database' as const,
      dbType: 'sqlite' as const,
      filePath: creation.sqliteFilePath,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    console.log('\n🔌 Testing database connection...');
    const connectionTest = await databaseConnector.testConnection(testConnection);
    
    if (!connectionTest.success) {
      throw new Error(`Database connection test failed: ${connectionTest.error}`);
    }
    
    console.log('✅ Database connection test passed');
    
    // Test a simple query
    console.log('\n📊 Testing sample query...');
    const queryResult = await databaseConnector.executeQuery(
      testConnection,
      'SELECT * FROM Employees LIMIT 3'
    );
    
    if (!queryResult.success || !queryResult.data) {
      throw new Error(`Query test failed: ${queryResult.error}`);
    }
    
    console.log('✅ Query test passed');
    console.log(`📋 Retrieved ${queryResult.data.length} rows`);
    console.log('Sample data:', queryResult.data.slice(0, 2));
  }
}

async function testSchemaDiscovery() {
  console.log('\n🔍 Testing schema discovery...');
  
  // Find the created SQLite file
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const files = await fs.readdir(uploadsDir);
  const sqliteFile = files.find(f => f.includes('Test_Database') && f.endsWith('.db'));
  
  if (!sqliteFile) {
    throw new Error('Could not find created SQLite file for schema test');
  }
  
  const sqliteFilePath = path.join(uploadsDir, sqliteFile);
  const schema = await sqliteService.getSQLiteSchema(sqliteFilePath);
  
  if (!schema.success || !schema.schema) {
    throw new Error(`Schema discovery failed: ${schema.error}`);
  }
  
  console.log('✅ Schema discovery passed');
  console.log(`📋 Found ${schema.schema.length} tables:`);
  
  schema.schema.forEach(table => {
    console.log(`  Table: ${table.tableName}`);
    console.log(`    Columns: ${table.columns.map(c => `${c.name} (${c.type})`).join(', ')}`);
  });
}

async function cleanup() {
  console.log('\n🧹 Cleaning up test files...');
  
  try {
    // Remove test directory
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    
    // Clean up uploaded SQLite files (test files only)
    const uploadsDir = path.join(process.cwd(), 'uploads');
    try {
      const files = await fs.readdir(uploadsDir);
      const testFiles = files.filter(f => f.includes('Test_Database') && f.endsWith('.db'));
      
      for (const file of testFiles) {
        await fs.unlink(path.join(uploadsDir, file));
        console.log(`🗑️ Removed ${file}`);
      }
    } catch (error) {
      // Uploads directory might not exist, which is fine
    }
    
    console.log('✅ Cleanup completed');
  } catch (error) {
    console.warn('⚠️ Cleanup failed:', error);
  }
}
