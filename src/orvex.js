import { OrvexError } from "./error.js";       // custom error class used everywhere in the SDK
import { OrvexTable } from "./table.js";       // namespaced table wrapper, returned by .table()

// ---------- defaults and limits ----------
const DEFAULT_TIMEOUT = 30000;                 // 30 seconds per request before aborting
const DEFAULT_RETRIES = 2;                     // retry count on network errors, 429 and 5xx
const MAX_KEY_LEN = 512;                       // hard cap on key length (client-side)
const MAX_FIELD_LEN = 256;                     // hard cap on hash field name length
const MAX_TTL_SECONDS = 31_536_000;            // 1 year — max allowed TTL
const MAX_BATCH = 100;                         // max items for mget / mset

// ---------- validators ----------
// Each validator throws OrvexError with a specific code.
// They run BEFORE any network call — bad input fails instantly, no quota burned.

function assertKey(key) {
  if (typeof key !== "string") {
    throw new OrvexError("key must be a string", "BAD_KEY", 0, null);
  }
  if (key.length === 0) {
    throw new OrvexError("key cannot be empty", "BAD_KEY", 0, null);
  }
  if (key.length > MAX_KEY_LEN) {
    throw new OrvexError(`key cannot exceed ${MAX_KEY_LEN} characters`, "BAD_KEY", 0, null);
  }
}

function assertField(field) {
  if (typeof field !== "string") {
    throw new OrvexError("field must be a string", "BAD_FIELD", 0, null);
  }
  if (field.length === 0) {
    throw new OrvexError("field cannot be empty", "BAD_FIELD", 0, null);
  }
  if (field.length > MAX_FIELD_LEN) {
    throw new OrvexError(`field cannot exceed ${MAX_FIELD_LEN} characters`, "BAD_FIELD", 0, null);
  }
}

function assertTtl(ttl) {
  if (ttl === undefined || ttl === null) return;                 // TTL is optional
  if (typeof ttl !== "number" || !Number.isFinite(ttl)) {
    throw new OrvexError("ttlSeconds must be a finite number", "BAD_TTL", 0, null);
  }
  if (!Number.isInteger(ttl)) {
    throw new OrvexError("ttlSeconds must be an integer", "BAD_TTL", 0, null);
  }
  if (ttl <= 0) {
    throw new OrvexError("ttlSeconds must be greater than 0", "BAD_TTL", 0, null);
  }
  if (ttl > MAX_TTL_SECONDS) {
    throw new OrvexError(`ttlSeconds cannot exceed ${MAX_TTL_SECONDS} (1 year)`, "BAD_TTL", 0, null);
  }
}

function assertSerializable(value, label = "value") {
  if (value === undefined) {
    throw new OrvexError(`${label} cannot be undefined`, "BAD_VALUE", 0, null);
  }
  if (typeof value === "function") {
    throw new OrvexError(`${label} cannot be a function`, "BAD_VALUE", 0, null);
  }
  if (typeof value === "symbol") {
    throw new OrvexError(`${label} cannot be a symbol`, "BAD_VALUE", 0, null);
  }
  if (typeof value === "bigint") {
    throw new OrvexError(`${label} cannot be a bigint`, "BAD_VALUE", 0, null);
  }
  try {
    JSON.stringify(value);                                       // ensure no circular refs
  } catch {
    throw new OrvexError(`${label} is not JSON-serializable (circular reference?)`, "BAD_VALUE", 0, null);
  }
}

function assertAmount(amount) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    throw new OrvexError("amount must be a finite number", "BAD_AMOUNT", 0, null);
  }
}

function assertKeysArray(keys) {
  if (!Array.isArray(keys)) throw new OrvexError("keys must be an array", "BAD_KEYS", 0, null);
  if (keys.length === 0) throw new OrvexError("keys array cannot be empty", "BAD_KEYS", 0, null);
  if (keys.length > MAX_BATCH) throw new OrvexError(`keys array cannot exceed ${MAX_BATCH} items`, "BAD_KEYS", 0, null);
  for (const k of keys) assertKey(k);                            // every key in the array must be valid
}

