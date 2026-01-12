# React2Shell CTF Challenge

## 🚩 Challenge: Ghost in the Flight

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
Look into CVE-2025-55182. It affects the React Flight protocol.
</details>

<details>
<summary>Hint 2 (100 points)</summary>
Server Actions use Flight to serialize data. What if you could confuse Flight's internal state tracking?
</details>

<details>
<summary>Hint 3 (150 points)</summary>
The `$@` syntax tells Flight something is a Promise. The `:` syntax traverses properties. What properties do functions have?
</details>

<details>
<summary>Hint 4 (200 points)</summary>
Every function has a `.constructor` property pointing to `Function`. `Function(string)` is basically `eval()`.
</details>

---

## 🔧 Setup Instructions (For CTF Organizers)

### Prerequisites

- Node.js 20+ 
- npm or yarn

### Installation

```bash
cd react2shell-ctf
npm install
```

### Create the flag

```bash
echo "FLAG{r34ct_fl1ght_t0_rc3_2025}" > /flag.txt
# Or on the root of your CTF server
```

### Run the vulnerable app

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

### Verify vulnerability

Run the exploit to verify setup:

```bash
node exploit.js
```

You should see the flag printed.

---

## 📁 Project Structure

```
react2shell-ctf/
├── README.md              # This file
├── package.json           # Dependencies (vulnerable Next.js)
├── next.config.js         # Next.js configuration
├── flag.txt               # Local flag for testing
├── exploit.js             # Working exploit (keep secret!)
├── exploit-template.js    # Template for participants (optional)
└── app/
    ├── layout.js          # Root layout
    ├── page.js            # Main page with Server Action
    └── actions.js         # Server Action (vulnerable endpoint)
```

---

## 🎓 Learning Objectives

After completing this challenge, participants will understand:

1. How React Server Components and Flight protocol work
2. The dangers of deserializing untrusted data
3. Prototype pollution and property traversal attacks
4. How `Function` constructor enables code execution
5. The importance of `hasOwnProperty` checks

---

## 📚 Resources

- [CVE-2025-55182](https://nvd.nist.gov/) - The vulnerability details
- [React Flight Protocol](https://github.com/facebook/react) - How RSC serialization works
- [Prototype Pollution](https://portswigger.net/web-security/prototype-pollution) - Background on the attack class
