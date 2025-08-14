module.exports = {
  extends: [
    "@eslint/js/recommended",
    "@typescript-eslint/recommended"
  ],
  rules: {
    // File size and complexity limits per replit.md
    "max-lines": ["error", { 
      max: 600, 
      skipComments: false, 
      skipBlankLines: false 
    }],
    "max-lines-per-function": ["error", { 
      max: 80, 
      skipComments: false, 
      IIFEs: true 
    }],
    "complexity": ["error", { max: 10 }],
    "max-depth": ["error", 4],
    "max-params": ["warn", 4]
  }
};