function assertPairsObject(pairs) {
  if (!pairs || typeof pairs !== "object" || Array.isArray(pairs)) {
    throw new OrvexError("pairs must be a plain object", "BAD_PAIRS", 0, null);
  }
  const entries = Object.entries(pairs);
  if (entries.length === 0) throw new OrvexError("pairs object cannot be empty", "BAD_PAIRS", 0, null);
  if (entries.length > MAX_BATCH) throw new OrvexError(`pairs object cannot exceed ${MAX_BATCH} entries`, "BAD_PAIRS", 0, null);
  for (const [k, v] of entries) {
    assertKey(k);
    assertSerializable(v, `value for key "${k}"`);
  }
}

function assertRange(start, stop) {
  if (!Number.isInteger(start)) throw new OrvexError("start must be an integer", "BAD_RANGE", 0, null);
  if (!Number.isInteger(stop)) throw new OrvexError("stop must be an integer", "BAD_RANGE", 0, null);
}

// ---------- client ----------
export class Orvex {
  constructor({ baseUrl, token, timeout = DEFAULT_TIMEOUT, retries = DEFAULT_RETRIES, fetch: customFetch, debug = false } = {}) {
    // token is required — everything is authenticated
    if (!token || typeof token !== "string") {
      throw new OrvexError("token required", "MISSING_TOKEN", 0, null);
    }
    // baseUrl is required — the SDK appends /v1 to it internally
    if (!baseUrl || typeof baseUrl !== "string") {
      throw new OrvexError("baseUrl required", "MISSING_BASE_URL", 0, null);
    }
    this.token = token;
    this.baseUrl = baseUrl.replace(/\/$/, "");                   // strip trailing slash for consistency
    this.timeout = timeout;
    this.retries = retries;
    this._fetch = customFetch || globalThis.fetch;               // allow injecting a custom fetch
    this.userId = null;                                          // set after first successful response
    this.debug = debug === true;                                 // only log when explicitly enabled

    if (this.debug) {
      console.log(`[orvex] client created → ${this.baseUrl}`);
    }
  }

  // internal log helper — prints only when debug is true
  _log(...args) {
    if (this.debug) console.log("[orvex]", ...args);
  }

