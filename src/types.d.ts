export interface OrvexOptions {
  token: string; // The API token used for authentication with the Orvex service.
  baseUrl?: string; // dbUrl for the Orvex service. If not provided, a default URL will be used.
  timeout?: number; // The maximum time (in milliseconds) to wait for a response from the Orvex service before timing out. If not provided, a default timeout will be used.
  retries?: number; // The number of times to retry a failed request to the Orvex service. If not provided, a default retry count will be used.
  fetch?: typeof fetch; // An optional custom fetch function to use for making HTTP requests. If not provided, the global fetch function will be used.
}

export interface OrvexDump {
  strings: Record<string, unknown>; // A record of string keys and their corresponding values in the Orvex database.
  lists: Record<string, unknown[]>; // A record of list keys and their corresponding array of values in the Orvex database.
  hashes: Record<string, Record<string, unknown>>; // A record of hash keys and their corresponding field-value pairs in the Orvex database.
  sets: Record<string, unknown[]>; // A record of set keys and their corresponding array of unique values in the Orvex database.
}

export interface OrvexUsage {
  month: string; // The month for which the usage statistics are reported, in the format "YYYY-MM".
  reads: number; // The total number of read operations performed on the Orvex database during the specified month.
  writes: number; // The total number of write operations performed on the Orvex database during the specified month.
  limits: { reads: number; writes: number }; // The maximum allowed number of read and write operations for the specified month, as defined by the Orvex service.
}

export interface OrvexStorage {
  bytesUsed: number; // The total number of bytes currently used in the Orvex database.
  bytesLimit: number; // The maximum number of bytes allowed in the Orvex database, as defined by the Orvex service.
  percentUsed: number; // The percentage of the total storage limit that is currently used in the Orvex database, calculated as (bytesUsed / bytesLimit) * 100.
}

export class OrvexError extends Error {
  name: "OrvexError"; // error handler
  code: string; // error code base 
  status: number; // HTTP status code associated with the error
  data: unknown; // Additional data related to the error, if any
  retryAfter?: number; // Optional property indicating the number of seconds to wait before retrying the request, if applicable
  constructor(message: string, code?: string, status?: number, data?: unknown); // Constructor for creating an instance of OrvexError with a message, optional code, status, and additional data
}

export class Orvex { // Orvex client class for interacting with the Orvex service
  constructor(opts: OrvexOptions);
  readonly token: string;
  readonly baseUrl: string;
  readonly userId: string | null;

  call(cmd: string, args?: unknown[]): Promise<unknown>; // Method for making a command call to the Orvex service with the specified command and optional arguments, returning a promise that resolves with the result of the command

  table(name: string): OrvexTable; // Method for creating or accessing a table in the Orvex database with the specified name, returning an instance of OrvexTable for performing operations on that table

  set(key: string, value: unknown, ttlSeconds?: number): Promise<"OK">; // Method for setting a key-value pair in the Orvex database with an optional time-to-live (TTL) in seconds, returning a promise that resolves with "OK" if the operation is successful
  get<T = unknown>(key: string): Promise<T | null>; // Method for retrieving the value associated with a key in the Orvex database, returning a promise that resolves with the value or null if the key does not exist
  del(key: string): Promise<{ deleted: boolean; value: unknown }>; // Method for deleting a key-value pair from the Orvex database, returning a promise that resolves with an object indicating whether the key was deleted and the value that was associated with the key
  incrBy(key: string, amount?: number): Promise<number>; // Method for incrementing the numeric value associated with a key in the Orvex database by a specified amount (default is 1), returning a promise that resolves with the new value after the increment operation
  mget(keys: string[]): Promise<unknown[]>; // Method for retrieving the values associated with multiple keys in the Orvex database, returning a promise that resolves with an array of values corresponding to the specified keys
  mset(pairs: Record<string, unknown>): Promise<"OK">; // Method for setting multiple key-value pairs in the Orvex database at once, returning a promise that resolves with "OK" if the operation is successful
  expire(key: string, ttlSeconds: number): Promise<0 | 1>; // Method for setting a time-to-live (TTL) in seconds for a key in the Orvex database, returning a promise that resolves with 1 if the TTL was set successfully or 0 if the key does not exist
  ttl(key: string): Promise<number>; // Method for retrieving the remaining time-to-live (TTL) in seconds for a key in the Orvex database, returning a promise that resolves with the TTL value or -1 if the key does not exist or has no associated TTL

