
import { storage } from './server/storage.js';
import { sqliteService } from './server/services/sqliteService.js';
import path from 'path';
import fs from 'fs/promises';
import XLSX from 'xlsx';

async function createTestExcelFile() {
  console.log('📝 Creating test Excel file...');
  
  const testData = [
    ['Name', 'Age', 'Department', 'Salary'],
    ['John Doe', 30, 'Engineering', 75000],
    ['Jane Smith', 28, 'Marketing', 65000],
    ['Bob Johnson', 35, 'Sales', 70000]
  ];
  
  const ws = XLSX.utils.aoa_to_sheet(testData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Employees');
  
  const testFilePath = path.join(process.cwd(), 'test-upload.xlsx');
  XLSX.writeFile(wb, testFilePath);
  
  console.log(`✅ Test Excel file created: ${testFilePath}`);
  return testFilePath;
}

async function testExcelUploadFlow() {
  console.log('🧪 Testing Excel Upload Flow');
  console.log('============================\n');

  try {
    // Test 1: Create and validate Excel file
    const testFilePath = await createTestExcelFile();
    
    console.log('📋 Test 1: Excel Validation');
    const validation = await sqliteService.validateExcelFile(testFilePath);
    console.log('Validation result:', JSON.stringify(validation, null, 2));
    
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }
    console.log('✅ Excel validation passed\n');

    // Test 2: Test SQLite creation
    console.log('📋 Test 2: SQLite Creation');
    const creation = await sqliteService.createSQLiteFromExcel({
      userId: 'test-user-123',
      name: 'Test Employee Database',
      description: 'Test database from Excel upload',
      excelFilePath: testFilePath,
      sanitizeColumnNames: true
    });
    
    console.log('Creation result:', JSON.stringify(creation, null, 2));
    
    if (!creation.success) {
      throw new Error(`SQLite creation failed: ${creation.error}`);
    }
    console.log('✅ SQLite creation passed\n');

    // Test 3: Verify database file exists and is readable
    console.log('📋 Test 3: Database Verification');
    if (creation.sqliteFilePath) {
      await fs.access(creation.sqliteFilePath);
      
      const schema = await sqliteService.getSQLiteSchema(creation.sqliteFilePath);
      console.log('Database schema:', JSON.stringify(schema, null, 2));
      
      if (!schema.success) {
        throw new Error(`Schema reading failed: ${schema.error}`);
      }
    }
    console.log('✅ Database verification passed\n');

    // Test 4: Test existing Excel files endpoint logic
    console.log('📋 Test 4: Existing Excel Files Logic');
    
    // Simulate what the endpoint does
    const testUserId = '43981095'; // Your user ID
    const allDocs = await storage.getDocuments(testUserId);
    console.log(`Found ${allDocs.length} total documents for user`);
    
    const excelFiles = allDocs.filter(doc => {
      const fileName = (doc.fileName || '').toLowerCase();
      const mimeType = (doc.mimeType || '').toLowerCase();
      return fileName.endsWith('.xlsx') || 
             fileName.endsWith('.xls') ||
             mimeType.includes('spreadsheet') ||
             mimeType.includes('excel');
    });
    
    console.log(`Found ${excelFiles.length} Excel files`);
    if (excelFiles.length > 0) {
      console.log('Sample Excel file:', JSON.stringify(excelFiles[0], null, 2));
    }
    console.log('✅ Existing Excel files logic passed\n');

    // Cleanup
    await fs.unlink(testFilePath);
    if (creation.sqliteFilePath) {
      await fs.unlink(creation.sqliteFilePath);
    }
    
    console.log('🎉 All tests passed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
    throw error;
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testExcelUploadFlow()
    .then(() => {
      console.log('\n✅ Test suite completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Test suite failed:', error);
      process.exit(1);
    });
}

export { testExcelUploadFlow };
