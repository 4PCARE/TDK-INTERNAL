import { storage } from "../storage";

/**
 * Extract intent tags from user query using predefined categories
 */
function extractIntentFromQuery(userQuery: string): string[] {
  const query = userQuery.toLowerCase();
  const intents: string[] = [];

  // Beauty & Cosmetics intents
  const beautyKeywords = [
    "ครีม",
    "เซรั่ม",
    "โลชั่น",
    "ผิว",
    "หน้า",
    "ตา",
    "ริมฝีปาก",
    "แก้ม",
    "เครื่องสำอาง",
    "แป้ง",
    "ลิปสติก",
    "อายแชโดว์",
    "มาสคาร่า",
    "ริ้วรอย",
    "ใส",
    "ขาว",
    "เด็ก",
    "สวย",
    "งาม",
    "beauty",
    "cosmetics",
    "skincare",
  ];

  const antiAgingKeywords = [
    "ริ้วรอย",
    "แก่",
    "ชรา",
    "เหี่ยว",
    "ตีนกา",
    "หย่อนคล้อย",
    "กระชับ",
    "ย้อนวัย",
    "เด็กลง",
    "ร่องแก้ม",
    "หน้าหมอง",
    "anti-aging",
    "wrinkle",
  ];

  const hairKeywords = [
    "ผม",
    "หัว",
    "แชมพู",
    "ครีมนวด",
    "โรคผม",
    "หัวล้าน",
    "ผมร่วง",
    "ผมหงอก",
    "hair",
    "shampoo",
  ];

  const healthKeywords = [
    "สุขภาพ",
    "วิตามิน",
    "อาหารเสริม",
    "ยา",
    "รักษา",
    "โรค",
    "ป่วย",
    "health",
    "vitamin",
    "supplement",
  ];

  const fashionKeywords = [
    "เสื้อผ้า",
    "แฟชั่น",
    "กระเป๋า",
    "รองเท้า",
    "เครื่องประดับ",
    "นาฬิกา",
    "fashion",
    "clothes",
    "bag",
    "shoes",
  ];

  const electronicKeywords = [
    "มือถือ",
    "โทรศัพท์",
    "คอมพิวเตอร์",
    "laptop",
    "notebook",
    "โน๊ตบุ๊ค",
    "แท็บเล็ต",
    "หูฟัง",
    "electronics",
    "gadgets",
  ];

  const krapraoKeywords = [
    "กะเพรา",
    "กระเพรา",
    "ข้าวกะเพรา",
    "ข้าวกระเพรา",
    "กะเพราไก่",
    "กระเพราไก่",
    "กะเพราหมู",
    "กระเพราหมู",
    "กะเพราเนื้อ",
    "กระเพราเนื้อ",
  ];

  // Check for beauty/cosmetics
  if (beautyKeywords.some((keyword) => query.includes(keyword))) {
    intents.push("beauty", "cosmetics", "skincare");
  }

  // Check for anti-aging specifically
  if (antiAgingKeywords.some((keyword) => query.includes(keyword))) {
    intents.push("anti-aging", "wrinkle", "beauty");
  }

  // Check for hair care
  if (hairKeywords.some((keyword) => query.includes(keyword))) {
    intents.push("hair", "haircare", "shampoo");
  }

  // Check for health supplements
  if (healthKeywords.some((keyword) => query.includes(keyword))) {
    intents.push("health", "vitamin", "supplement");
  }

  // Check for fashion
  if (fashionKeywords.some((keyword) => query.includes(keyword))) {
    intents.push("fashion", "clothes", "accessories");
  }

  // Check for electronics
  if (electronicKeywords.some((keyword) => query.includes(keyword))) {
    intents.push("electronics", "gadgets", "notebook", "computer");
  }

  if (krapraoKeywords.some((keyword) => query.includes(keyword))) {
    intents.push("กระเพราไก่");
  }

  // Remove duplicates
  return [...new Set(intents)];
}

/**
 * Get Line templates associated with the integration
 */