  rpush(key: string, value: unknown): Promise<number>; // Method for appending a value to the end of a list associated with a key in the Orvex database, returning a promise that resolves with the new length of the list after the operation
  lpush(key: string, value: unknown): Promise<number>; // Method for prepending a value to the beginning of a list associated with a key in the Orvex database, returning a promise that resolves with the new length of the list after the operation
  rpop(key: string): Promise<unknown>; // Method for removing and returning the last element of a list associated with a key in the Orvex database, returning a promise that resolves with the removed value or null if the list is empty or the key does not exist
  lpop(key: string): Promise<unknown>; // Method for removing and returning the first element of a list associated with a key in the Orvex database, returning a promise that resolves with the removed value or null if the list is empty or the key does not exist
  lrange(key: string, start?: number, stop?: number): Promise<unknown[]>; // Method for retrieving a range of elements from a list associated with a key in the Orvex database, returning a promise that resolves with an array of values corresponding to the specified range (start and stop indices)

  hset(key: string, field: string, value: unknown): Promise<1>; // Method for setting a field-value pair in a hash associated with a key in the Orvex database, returning a promise that resolves with 1 if the field was set successfully
  hget(key: string, field: string): Promise<unknown>; // Method for retrieving the value associated with a field in a hash associated with a key in the Orvex database, returning a promise that resolves with the value or null if the field does not exist
  hgetall(key: string): Promise<Record<string, unknown>>; // Method for retrieving all field-value pairs in a hash associated with a key in the Orvex database, returning a promise that resolves with an object containing the field-value pairs or an empty object if the hash does not exist
  hdel(key: string, field: string): Promise<number>; // Method for deleting a field from a hash associated with a key in the Orvex database, returning a promise that resolves with the number of fields that were removed (0 or 1)

  sadd(key: string, member: unknown): Promise<number>; // Method for adding a member to a set associated with a key in the Orvex database, returning a promise that resolves with the number of members that were added to the set (0 or 1)
  smembers(key: string): Promise<unknown[]>; // Method for retrieving all members of a set associated with a key in the Orvex database, returning a promise that resolves with an array of unique values in the set or an empty array if the set does not exist
  srem(key: string, member: unknown): Promise<number>; // Method for removing a member from a set associated with a key in the Orvex database, returning a promise that resolves with the number of members that were removed from the set (0 or 1)

  keys(): Promise<string[]>; // Method for retrieving all keys in the Orvex database, returning a promise that resolves with an array of key names
  flushDb(): Promise<"OK">; // Method for clearing all keys and data in the Orvex database, returning a promise that resolves with "OK" if the operation is successful
  whoami(): Promise<{ userId: string }>; // Method for retrieving information about the authenticated user, returning a promise that resolves with an object containing the user ID
  usage(): Promise<OrvexUsage>; // Method for retrieving usage statistics for the Orvex database, returning a promise that resolves with an object containing the usage data (reads, writes, limits) for the current month
  storage(): Promise<OrvexStorage>; // Method for retrieving storage information for the Orvex database, returning a promise that resolves with an object containing the storage data (bytesUsed, bytesLimit, percentUsed)
  dump(): Promise<OrvexDump>; // Method for creating a dump of the current state of the Orvex database, returning a promise that resolves with an object containing the data in the form of strings, lists, hashes, and sets
  restore(data: OrvexDump): Promise<{ restored: number }>; // Method for restoring the state of the Orvex database from a provided dump, returning a promise that resolves with an object indicating the number of keys that were restored
}

