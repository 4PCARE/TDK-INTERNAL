
import { Request, Response, Router } from 'express';
import { storage } from './storage';

const router = Router();

// Debug search results fields
router.get('/debug-search-fields/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const query = req.query.query as string || 'test';
    const searchType = req.query.type as string || 'keyword-name-priority';
    
    console.log(`=== DEBUGGING SEARCH RESULT FIELDS ===`);
    console.log(`Query: "${query}"`);
    console.log(`Search Type: ${searchType}`);
    console.log(`User ID: ${userId}`);
    
    let results: any[] = [];
    
    // Import the search service based on type
    if (searchType === 'document-priority' || searchType === 'keyword-name-priority') {
      const { documentNamePrioritySearchService } = await import('./services/documentNamePrioritySearch');
      results = await documentNamePrioritySearchService.searchDocuments(
        query,
        userId,
        {
          limit: 5,
          massSelectionPercentage: 0.6,
          enableNameSearch: true,
          enableKeywordSearch: true,
          enableSemanticSearch: searchType === 'document-priority'
        }
      );
    } else if (searchType === 'semantic') {
      const { semanticSearchServiceV2 } = await import('./services/semanticSearchV2');
      results = await semanticSearchServiceV2.searchDocuments(query, userId, { limit: 5 });
    } else if (searchType === 'keyword') {
      const { advancedKeywordSearchService } = await import('./services/advancedKeywordSearch');
      results = await advancedKeywordSearchService.searchDocuments(query, userId, [], 5);
    } else {
      // Default to getting all documents
      results = await storage.getDocuments(userId, { limit: 5 });
    }
    
    console.log(`\n📊 SEARCH RESULTS COUNT: ${results.length}`);
    
    if (results.length === 0) {
      console.log(`❌ No results found`);
      return res.json({
        query,
        searchType,
        userId,
        resultsCount: 0,
        results: [],
        fieldAnalysis: 'No results to analyze'
      });
    }
    
    // Analyze fields in the first result
    const firstResult = results[0];
    console.log(`\n🔍 ANALYZING FIRST RESULT FIELDS:`);
    console.log(`Result type: ${typeof firstResult}`);
    console.log(`Is array: ${Array.isArray(firstResult)}`);
    
    const fields = Object.keys(firstResult);
    console.log(`\n📝 AVAILABLE FIELDS (${fields.length} total):`);
    
    const fieldAnalysis: any = {};
    
    fields.forEach(field => {
      const value = firstResult[field];
      const valueType = typeof value;
      const valuePreview = value === null ? 'null' : 
                          value === undefined ? 'undefined' :
                          Array.isArray(value) ? `[${value.length} items]` :
                          valueType === 'string' ? `"${value.substring(0, 50)}${value.length > 50 ? '...' : ''}"` :
                          valueType === 'object' ? JSON.stringify(value).substring(0, 100) :
                          String(value);
      
      fieldAnalysis[field] = {
        type: valueType,
        value: valuePreview,
        isNull: value === null,
        isUndefined: value === undefined
      };
      
      console.log(`  ${field}: ${valueType} = ${valuePreview}`);
    });
    
    // Check for specific important fields
    const importantFields = [
      'id', 'name', 'content', 'summary', 'aiCategory', 'aiCategoryColor',
      'similarity', 'createdAt', 'categoryId', 'tags', 'fileSize', 'mimeType',
      'isFavorite', 'updatedAt', 'userId', 'chunkIndex', 'originalDocumentId'
    ];
    
    console.log(`\n🎯 IMPORTANT FIELDS CHECK:`);
    const missingFields: string[] = [];
    const presentFields: string[] = [];
    
    importantFields.forEach(field => {
      if (field in firstResult) {
        presentFields.push(field);
        console.log(`  ✅ ${field}: ${typeof firstResult[field]} = ${JSON.stringify(firstResult[field]).substring(0, 100)}`);
      } else {
        missingFields.push(field);
        console.log(`  ❌ ${field}: MISSING`);
      }
    });
    
    // Analyze all results for consistency
    console.log(`\n🔄 FIELD CONSISTENCY CHECK ACROSS ALL RESULTS:`);
    const fieldConsistency: any = {};
    
    fields.forEach(field => {
      const types = results.map(result => typeof result[field]);
      const uniqueTypes = [...new Set(types)];
      fieldConsistency[field] = {
        consistentType: uniqueTypes.length === 1,
        types: uniqueTypes,
        nullCount: types.filter(t => t === 'object' && results.find(r => r[field] === null)).length
      };
      
      if (uniqueTypes.length > 1) {
        console.log(`  ⚠️  ${field}: Inconsistent types: ${uniqueTypes.join(', ')}`);
      } else {
        console.log(`  ✅ ${field}: Consistent type: ${uniqueTypes[0]}`);
      }
    });
    
    // Check for DocumentCard interface compliance
    console.log(`\n🏗️  DOCUMENTCARD INTERFACE COMPLIANCE:`);
    const documentCardRequiredFields = [
      'id', 'name', 'mimeType', 'fileSize', 'createdAt', 'isFavorite'
    ];
    
    const documentCardOptionalFields = [
      'originalName', 'description', 'status', 'categoryId', 'categoryName',
      'aiCategory', 'aiCategoryColor', 'isInVectorDb', 'isEndorsed',
      'endorsedAt', 'effectiveStartDate', 'effectiveEndDate', 'tags', 'summary'
    ];
    
    const complianceCheck = {
      requiredFieldsMissing: documentCardRequiredFields.filter(field => !(field in firstResult)),
      optionalFieldsPresent: documentCardOptionalFields.filter(field => field in firstResult),
      extraFields: fields.filter(field => 
        !documentCardRequiredFields.includes(field) && 
        !documentCardOptionalFields.includes(field)
      )
    };
    
    console.log(`  Required fields missing: ${complianceCheck.requiredFieldsMissing.length > 0 ? complianceCheck.requiredFieldsMissing.join(', ') : 'None'}`);
    console.log(`  Optional fields present: ${complianceCheck.optionalFieldsPresent.join(', ')}`);
    console.log(`  Extra fields: ${complianceCheck.extraFields.join(', ')}`);
    
    // Create HTML response for better visualization
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Search Results Field Debug</title>
          <style>
            body { font-family: monospace; margin: 20px; background: #1a1a1a; color: #00ff00; }
            .section { margin: 20px 0; padding: 15px; border: 1px solid #333; border-radius: 5px; }
            .field { margin: 5px 0; padding: 5px; background: #2a2a2a; border-radius: 3px; }
            .missing { color: #ff6b6b; }
            .present { color: #51cf66; }
            .warning { color: #feca57; }
            .json { background: #2a2a2a; padding: 10px; border-radius: 5px; white-space: pre-wrap; overflow-x: auto; }
            h2 { color: #74c0fc; }
            h3 { color: #ffd43b; }
          </style>
        </head>
        <body>
          <h1>🔍 Search Results Field Debug</h1>
          
          <div class="section">
            <h2>Search Parameters</h2>
            <div>Query: "${query}"</div>
            <div>Search Type: ${searchType}</div>
            <div>User ID: ${userId}</div>
            <div>Results Count: ${results.length}</div>
          </div>
          
          <div class="section">
            <h2>📝 All Fields in First Result</h2>
            ${fields.map(field => `
              <div class="field">
                <strong>${field}</strong>: ${fieldAnalysis[field].type} = ${fieldAnalysis[field].value}
              </div>
            `).join('')}
          </div>
          
          <div class="section">
            <h2>🎯 Important Fields Status</h2>
            <h3 class="present">Present Fields (${presentFields.length})</h3>
            ${presentFields.map(field => `<div class="field present">✅ ${field}</div>`).join('')}
            
            <h3 class="missing">Missing Fields (${missingFields.length})</h3>
            ${missingFields.map(field => `<div class="field missing">❌ ${field}</div>`).join('')}
          </div>
          
          <div class="section">
            <h2>🏗️ DocumentCard Interface Compliance</h2>
            <h3 class="missing">Required Fields Missing (${complianceCheck.requiredFieldsMissing.length})</h3>
            ${complianceCheck.requiredFieldsMissing.map(field => `<div class="field missing">❌ ${field}</div>`).join('')}
            
            <h3 class="present">Optional Fields Present (${complianceCheck.optionalFieldsPresent.length})</h3>
            ${complianceCheck.optionalFieldsPresent.map(field => `<div class="field present">✅ ${field}</div>`).join('')}
            
            <h3 class="warning">Extra Fields (${complianceCheck.extraFields.length})</h3>
            ${complianceCheck.extraFields.map(field => `<div class="field warning">⚠️  ${field}</div>`).join('')}
          </div>
          
          <div class="section">
            <h2>🔄 Field Consistency</h2>
            ${Object.entries(fieldConsistency).map(([field, info]: [string, any]) => `
              <div class="field ${info.consistentType ? 'present' : 'warning'}">
                ${info.consistentType ? '✅' : '⚠️'} ${field}: ${info.types.join(', ')}
              </div>
            `).join('')}
          </div>
          
          <div class="section">
            <h2>📋 First Result JSON</h2>
            <div class="json">${JSON.stringify(firstResult, null, 2)}</div>
          </div>
          
          <div class="section">
            <h2>📋 All Results Summary</h2>
            <div class="json">${JSON.stringify(results.map((result, index) => ({
              index,
              id: result.id,
              name: result.name,
              similarity: result.similarity,
              aiCategory: result.aiCategory,
              fieldCount: Object.keys(result).length
            })), null, 2)}</div>
          </div>
        </body>
      </html>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
    
  } catch (error) {
    console.error('Debug search fields error:', error);
    res.status(500).json({ 
      error: error.message,
      stack: error.stack 
    });
  }
});

export default router;