  // low-level HTTP transport used by every named method
  async call(cmd, args = [], attempt = 0) {
    const start = Date.now();
    const attemptLabel = attempt > 0 ? ` (retry ${attempt})` : "";
    this._log(`→ ${cmd}`, args, attemptLabel);

    // AbortController + timer enforces the per-request timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let res;
    try {
      res = await this._fetch(`${this.baseUrl}/v1`, {           // the actual POST
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.token}`,
          "User-Agent": "orvexdb/1.0.0"
        },
        body: JSON.stringify({ cmd, args }),
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timer);
      this._log(`✗ ${cmd} network error:`, err.message);
      if (attempt < this.retries) {                              // retry network errors with backoff
        this._log(`  retrying ${cmd}...`);
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
        return this.call(cmd, args, attempt + 1);
      }
      throw new OrvexError(err.message || "Network error", "NETWORK_ERROR", 0, null);
    } finally {
      clearTimeout(timer);                                       // always clear the timeout
    }

    // 429 — respect the Retry-After header and try again
    if (res.status === 429 && attempt < this.retries) {
      const wait = Number(res.headers.get("Retry-After") || 1);
      this._log(`↻ ${cmd} 429, retrying in ${wait}s`);
      await new Promise(r => setTimeout(r, wait * 1000));
      return this.call(cmd, args, attempt + 1);
    }

    // 5xx — retry with exponential backoff
    if (res.status >= 500 && attempt < this.retries) {
      this._log(`↻ ${cmd} ${res.status}, retrying...`);
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
      return this.call(cmd, args, attempt + 1);
    }

    // parse the JSON body — a non-JSON response is a hard failure
    let body;
    try {
      body = await res.json();
    } catch {
      this._log(`✗ ${cmd} bad response body`);
      throw new OrvexError("Invalid response from server", "BAD_RESPONSE", res.status, null);
    }

    // verify the response belongs to the same user as previous responses
    if (body.userId) {
      if (this.userId && this.userId !== body.userId) {
        this._log(`✗ ${cmd} token mismatch: ${this.userId} vs ${body.userId}`);
        throw new OrvexError(
          `Token mismatch: expected ${this.userId}, got ${body.userId}`,
          "TOKEN_MISMATCH",
          res.status,
          body
        );
      }
      this.userId = body.userId;                                 // cache for the next call
    }

    // any non-2xx response becomes an OrvexError with the server's code
    if (!res.ok) {
      this._log(`✗ ${cmd} ${res.status} ${body.code || "UNKNOWN"}: ${body.error || ""}`);
      throw new OrvexError(
        body.error || "Request failed",
        body.code || "UNKNOWN",
        res.status,
        body
      );
    }

    // success — log timing and return just the result value
    const ms = Date.now() - start;
    this._log(`← ${cmd} (${ms}ms)`, body.result);
    return body.result;
  }

  // returns a namespaced table wrapper
  table(name) {
    this._log(`table("${name}")`);
    return new OrvexTable(this, name);
  }

  // ---------- strings ----------

  // store a value, optional TTL in seconds
  set(key, value, ttlSeconds) {
    assertKey(key);
    assertSerializable(value, "value");
    assertTtl(ttlSeconds);
    return ttlSeconds === undefined
      ? this.call("set", [key, value])
      : this.call("set", [key, value, ttlSeconds]);
  }

  // read a value — returns null if missing or expired
  get(key) {
    assertKey(key);
    return this.call("get", [key]);
  }

  // delete a key
  del(key) {
    assertKey(key);
    return this.call("del", [key]);
  }

  // increment a numeric value, default step is 1
  incrBy(key, amount = 1) {
    assertKey(key);
    assertAmount(amount);
    return this.call("incrBy", [key, amount]);
  }

  // read many keys in one request
  mget(keys) {
    assertKeysArray(keys);
    return this.call("mget", [keys]);
  }

  // write many key-value pairs in one request
  mset(pairs) {
    assertPairsObject(pairs);
    return this.call("mset", [pairs]);
  }

  // set TTL on an existing key
  expire(key, ttlSeconds) {
    assertKey(key);
    assertTtl(ttlSeconds);
    if (ttlSeconds === undefined) {
      throw new OrvexError("ttlSeconds is required for expire()", "BAD_TTL", 0, null);
    }
    return this.call("expire", [key, ttlSeconds]);
  }

  // remaining seconds until expiry (-1 = no TTL, -2 = missing)
  ttl(key) {
    assertKey(key);
    return this.call("ttl", [key]);
  }

  // ---------- lists ----------

  // append to the right of a list
  rpush(key, value) {
    assertKey(key);
    assertSerializable(value, "value");
    return this.call("rpush", [key, value]);
  }

  // prepend to the left of a list
  lpush(key, value) {
    assertKey(key);
    assertSerializable(value, "value");
    return this.call("lpush", [key, value]);
  }

  // pop from the right of a list
  rpop(key) {
    assertKey(key);
    return this.call("rpop", [key]);
  }

  // pop from the left of a list
  lpop(key) {
    assertKey(key);
    return this.call("lpop", [key]);
  }

  // get a range of list items (inclusive)
  lrange(key, start = 0, stop = -1) {
    assertKey(key);
    assertRange(start, stop);
    return this.call("lrange", [key, start, stop]);
  }

  // ---------- hashes ----------

  // set a field in a hash
  hset(key, field, value) {
    assertKey(key);
    assertField(field);
    assertSerializable(value, "value");
    return this.call("hset", [key, field, value]);
  }

  // get one field from a hash
  hget(key, field) {
    assertKey(key);
    assertField(field);
    return this.call("hget", [key, field]);
  }

  // get every field in a hash as an object
  hgetall(key) {
    assertKey(key);
    return this.call("hgetall", [key]);
  }

  // delete one field from a hash
  hdel(key, field) {
    assertKey(key);
    assertField(field);
    return this.call("hdel", [key, field]);
  }

  // ---------- sets ----------

  // add a member to a set
  sadd(key, member) {
    assertKey(key);
    assertSerializable(member, "member");
    return this.call("sadd", [key, member]);
  }

  // list all members of a set
  smembers(key) {
    assertKey(key);
    return this.call("smembers", [key]);
  }

  // remove a member from a set
  srem(key, member) {
    assertKey(key);
    assertSerializable(member, "member");
    return this.call("srem", [key, member]);
  }

  // ---------- meta ----------

  keys()        { return this.call("keys", []); }        // list every key
  flushDb()     { return this.call("flushDb", []); }     // wipe the user's store
  whoami()      { return this.call("whoami", []); }      // identify the current user
  usage()       { return this.call("usage", []); }       // monthly read/write counts
  storage()     { return this.call("storage", []); }     // disk usage
  dump()        { return this.call("dump", []); }        // full export
  restore(data) { return this.call("restore", [data]); } // full import
}