export class OrvexTable {
  constructor(client: Orvex, name: string);

  set(key: string, value: unknown, ttlSeconds?: number): Promise<"OK">; // Method for setting a key-value pair in the table with an optional time-to-live (TTL) in seconds, returning a promise that resolves with "OK" if the operation is successful
  get<T = unknown>(key: string): Promise<T | null>; // Method for retrieving the value associated with a key in the table, returning a promise that resolves with the value or null if the key does not exist
  del(key: string): Promise<{ deleted: boolean; value: unknown }>; // Method for deleting a key-value pair from the table, returning a promise that resolves with an object indicating whether the key was deleted and the value that was associated with the key
  incrBy(key: string, amount?: number): Promise<number>; // Method for incrementing the numeric value associated with a key in the table by a specified amount (default is 1), returning a promise that resolves with the new value after the increment operation
  expire(key: string, ttlSeconds: number): Promise<0 | 1>; // Method for setting a time-to-live (TTL) in seconds for a key in the table, returning a promise that resolves with 1 if the TTL was set successfully or 0 if the key does not exist
  ttl(key: string): Promise<number>; // Method for retrieving the remaining time-to-live (TTL) in seconds for a key in the table, returning a promise that resolves with the TTL value or -1 if the key does not exist or has no associated TTL

  rpush(key: string, value: unknown): Promise<number>; // Method for appending a value to the end of a list associated with a key in the table, returning a promise that resolves with the new length of the list after the operation
  lpush(key: string, value: unknown): Promise<number>; // Method for prepending a value to the beginning of a list associated with a key in the table, returning a promise that resolves with the new length of the list after the operation
  rpop(key: string): Promise<unknown>; // Method for removing and returning the last element of a list associated with a key in the table, returning a promise that resolves with the removed value or null if the list is empty or the key does not exist
  lpop(key: string): Promise<unknown>; // Method for removing and returning the first element of a list associated with a key in the table, returning a promise that resolves with the removed value or null if the list is empty or the key does not exist
  lrange(key: string, start?: number, stop?: number): Promise<unknown[]>; // Method for retrieving a range of elements from a list associated with a key in the table, returning a promise that resolves with an array of values corresponding to the specified range (start and stop indices)

  hset(key: string, field: string, value: unknown): Promise<1>; // Method for setting a field-value pair in a hash associated with a key in the table, returning a promise that resolves with 1 if the field was set successfully
  hget(key: string, field: string): Promise<unknown>; // Method for retrieving the value associated with a field in a hash associated with a key in the table, returning a promise that resolves with the value or null if the field does not exist
  hgetall(key: string): Promise<Record<string, unknown>>; // Method for retrieving all field-value pairs in a hash associated with a key in the table, returning a promise that resolves with an object containing the field-value pairs or an empty object if the hash does not exist
  hdel(key: string, field: string): Promise<number>; // Method for deleting a field from a hash associated with a key in the table, returning a promise that resolves with the number of fields that were removed (0 or 1)

  sadd(key: string, member: unknown): Promise<number>; // Method for adding a member to a set associated with a key in the table, returning a promise that resolves with the number of members that were added to the set (0 or 1)
  smembers(key: string): Promise<unknown[]>; // Method for retrieving all members of a set associated with a key in the table, returning a promise that resolves with an array of unique values in the set or an empty array if the set does not exist
  srem(key: string, member: unknown): Promise<number>; // Method for removing a member from a set associated with a key in the table, returning a promise that resolves with the number of members that were removed from the set (0 or 1)

  keys(): Promise<string[]>; // Method for retrieving all keys in the table, returning a promise that resolves with an array of key names
  drop(): Promise<number>; // Method for dropping the table by deleting all keys with the table prefix, returning a promise that resolves with the number of keys that were deleted
}