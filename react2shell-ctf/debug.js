/**
 * Debug script to find Server Action details
 */

const TARGET = process.argv[2] || 'http://localhost:3000';

async function debug() {
  console.log(`[*] Fetching ${TARGET}...\n`);
  
  const response = await fetch(TARGET);
  const html = await response.text();
  
  // Look for action IDs in various formats
  console.log('[*] Looking for action patterns...\n');
  
  // Pattern 1: $ACTION_ID
  const actionIdMatches = html.matchAll(/\$ACTION_ID[_\d]*["']?\s*[:=]\s*["']([a-f0-9]+)["']/gi);
  for (const match of actionIdMatches) {
    console.log(`[+] Found $ACTION_ID: ${match[1]}`);
  }
  
  // Pattern 2: action="" attributes
  const actionAttrMatches = html.matchAll(/action=["']([^"']+)["']/gi);
  for (const match of actionAttrMatches) {
    console.log(`[+] Found action attr: ${match[1]}`);
  }
  
  // Pattern 3: Next-Action in inline scripts
  const nextActionMatches = html.matchAll(/["']([a-f0-9]{32,})["']/gi);
  const seen = new Set();
  for (const match of nextActionMatches) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      console.log(`[+] Found hash (possible action ID): ${match[1]}`);
    }
  }
  
  // Pattern 4: Look for __next_f chunks
  const nextFMatches = html.matchAll(/self\.__next_f\.push\(\[[\d,]*"([^"]+)"/g);
  for (const match of nextFMatches) {
    console.log(`[+] Found __next_f data: ${match[1].substring(0, 100)}...`);
  }

  console.log('\n[*] Response headers:');
  for (const [key, value] of response.headers) {
    console.log(`    ${key}: ${value}`);
  }
  
  // Save HTML for inspection
  require('fs').writeFileSync('page-source.html', html);
  console.log('\n[*] Full page source saved to page-source.html');
  console.log('[*] Search it for "action" or look at the network tab in browser DevTools');
}

debug().catch(console.error);
