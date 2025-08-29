
import { runAllTests } from './server/test-sqlite-service.js';

async function main() {
  try {
    await runAllTests();
    console.log('🎉 All SQLite tests completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

main();
