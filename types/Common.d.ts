import {
  DBOps,
  DBRoom,
  DBRoomFlag,
  DBRoomObject,
  DBRoomTerrain,
  DBUser,
  DBUserCode,
  DBUserConsole,
  DBUserMessage,
  DBUserNotification,
  DBUserPowerCreep
} from "./DataBase";

export interface Common {
  configManager: CommonConfigManager;
  storage: CommonStorage;
  rpc: CommonRPC;
}

export interface CommonRPC {
  JSONFrameStream: unknown;
  RpcServer: unknown;
  RpcClient: unknown;
}

export type CommonConstants = Record<string, unknown>;
export type CommonStrongholds = Record<string, unknown>;

export interface CommonConfig {
  common: {
    constants: CommonConstants;
    strongholds: CommonStrongholds;
    system: unknown;
    bots: unknown;
  };
}

export interface CommonConfigManager {
  config: CommonConfig;

  load(): void;
}

export interface CommonQueue {
  fetch(): Promise<string>;
  add(): Promise<boolean>;
  addMulti(array: string[]): Promise<boolean>;
  markDone(): Promise<boolean>;
  whenAllDone(): Promise<boolean>;
  reset(): Promise<boolean>;
}

export interface CommonStorage {
  db: CommonStorageDBCollection;
  queue: CommonQueue;
  env: CommonStorageEnv;
  pubsub: CommonStoragePubsub;
}

export interface CommonStorageDBCollection {
  rooms: DBCollection<DBRoom>;
  "rooms.objects": DBCollection<DBRoomObject>;
  "rooms.flags": DBCollection<DBRoomFlag>;
  "rooms.terrain": DBCollection<DBRoomTerrain>;
  users: DBCollection<DBUser>;
  "users.code": DBCollection<DBUserCode>;
  "users.console": DBCollection<DBUserConsole>;
  "users.messages": DBCollection<DBUserMessage>;
  "users.notifications": DBCollection<DBUserNotification>;
  "users.power_creeps": DBCollection<DBUserPowerCreep>;
}

export type PartialModel<E, T> = { [P in keyof E]?: T | E[P] };
export type DBQuery<E> = PartialModel<E & { $and: unknown; $or: unknown }, { [Y in keyof typeof DBOps]?: unknown }>;
export type DBResult = Record<string, unknown>;
export type DBParams = Record<string, string | number | unknown>;

export interface DBFindExOpts {
  sort: Record<string, number>;
  offset: number;
  limit: number;
}

export interface DBCollection<T> {
  find(query?: DBQuery<T>): Promise<T[]>;
  findOne(query?: DBQuery<T>): Promise<T>;
  by(field: keyof CommonStorageDBCollection, value: unknown): Promise<T>;
  clear(): Promise<boolean>;
  count(): Promise<number>;
  ensureIndex(property: keyof CommonStorageDBCollection, force?: boolean): Promise<string>;
  removeWhere(query: DBQuery<T>): DBResult;
  insert(params: T | T[]): Promise<T>;
  update(query: DBQuery<T>, params: DBParams): Promise<DBResult>;
  findEx(query: DBQuery<T>, opts?: DBFindExOpts): Promise<T[]>;
}

export interface CommonStorageEnv {
  keys: {
    ACCESSIBLE_ROOMS: string;
    ROOM_STATUS_DATA: string;
    MEMORY: string;
    GAMETIME: string;
    MAP_VIEW: string;
    TERRAIN_DATA: string;
    SCRIPT_CACHED_DATA: string;
    USER_ONLINE: string;
    MAIN_LOOP_PAUSED: string;
    ROOM_HISTORY: string;
    ROOM_VISUAL: string;
    MEMORY_SEGMENTS: string;
    PUBLIC_MEMORY_SEGMENTS: string;
    ROOM_EVENT_LOG: string;
    ACTIVE_ROOMS: string;
    MAIN_LOOP_MIN_DURATION: string;
  };

  get(key: string): Promise<string>;
  mget(key: string): Promise<string>;
  mget(keys: string[]): Promise<string[]>;
  set(key: string, value: EnvValue): Promise<EnvResult>;
  setex(key: string, seconds: number, value: EnvValue): Promise<EnvResult>;
  expire(key: string, seconds: number): Promise<EnvResult>;
  ttl(key: string): Promise<number>;
  del(key: string): Promise<number>;
  hmget(hash: string, field: EnvField): Promise<string>;
  hmget(hash: string, field: EnvField[]): Promise<string[]>;
  hmset(hash: string, field: EnvField, value: EnvValue): Promise<EnvResult>;
  hmset(hash: string, fieldAndValues: Record<string, EnvValue>): Promise<EnvResult>;
  hget(hash: string, field: EnvField): Promise<string>;
  hset(hash: string, field: EnvField, value: EnvValue): Promise<EnvResult>;
  sadd(key: string, member: EnvValue | EnvValue[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
}

export type EnvField = string | number;
export type EnvValue = string | number;
export type EnvResult = "OK";
export interface CommonStoragePubsub {
  keys: {
    QUEUE_DONE: string;
    RUNTIME_RESTART: string;
    TICK_STARTED: string;
    ROOMS_DONE: string;
  };
  // eslint-disable-next-line @typescript-eslint/ban-types
  publish(channel: string, data: string): Promise<void>;
  // eslint-disable-next-line @typescript-eslint/ban-types
  subscribe(channel: string, callback: Function): Promise<void>;
}
