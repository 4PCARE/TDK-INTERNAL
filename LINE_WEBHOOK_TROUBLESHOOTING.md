# Line OA Webhook Troubleshooting Guide

## ปัญหาที่พบ: Invalid Line Signature

จาก log ที่วิเคราะห์ พบว่ามี Line OA integration ที่ไม่สามารถ verify webhook signature ได้

### การวิเคราะห์ปัญหา

จากฐานข้อมูล พบ integrations ดังนี้:

| ID | Name | Channel ID | Bot User ID | Verified | Active | Created |
|----|------|------------|-------------|----------|--------|---------|
| 11 | TMG Staff | 2007765234 | - | ✅ | ✅ | 2025-07-21 05:09:56 |
| 10 | 4Plus Finance Bot | 2007785620 | U23cba3d2b6d45e9b2bb0549c44838d29 | ❌ | ✅ | 2025-07-21 04:32:53 |
| 7 | 4Plus TMG Customer | 2007764108 | U27d53644f02ca2084a784b2d71394b91 | ✅ | ✅ | 2025-07-16 07:52:16 |
| 5 | 4Plus - KMS - New | 2007683024 | U753bd9adf2a5c6fe7559297bed71dd3b | ✅ | ✅ | 2025-07-03 07:12:07 |

**ปัญหาคือ:** Integration ID 10 ยังไม่ได้รับการ verify (`is_verified = false`)

### วิธีแก้ปัญหา

#### ขั้นตอนที่ 1: Verify Channel Secret
1. ไปที่ **Social Integrations** page
2. หา integration "4Plus Finance Bot" (ID: 10)
3. กด **"Test Connection"** เพื่อ verify Channel Secret อีกครั้ง
4. ตรวจสอบให้แน่ใจว่า Channel Secret ตรงกับที่ตั้งค่าไว้ใน Line Developer Console

#### ขั้นตอนที่ 2: ใช้ Dynamic Webhook URL
แทนที่จะใช้ generic webhook URL:
```
❌ https://your-domain.com/api/line/webhook
```

ให้ใช้ dynamic webhook URL สำหรับ integration เฉพาะ:
```
✅ https://your-domain.com/api/line/webhook/10
```

#### ขั้นตอนที่ 3: อัปเดต Line Developer Console
1. เข้า **Line Developer Console**
2. เลือก Channel ที่มี Channel ID: `2007785620`
3. ไปที่ **Messaging API** tab
4. อัปเดต **Webhook URL** เป็น: `https://your-domain.com/api/line/webhook/10`
5. **Enable** webhook และ **Verify** URL

### การตรวจสอบผลลัพธ์

หลังจากทำตามขั้นตอนแล้ว ให้ตรวจสอบ:

1. **ใน Console Log** ควรเห็น:
   ```
   🔔 Line webhook received for integration 10 (4Plus Finance Bot)
   🔍 Integration verified status: true
   ✅ Hash match: true
   ```

2. **ใน Database** ควรเห็น:
   ```sql
   SELECT name, is_verified, last_verified_at 
   FROM social_integrations 
   WHERE id = 10;
   ```
   - `is_verified` = `true`
   - `last_verified_at` = วันที่ล่าสุด

### Debug Logging ที่เพิ่มเข้าไป

ระบบได้เพิ่ม debug logging เพื่อช่วยในการแก้ปัญหา:

```
🔐 Debug: Signature verification details:
📝 Raw body length: [length]
🔑 Channel Secret available: [true/false]
🔏 Channel Secret length: [32]
📋 X-Line-Signature header: [signature]
🎯 Expected hash: [calculated_hash]
📩 Received signature: [line_signature]
✅ Hash match: [true/false]
```

### เหตุผลที่เกิดปัญหา

1. **Channel Secret ไม่ตรง:** เมื่อสร้าง integration ใหม่ อาจป้อน Channel Secret ผิด
2. **ยังไม่ได้ verify:** Integration ที่ `is_verified = false` อาจมี credentials ที่ไม่ถูกต้อง
3. **ใช้ webhook URL ผิด:** การใช้ generic webhook แทน dynamic webhook อาจทำให้เลือก integration ผิด

### การป้องกันปัญหาในอนาคต

1. **ใช้ Dynamic Webhook เสมอ** สำหรับ integration ใหม่
2. **Verify ทันทีหลังสร้าง** integration
3. **ตรวจสอบ Channel Secret** ให้ตรงกับ Line Developer Console

### คำสั่ง SQL สำหรับตรวจสอบ

```sql
-- ตรวจสอบ integration ทั้งหมด
SELECT 
  id, name, channel_id, bot_user_id,
  is_active, is_verified, last_verified_at
FROM social_integrations 
WHERE type = 'lineoa' 
ORDER BY created_at DESC;

-- ตรวจสอบ integration ที่มีปัญหา
SELECT * FROM social_integrations 
WHERE type = 'lineoa' AND is_verified = false;
```

---

**สรุป:** ปัญหา Invalid Line Signature มักเกิดจาก Channel Secret ที่ไม่ถูกต้อง ให้ verify อีกครั้งและใช้ dynamic webhook URL