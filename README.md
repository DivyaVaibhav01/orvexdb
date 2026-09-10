# OrvexC A Cloud Databases Built On SQLite

```bash
npm install orvexdb
```

```js
import { OrvexClient } from "orvexdb";

const db = new OrvexClient({ 
    dbUrl: "https://api.orvex.tech/v1",
    token: "sk_live_..."
});

await db.set("greeting", "hello");
await db.get("greeting"); // "hello"
```

---

## Install

```bash
npm install orvexdb
```

Works in Node 18+, Bun (python soon).

---

## Quick start

```js
import { OrvexClient } from "orvexdb";

const db = new OrvexClient({ 
    dbUrl: "https://api.orvex.tech/v1",
    token: "sk_live_..."
});

// Strings
await db.set("greeting", "hello");
await db.get("greeting");         // "hello"
await db.del("greeting");

// Objects
await db.set("user", { name: "Alice", age: 30 });
await db.get("user");             // { name: "Alice", age: 30 }

// TTL
await db.set("session", "abc123", 60);  // expires in 60s
await db.ttl("session");                // 60

// Counters
await db.incrBy("visits", 1);     // 1
await db.incrBy("visits", 5);     // 6
```

---

## Tables (namespaces)

Group keys into logical tables. Keys never collide across tables.

```js
const users  = db.table("users");
const orders = db.table("orders");

await users.set("alice", { name: "Alice" });
await users.set("bob",   { name: "Bob" });

await orders.set("order_1", { user: "alice", total: 100 });

await users.keys();   // ["alice", "bob"]
await orders.keys();  // ["order_1"]

await users.drop();   // deletes all keys in "users"
```

Tables are namespaces — keys get prefixed internally. No schema, no migration.

---

## Lists

```js
await db.rpush("queue", "item1");
await db.rpush("queue", "item2");
await db.lpush("queue", "item0");    // prepend

await db.lrange("queue", 0, -1);     // ["item0", "item1", "item2"]
await db.lpop("queue");              // "item0"
await db.rpop("queue");              // "item2"
```

---

## Hashes

```js
await db.hset("user:1", "name", "Alice");
await db.hset("user:1", "age", 30);

await db.hget("user:1", "name");     // "Alice"
await db.hgetall("user:1");          // { name: "Alice", age: 30 }
await db.hdel("user:1", "age");
```

---

## Sets

```js
await db.sadd("tags", "js");
await db.sadd("tags", "backend");
await db.smembers("tags");           // ["js", "backend"]
await db.srem("tags", "js");
```

---

## Backup and restore

```js
const backup = await db.dump();
// save backup to a file...

await db.restore(backup);
```

`dump()` returns everything the user has stored, in one call. `restore()` writes it back. Both count as one read/write toward the quota, regardless of how much data.

---

## Usage and storage

```js
await db.usage();
// { month: "2026-09", reads: 42, writes: 7, limits: { reads: 100000, writes: 20000 } }

await db.storage();
// { bytesUsed: 4096, bytesLimit: 262144000, percentUsed: 0 }
```

---

## All commands

### Strings

| Method | Returns | Description |
|---|---|---|
| `set(key, value, ttl?)` | `"OK"` | Store a value, optional TTL in seconds |
| `get(key)` | value \| `null` | Read a value |
| `del(key)` | `{ deleted, value }` | Delete a key |
| `incrBy(key, n?)` | `number` | Increment a numeric value |
| `mget([keys])` | `unknown[]` | Read many keys |
| `mset({pairs})` | `"OK"` | Write many keys |
| `expire(key, ttl)` | `0 \| 1` | Set TTL on existing key |
| `ttl(key)` | `number` | Seconds until expiry (-1 = no TTL, -2 = no key) |

### Lists

| Method | Returns | Description |
|---|---|---|
| `rpush(key, v)` | `number` | Append to list |
| `lpush(key, v)` | `number` | Prepend to list |
| `rpop(key)` | value \| `null` | Pop from end |
| `lpop(key)` | value \| `null` | Pop from start |
| `lrange(key, a, b)` | `unknown[]` | Range (inclusive) |

### Hashes

| Method | Returns | Description |
|---|---|---|
| `hset(key, field, v)` | `1` | Set a field |
| `hget(key, field)` | value \| `null` | Get a field |
| `hgetall(key)` | `object` | Get all fields |
| `hdel(key, field)` | `number` | Delete a field |

