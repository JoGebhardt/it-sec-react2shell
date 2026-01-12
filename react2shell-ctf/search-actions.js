/**
 * Search page-source.html for action IDs
 */

const fs = require('fs');

const html = fs.readFileSync('page-source.html', 'utf8');

console.log('[*] Searching for action patterns in page-source.html...\n');

// Decode and search __next_f chunks
const nextFMatches = [...html.matchAll(/self\.__next_f\.push\(\[([\d,]+),?"([^"]+)"/g)];

console.log(`[*] Found ${nextFMatches.length} __next_f chunks\n`);

for (const match of nextFMatches) {
  const indices = match[1];
  let data = match[2];
  
  // Unescape the string
  try {
    data = JSON.parse(`"${data}"`);
  } catch (e) {
    // Already unescaped
  }
  
  // Look for action-related content
  if (data.includes('action') || data.includes('Action') || /[a-f0-9]{32}/.test(data)) {
    console.log(`--- Chunk [${indices}] ---`);
    console.log(data.substring(0, 500));
    console.log('...\n');
  }
}

// Look for any 32-char hex strings that could be action IDs
console.log('\n[*] All potential action IDs (32+ char hex strings):');
const allHex = [...html.matchAll(/[a-f0-9]{32,64}/g)];
const unique = [...new Set(allHex.map(m => m[0]))];
unique.forEach((h, i) => console.log(`  ${i + 1}. ${h}`));

// Search for "addToCart" references
console.log('\n[*] Searching for "addToCart" references:');
const addToCartMatches = [...html.matchAll(/.{0,100}addToCart.{0,100}/gi)];
addToCartMatches.forEach(m => console.log(`  Found: ...${m[0]}...`));
