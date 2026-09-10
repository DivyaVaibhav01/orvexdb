// base path: src/table.js
import { OrvexError } from "./error.js";

const MAX_KEY_LEN = 512;
const MAX_FIELD_LEN = 256;
const MAX_TTL_SECONDS = 31_536_000;

// ---------- validators ----------
function assertKeyPart(key) {
  if (typeof key !== "string" || key.length === 0) {
    throw new OrvexError("key must be a non-empty string", "BAD_KEY", 0, null);
  }
  if (key.includes(":")) {
    throw new OrvexError("table keys cannot contain ':'", "BAD_KEY", 0, null);
  }
  if (key.length > MAX_KEY_LEN) {
    throw new OrvexError(`key cannot exceed ${MAX_KEY_LEN} characters`, "BAD_KEY", 0, null);
  }
}

function assertField(field) {
  if (typeof field !== "string" || field.length === 0) {
    throw new OrvexError("field must be a non-empty string", "BAD_FIELD", 0, null);
  }
  if (field.length > MAX_FIELD_LEN) {
    throw new OrvexError(`field cannot exceed ${MAX_FIELD_LEN} characters`, "BAD_FIELD", 0, null);
  }
}

function assertTtl(ttl) {
  if (ttl === undefined || ttl === null) return;
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
  if (value === undefined) throw new OrvexError(`${label} cannot be undefined`, "BAD_VALUE", 0, null);
  if (typeof value === "function") throw new OrvexError(`${label} cannot be a function`, "BAD_VALUE", 0, null);
  if (typeof value === "symbol") throw new OrvexError(`${label} cannot be a symbol`, "BAD_VALUE", 0, null);
  if (typeof value === "bigint") throw new OrvexError(`${label} cannot be a bigint`, "BAD_VALUE", 0, null);
  try { JSON.stringify(value); }
  catch { throw new OrvexError(`${label} is not JSON-serializable`, "BAD_VALUE", 0, null); }
}

function assertAmount(amount) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    throw new OrvexError("amount must be a finite number", "BAD_AMOUNT", 0, null);
  }
}

function assertRange(start, stop) {
  if (!Number.isInteger(start)) throw new OrvexError("start must be an integer", "BAD_RANGE", 0, null);
  if (!Number.isInteger(stop)) throw new OrvexError("stop must be an integer", "BAD_RANGE", 0, null);
}

// ---------- table ----------
export class OrvexTable {
  constructor(client, name) {
    if (typeof name !== "string" || !/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new OrvexError("Invalid table name", "BAD_TABLE", 0, null);
    }
    if (name.length > 64) {
      throw new OrvexError("Table name too long", "BAD_TABLE", 0, null);
    }
    this.client = client;
    this.prefix = `${name}:`;
  }

  // Prefix and validate a key for this table.
  _k(key) {
    assertKeyPart(key);
    return this.prefix + key;
  }

  // ---------- strings ----------
  set(key, value, ttlSeconds) {
    assertSerializable(value, "value");
    assertTtl(ttlSeconds);
    const k = this._k(key);
    return ttlSeconds === undefined
      ? this.client.call("set", [k, value])
      : this.client.call("set", [k, value, ttlSeconds]);
  }

  get(key) {
    const k = this._k(key);
    return this.client.call("get", [k]);
  }

  del(key) {
    const k = this._k(key);
    return this.client.call("del", [k]);
  }

  incrBy(key, amount = 1) {
    assertAmount(amount);
    const k = this._k(key);
    return this.client.call("incrBy", [k, amount]);
  }

  expire(key, ttlSeconds) {
    assertTtl(ttlSeconds);
    if (ttlSeconds === undefined) {
      throw new OrvexError("ttlSeconds is required for expire()", "BAD_TTL", 0, null);
    }
    const k = this._k(key);
    return this.client.call("expire", [k, ttlSeconds]);
  }

  ttl(key) {
    const k = this._k(key);
    return this.client.call("ttl", [k]);
  }

  // ---------- lists ----------
  rpush(key, value) {
    assertSerializable(value, "value");
    const k = this._k(key);
    return this.client.call("rpush", [k, value]);
  }

  lpush(key, value) {
    assertSerializable(value, "value");
    const k = this._k(key);
    return this.client.call("lpush", [k, value]);
  }

  rpop(key) {
    const k = this._k(key);
    return this.client.call("rpop", [k]);
  }

  lpop(key) {
    const k = this._k(key);
    return this.client.call("lpop", [k]);
  }

  lrange(key, start = 0, stop = -1) {
    assertRange(start, stop);
    const k = this._k(key);
    return this.client.call("lrange", [k, start, stop]);
  }

  // ---------- hashes ----------
  hset(key, field, value) {
    assertField(field);
    assertSerializable(value, "value");
    const k = this._k(key);
    return this.client.call("hset", [k, field, value]);
  }

  hget(key, field) {
    assertField(field);
    const k = this._k(key);
    return this.client.call("hget", [k, field]);
  }

  hgetall(key) {
    const k = this._k(key);
    return this.client.call("hgetall", [k]);
  }

  hdel(key, field) {
    assertField(field);
    const k = this._k(key);
    return this.client.call("hdel", [k, field]);
  }

  // ---------- sets ----------
  sadd(key, member) {
    assertSerializable(member, "member");
    const k = this._k(key);
    return this.client.call("sadd", [k, member]);
  }

  smembers(key) {
    const k = this._k(key);
    return this.client.call("smembers", [k]);
  }

  srem(key, member) {
    assertSerializable(member, "member");
    const k = this._k(key);
    return this.client.call("srem", [k, member]);
  }

  // ---------- table-level ----------
  async keys() {
    const all = await this.client.call("keys", []);
    return all
      .filter(k => k.startsWith(this.prefix))
      .map(k => k.slice(this.prefix.length));
  }

  async drop() {
    const keys = await this.keys();
    let count = 0;
    for (const k of keys) {
      await this.del(k);
      count++;
    }
    return count;
  }
}