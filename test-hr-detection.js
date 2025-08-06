// Test HR query detection function
console.log("Testing HR query detection...");

// Helper function to detect HR-related queries
function isHrRelatedQuery(message) {
  const hrKeywords = [
    // Thai HR keywords
    'วันลา', 'การลา', 'ลาป่วย', 'ลาพักร้อน', 'วันหยุด', 'วันหยุดพักผ่อน',
    'ข้อมูลพนักงาน', 'ข้อมูลส่วนตัว', 'รายละเอียดการทำงาน', 'สถานะการทำงาน',
    'เงินเดือน', 'เลขบัตรประชาชน', 'หมายเลขบัตรประชาชน', 'เบอร์โทร', 'อีเมล',
    'แผนก', 'ตำแหน่ง', 'วันที่เริ่มงาน', 'วันที่เข้าทำงาน', 'อาชีพ', 'ตำแหน่งงาน',
    'พนักงาน', 'บุคลากร', 'hr', 'human resource', 'ทรัพยากรบุคคล',
    
    // English HR keywords
    'leave days', 'vacation', 'sick leave', 'employee information', 'personal information',
    'employee details', 'work details', 'employment status', 'salary', 'citizen id',
    'phone number', 'email', 'department', 'position', 'hire date', 'start date',
    'employee', 'staff', 'personnel'
  ];

  const lowerMessage = message.toLowerCase();
  return hrKeywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()));
}

// Test cases
const testQueries = [
  "ข้อมูลพนักงานของฉัน", // Should be HR
  "วันลาของฉันเหลือกี่วัน", // Should be HR  
  "ราคาอาหารเท่าไร", // Should NOT be HR
  "employee information", // Should be HR
  "สวัสดีครับ", // Should NOT be HR
  "แผนกของฉันคืออะไร", // Should be HR
  "ตำแหน่งงานของฉัน", // Should be HR
  "อากาศวันนี้เป็นไง", // Should NOT be HR
];

console.log("\n=== HR Query Detection Test Results ===");
testQueries.forEach((query, index) => {
  const isHr = isHrRelatedQuery(query);
  console.log(`${index + 1}. "${query}" -> ${isHr ? '✅ HR' : '❌ NOT HR'}`);
});

console.log("\n✅ HR detection test completed!");