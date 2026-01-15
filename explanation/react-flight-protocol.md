# React Flight Protocol Overview

A quick reference for understanding how React's Flight protocol works and how chunks reference each other.

---

## What is Flight?

Flight is React's wire protocol for streaming React Server Components (RSC) from server to client. It serializes component trees, props, and data into a text-based format that can be streamed and incrementally parsed.

---

## Basic Format

Each line in a Flight stream follows this structure:

```
<chunk_id>:<type_marker><serialized_data>
```

For Server Actions (multipart/form-data), chunks are sent as form fields:

```
"0" = '["$1"]'
"1" = '{"name":"$2"}'
"2" = '"hello"'
```

---

## Chunk Resolution

Chunks are lazy-loaded and reference each other. When a chunk is needed:

1. Check if chunk exists in `response._chunks`
2. If status is `resolved_model`, parse the JSON and resolve references
3. If a reference points to an unresolved chunk, block until it resolves
4. Once all dependencies resolve, chunk becomes `initialized`

```
Chunk States:
  pending → resolved_model → initialized
                ↓
            (blocked if waiting on dependencies)
```

---

## Reference Types

| Syntax | Name | Description |
|--------|------|-------------|
| `$1` | Chunk Reference | Resolves to chunk 1's **value** |
| `$@1` | Promise Reference | Returns the chunk **object** itself (not its value) |
| `$1:foo:bar` | Property Path | Resolves chunk 1, then accesses `.foo.bar` |
| `$B1` | Blob Reference | Blob data from `response._formData` |
| `$F` | Server Reference | Reference to a server function |
| `$$` | Escaped Dollar | Literal `$` character |

---

## How Chunk References Work

### Simple Reference: `$1`

```javascript
// "$1" in chunk 0 means:
// "Replace this with chunk 1's resolved value"

chunks["0"] = "$1"
chunks["1"] = '{"message":"hello"}'

// Result: chunk 0 resolves to { message: "hello" }
```

### Property Path: `$1:foo:bar`

```javascript
// "$1:foo:bar" means:
// 1. Get chunk 1's value
// 2. Access .foo
// 3. Access .bar

chunks["1"] = '{"foo":{"bar":"value"}}'

// "$1:foo:bar" → "value"
```

### Promise Reference: `$@1`

```javascript
// "$@1" returns the Chunk OBJECT, not its value
// This gives access to internal properties like .then

chunks["1"] = "[]"

// "$1" → []  (the resolved value)
// "$@1" → Chunk { status, value, _response, then: fn }  (the wrapper)
```

---

## Circular References

Chunks can reference each other, creating dependency chains:

```
Chunk 0: "$1"      → needs chunk 1
Chunk 1: "$2"      → needs chunk 2
Chunk 2: "[]"      → no dependencies (resolves first)

Resolution order: 2 → 1 → 0
```

The protocol handles this by:
1. Marking waiting chunks as `blocked`
2. Registering callbacks on dependency chunks
3. Resolving bottom-up when dependencies complete

---

## Example: Full Resolution Flow

```javascript
// Form data received:
"0" = "$1"
"1" = '{"items":"$2","count":3}'
"2" = '["a","b","c"]'

// Step 1: Chunk 2 resolves (no deps)
chunk2.value = ["a", "b", "c"]

// Step 2: Chunk 1 resolves (deps satisfied)
chunk1.value = { items: ["a", "b", "c"], count: 3 }

// Step 3: Chunk 0 resolves
chunk0.value = { items: ["a", "b", "c"], count: 3 }
```

---

## Key Internals

| Component | Purpose |
|-----------|---------|
| `response._chunks` | Map of chunk ID → Chunk object |
| `Chunk.prototype.then` | Makes chunks thenable (Promise-like) |
| `initializeModelChunk()` | Parses JSON and resolves `$` references |
| `parseModelString()` | Handles different `$` reference types |
| `getOutlinedModel()` | Processes property paths (`:` notation) |

---

## See Also

- [explanation.md](./explanation.md) - Deep dive into CVE-2025-55182
- [payload-walkthrough.md](./payload-walkthrough.md) - Step-by-step exploit trace
