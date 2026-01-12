# React2Shell CTF Challenge

A Capture The Flag challenge demonstrating CVE-2025-55182 - a critical Remote Code Execution vulnerability in React Server Components.

## Challenge: Ghost in the Flight

**Difficulty:** Hard
**Category:** Web Exploitation
**Points:** 500

### Background

A new shopping site just launched. The developers were so excited about React Server Components that they rushed to production. Little did they know, they're running a vulnerable version of Next.js...

The flag is stored in `/flag.txt` on the server.

### Target

```
http://localhost:3000
```

### Hints (unlock progressively)

<details>
<summary>Hint 1 (50 points)</summary>
Look into CVE-2025-55182. It affects the React Flight protocol used by Server Components.
</details>

<details>
<summary>Hint 2 (100 points)</summary>
The vulnerability is in how Flight deserializes data. You don't need a Server Action - just send a crafted POST request.
</details>

<details>
<summary>Hint 3 (150 points)</summary>
The `$@` syntax tells Flight something is a Promise. The `:` syntax traverses properties. What about `__proto__`?
</details>

<details>
<summary>Hint 4 (200 points)</summary>
Every function has a `.constructor` property pointing to `Function`. `Function(code)` executes code like `eval()`.
</details>

<details>
<summary>Hint 5 (250 points)</summary>
Output appears in the `X-Action-Redirect` header. Use `NEXT_REDIRECT` error with a custom digest.
</details>

---

## Setup Instructions (For CTF Organizers)

### Vulnerable Versions

This challenge uses:
- **Next.js 16.0.6** (vulnerable, patched in 16.0.7+)
- **React 19.2.0** (vulnerable, patched in 19.0.1, 19.1.2, 19.2.1+)

### Option 1: Docker (Recommended)

```bash
cd react2shell-ctf
docker build -t react2shell-ctf .
docker run -p 3000:3000 react2shell-ctf
```

### Option 2: Local Development

```bash
cd react2shell-ctf
npm install
echo "FLAG{your_custom_flag}" > /flag.txt  # Or use local flag.txt
npm run dev
```

### Verify Setup

Run the exploit to verify the challenge works:

```bash
node exploit.js http://localhost:3000 "cat /flag.txt"
```

Expected output:
```
[*] Checking if target is vulnerable...
[+] Target is VULNERABLE! (verified: 41*271=11111)

[*] React2Shell Exploit - CVE-2025-55182
[*] Target: http://localhost:3000
[*] Command: cat /flag.txt
...
=== Command Output ===
FLAG{r34ct_fl1ght_t0_rc3_2025}
======================

[+] FLAG CAPTURED: FLAG{r34ct_fl1ght_t0_rc3_2025}
```

---

## Vulnerability Details

### CVE-2025-55182

**CVSS Score:** 10.0 (Critical)
**Type:** Remote Code Execution via Insecure Deserialization

The React Flight protocol (used for Server Components) had missing `hasOwnProperty` checks when resolving object references. This allowed attackers to:

1. Craft a malicious multipart POST request
2. Use `$1:__proto__:then` to access prototype chain
3. Traverse to `Function.constructor` via `$1:constructor:constructor`
4. Execute arbitrary JavaScript on the server

### Exploitation Flow

```
Malicious POST request
        ↓
Flight deserializes payload
        ↓
$@0 triggers Promise resolution
        ↓
__proto__.then accessed (prototype pollution)
        ↓
constructor.constructor = Function
        ↓
Function(malicious_code) executed
        ↓
RCE achieved
```

---

## Project Structure

```
react2shell-ctf/
├── README.md              # This file
├── package.json           # Dependencies (vulnerable versions)
├── next.config.js         # Next.js configuration
├── Dockerfile             # Docker build file
├── flag.txt               # Local flag for testing
├── exploit.js             # Working exploit (KEEP SECRET!)
└── app/
    ├── layout.js          # Root layout (Server Component)
    ├── page.js            # Main page (Client Component)
    └── actions.js         # Server Actions
```

---

## Learning Objectives

After completing this challenge, participants will understand:

1. How React Server Components and Flight protocol work
2. The dangers of deserializing untrusted data
3. Prototype pollution via `__proto__` traversal
4. How the `Function` constructor enables code execution
5. The importance of `hasOwnProperty` checks in parsers

---

## Resources

- [CVE-2025-55182 - NVD](https://nvd.nist.gov/vuln/detail/CVE-2025-55182)
- [React Security Advisory](https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components)
- [Next.js Security Update](https://nextjs.org/blog/security-update-2025-12-11)
- [maple3142's PoC](https://gist.github.com/maple3142/48bc9393f45e068cf8c90ab865c0f5f3)
- [Assetnote Scanner](https://github.com/assetnote/react2shell-scanner)

---

## Credits

- Vulnerability discovered by security researchers
- CTF challenge created for educational purposes only