### Sets

| Method | Returns | Description |
|---|---|---|
| `sadd(key, member)` | `number` | Add member (1 if new) |
| `smembers(key)` | `unknown[]` | List members |
| `srem(key, member)` | `number` | Remove member |

### Meta

| Method | Returns | Description |
|---|---|---|
| `keys()` | `string[]` | List every key |
| `flushDb()` | `"OK"` | Delete everything |
| `whoami()` | `{ userId }` | Which account is this token |
| `usage()` | `{ reads, writes, limits }` | Monthly usage |
| `storage()` | `{ bytesUsed, bytesLimit }` | Disk usage |
| `dump()` | `{ strings, lists, hashes, sets }` | Full backup |
| `restore(data)` | `{ restored }` | Restore from backup |

All commands return a promise. All throw `OrvexError` on failure.

---

## Errors

Every error is an `OrvexError`:

```js
import { OrvexClient, OrvexError } from "orvexdb";

const db = new OrvexClient({ 
    dbUrl: "https://api.orvex.tech/v1",
    token: "sk_live_..."
});
try {
  await db.get("x");
} catch (err) {
  if (err instanceof OrvexError) {
    console.error(err.code);      // "INVALID_TOKEN", "QUOTA_WRITE", ...
    console.error(err.status);    // 401, 429, ...
    console.error(err.message);   // "Monthly write quota exceeded"
    console.error(err.retryAfter); // seconds, only on 429
  }
}
```

### Error codes

| Code | Status | Meaning |
|---|---|---|
| `MISSING_TOKEN` | — | No token passed to the constructor |
| `INVALID_TOKEN` | 401 | Token is wrong, missing, or revoked |
| `BAD_JSON` | 400 | Request body wasn't valid JSON |
| `BAD_CMD` | 400 | Command name invalid |
| `BAD_ARGS` | 400 | Args not an array |
| `TOO_MANY_ARGS` | 400 | More than 10 args |
| `ARG_TOO_LARGE` | 400 | Any arg over 10 KB |
| `UNKNOWN_CMD` | 400 | Command not supported |
| `QUOTA_READ` | 429 | Monthly read quota exceeded |
| `QUOTA_WRITE` | 429 | Monthly write quota exceeded |
| `QUOTA_STORAGE` | 429 | Storage limit reached |
| `RATE_LIMITED` | 429 | Too many requests per minute |
| `TOKEN_MISMATCH` | — | Token changed mid-session |
| `NETWORK_ERROR` | — | Couldn't reach the server |
| `BAD_RESPONSE` | — | Server returned non-JSON |
| `INTERNAL` | 500 | Server-side error |

On `QUOTA_*` and `RATE_LIMITED` errors, `err.retryAfter` holds seconds until reset.

---

## Options

```js
const db = new Orvex({
  token: "sk_live_...",                 // required
  dbUrl: "https://api.orvexdb.dev",   // required
  timeout: 30000,                       // optional, ms
  retries: 2,                           // optional, retry on 429/5xx
  fetch: customFetch                    // optional, custom fetch
});
```

---

## TypeScript

Orvex ships with full TypeScript types. No `@types/orvexdb` needed.

```ts
import { OrvexClient, OrvexError } from "orvexdb";

const db = new OrvexClient({ 
    dbUrl: "https://api.orvex.tech/v1",
    token: "sk_live_..."
});

interface User { name: string; age: number }

await db.set("alice", { name: "Alice", age: 30 } as User);
const user = await db.get<User>("alice");   // User | null
user?.name;                                 // string
```

For `tsconfig.json`, use:

- `"module": "NodeNext"` (or `"ESNext"`)
- `"moduleResolution": "NodeNext"` (or `"Bundler"`)

---

## Quotas

Every hero account has, per month:

| Metric | Limit |
|---|---|
| Reads | 100,000 |
| Writes | 20,000 |
| Storage | 250 MB |

When you hit a limit, the operation is refused with `QUOTA_*`. Your data is **never deleted**. The quota resets on the 1st of each month, UTC.

`whoami`, `usage`, and `storage` are always free — they don't count toward quotas.

---

## License

MIT