async function getIntegrationTemplates(
  integrationId: number,
  userId: string,
): Promise<any[]> {
  try {
    console.log(`🎠 === TEMPLATE RETRIEVAL START ===`);
    console.log(`🎠 Integration ID: ${integrationId}, User ID: ${userId}`);

    // First get all message templates for the user and integration
    const messageTemplates = await storage.getLineMessageTemplates(
      userId,
      integrationId,
    );
    console.log(
      `🎠 Found ${messageTemplates.length} message templates for integration ${integrationId}`,
    );

    // Get complete template data with columns and actions
    const completeTemplates = await Promise.all(
      messageTemplates.map(async (template: any) => {
        const completeTemplate = await storage.getCompleteLineTemplate(
          template.id,
          userId,
        );
        return completeTemplate;
      }),
    );

    // Filter out undefined results
    const validTemplates = completeTemplates.filter(
      (template: any) => template !== undefined,
    );

    validTemplates.forEach((template: any, index: number) => {
      console.log(`🎠 Template ${index + 1}:`);
      console.log(`   - ID: ${template.template.id}`);
      console.log(`   - Name: ${template.template.name}`);
      console.log(
        `   - Description: ${template.template.description || "No description"}`,
      );
      console.log(`   - Type: ${template.template.type}`);
      console.log(`   - Columns: ${template.columns.length}`);
    });

    console.log(`🎠 === TEMPLATE RETRIEVAL END ===`);
    return validTemplates;
  } catch (error) {
    console.error(
      `❌ Error fetching templates for integration ${integrationId}:`,
      error,
    );
    return [];
  }
}

/**
 * Check if user query matches any template intents using tag comparison
 */
export async function checkCarouselIntents(
  userQuery: string,
  integrationId: number,
  userId: string,
): Promise<{ matched: boolean; template: any | null; similarity: number }> {
  try {
    console.log(`🎯 === CAROUSEL INTENT MATCHING START (TAG-BASED) ===`);
    console.log(`🎯 User Query: "${userQuery}"`);
    console.log(`🎯 Integration ID: ${integrationId}`);

    // Extract intent from user query
    const userIntents = extractIntentFromQuery(userQuery);
    console.log(`🎯 Extracted User Intents: [${userIntents.join(", ")}]`);

    if (userIntents.length === 0) {
      console.log(
        `🎯 No intents extracted from user query - skipping intent matching`,
      );
      return { matched: false, template: null, similarity: 0 };
    }

    const templates = await getIntegrationTemplates(integrationId, userId);

    if (templates.length === 0) {
      console.log(`🎯 No templates found - skipping intent matching`);
      return { matched: false, template: null, similarity: 0 };
    }

    console.log(
      `🎯 Testing ${templates.length} templates for tag match (any overlap = match)`,
    );

    for (const template of templates) {
      const templateTags = template?.template?.tags || [];

      console.log(
        `🎯 Testing template: "${template?.template?.name || "Unknown"}"`,
      );
      console.log(`🎯 Template Tags: [${templateTags.join(", ")}]`);

      if (templateTags.length === 0) {
        console.log(
          `🎯 Skipping template "${template?.template?.name || "Unknown"}" - no tags for intent matching`,
        );
        continue;
      }

      // Check for ANY tag overlap (simple match approach)
      const commonTags = userIntents.filter((intent) =>
        templateTags.some(
          (tag: string) =>
            tag.toLowerCase().includes(intent.toLowerCase()) ||
            intent.toLowerCase().includes(tag.toLowerCase()),
        ),
      );

      const hasMatch = commonTags.length > 0;

      console.log(`🎯 Intent Match Result (Tag-based):`);
      console.log(`   - Template: ${template.template.name}`);
      console.log(`   - User Intents: [${userIntents.join(", ")}]`);
      console.log(`   - Template Tags: [${templateTags.join(", ")}]`);
      console.log(`   - Common Tags: [${commonTags.join(", ")}]`);
      console.log(`   - Match: ${hasMatch ? "YES" : "NO"}`);

      if (hasMatch) {
        // Found a match - return immediately (first match wins)
        console.log(`🎯 === FINAL INTENT MATCHING RESULT (TAG-BASED) ===`);
        console.log(`🎯 Matched Template: ${template.template.name}`);
        console.log(`🎯 Common Tags: [${commonTags.join(", ")}]`);
        console.log(`🎯 === CAROUSEL INTENT MATCHING END (TAG-BASED) ===`);

        return {
          matched: true,
          template: template,
          similarity: 1.0, // Set to 1.0 since any match is considered valid
        };
      }
    }

    // No match found
    console.log(`🎯 === FINAL INTENT MATCHING RESULT (TAG-BASED) ===`);
    console.log(`🎯 No templates matched any user intents`);
    console.log(`🎯 === CAROUSEL INTENT MATCHING END (TAG-BASED) ===`);

    return {
      matched: false,
      template: null,
      similarity: 0,
    };
  } catch (error) {
    console.error(`❌ Error in carousel intent matching:`, error);
    return { matched: false, template: null, similarity: 0 };
  }
}