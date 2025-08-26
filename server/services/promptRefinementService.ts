
import { llmRouter } from "./llmRouter";
import { db } from "../db";
import { documents } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

export interface PromptRefinementRequest {
  originalPrompt: string;
  personality: string;
  profession: string;
  responseStyle: string;
  specialSkills: string[];
  documentIds: number[];
  userId: string;
}

export interface PromptRefinementResponse {
  refinedPrompt: string;
  documentContext: string;
  suggestions: string[];
}

export class PromptRefinementService {
  async refineSystemPrompt(request: PromptRefinementRequest): Promise<PromptRefinementResponse> {
    try {
      console.log(`🎨 Starting prompt refinement for user ${request.userId}`);
      
      // Get document information if documents are selected
      let documentContext = "";
      let documentSummaries: string[] = [];
      
      if (request.documentIds && request.documentIds.length > 0) {
        console.log(`📚 Fetching ${request.documentIds.length} documents for context`);
        
        const selectedDocuments = await db
          .select({
            id: documents.id,
            name: documents.name,
            description: documents.description,
            summary: documents.summary,
            categoryName: documents.categoryName
          })
          .from(documents)
          .where(inArray(documents.id, request.documentIds));

        documentSummaries = selectedDocuments.map((doc, index) => {
          const docInfo = [
            `เอกสาร ${index + 1}: ${doc.name}`,
            doc.description ? `คำอธิบาย: ${doc.description}` : '',
            doc.summary ? `สรุป: ${doc.summary}` : '',
            doc.categoryName ? `หมวดหมู่: ${doc.categoryName}` : ''
          ].filter(Boolean).join(' - ');
          
          return docInfo;
        });

        documentContext = documentSummaries.length > 0 
          ? `\n\nเอกสารที่บอทจะมีการเข้าถึง:\n${documentSummaries.join('\n')}`
          : "";
      }

      // Create refinement prompt
      const refinementPrompt = this.buildRefinementPrompt(request, documentContext);

      // Use LLM Router to get refined prompt
      const refinedContent = await llmRouter.chat([
        {
          role: "system",
          content: "คุณเป็นผู้เชี่ยวชาญในการเขียน system prompt สำหรับ AI chatbot ให้ตอบภาษาไทยเท่านั้น และปรับปรุง prompt ให้มีประสิทธิภาพและชัดเจนมากขึ้น"
        },
        {
          role: "user", 
          content: refinementPrompt
        }
      ], request.userId);

      // Parse the response to extract refined prompt and suggestions
      const parsedResponse = this.parseRefinementResponse(refinedContent);

      console.log(`✅ Prompt refinement completed for user ${request.userId}`);

      return {
        refinedPrompt: parsedResponse.refinedPrompt,
        documentContext: documentContext,
        suggestions: parsedResponse.suggestions
      };

    } catch (error) {
      console.error("Error in prompt refinement:", error);
      throw new Error("Failed to refine system prompt");
    }
  }

  private buildRefinementPrompt(request: PromptRefinementRequest, documentContext: string): string {
    return `
กรุณาปรับปรุง system prompt นี้ให้ดีขึ้น:

**Prompt เดิม:** "${request.originalPrompt}"

**ข้อมูลบอท:**
- บุคลิกภาพ: ${request.personality}
- อาชีพ/บทบาท: ${request.profession}  
- รูปแบบการตอบ: ${request.responseStyle}
- ทักษะพิเศษ: ${request.specialSkills.join(', ')}

${documentContext}

**คำแนะนำการปรับปรุง:**
1. ทำให้ prompt ชัดเจนและเฉพาะเจาะจงมากขึ้น
2. เพิ่มรายละเอียดเกี่ยวกับบทบาทและหน้าที่
3. ระบุข้อจำกัดและแนวทางการตอบคำถาม
4. หากมีเอกสาร ให้อธิบายว่าบอทจะใช้เอกสารเหล่านั้นอย่างไร
5. เพิ่มคำแนะนำเกี่ยวกับโทนเสียงและการสื่อสาร

**รูปแบบการตอบ:**
```
REFINED_PROMPT:
[ใส่ system prompt ที่ปรับปรุงแล้วตรงนี้]

SUGGESTIONS:
- [คำแนะนำ 1]
- [คำแนะนำ 2] 
- [คำแนะนำ 3]
```

กรุณาตอบเป็นภาษาไทยเท่านั้น และทำให้ prompt มีประสิทธิภาพสูงสุด`;
  }

  private parseRefinementResponse(response: string): { refinedPrompt: string; suggestions: string[] } {
    try {
      // Extract refined prompt
      const promptMatch = response.match(/REFINED_PROMPT:\s*([\s\S]*?)(?=SUGGESTIONS:|$)/);
      let refinedPrompt = promptMatch ? promptMatch[1].trim() : response;

      // Clean up the refined prompt
      refinedPrompt = refinedPrompt.replace(/```/g, '').trim();

      // Extract suggestions
      const suggestionsMatch = response.match(/SUGGESTIONS:\s*([\s\S]*?)$/);
      let suggestions: string[] = [];
      
      if (suggestionsMatch) {
        suggestions = suggestionsMatch[1]
          .split('\n')
          .map(line => line.replace(/^-\s*/, '').trim())
          .filter(line => line.length > 0);
      }

      return { refinedPrompt, suggestions };
    } catch (error) {
      console.error("Error parsing refinement response:", error);
      return { 
        refinedPrompt: response,
        suggestions: ["การปรับปรุงเสร็จสิ้น กรุณาตรวจสอบผลลัพธ์"]
      };
    }
  }
}

export const promptRefinementService = new PromptRefinementService();
