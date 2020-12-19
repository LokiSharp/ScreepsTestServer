import * as util from "util";
import * as zlib from "zlib";
import { CommonConstants, CommonStorageDBCollection, CommonStorageEnv, CommonStoragePubsub } from "../types/Common";
import { DBRoom, DBRoomObject } from "../types/DataBase";
import { find, first, get, map, some } from "lodash";
import Server from "./Server";
import TerrainMatrix from "./TerrainMatrix";
import User from "./User";

// Terrain string for room completely filled with walls
const walled = "1".repeat(2500);

export interface UserBadge {
  type: number;
  color1: string;
  color2: string;
  color3: string;
  flip: boolean;
  param: number;
}

export interface AddBotOptions {
  username: string;
  room: string;
  x: number;
  y: number;
  gcl?: number;
  cpu?: number;
  cpuAvailable?: number;
  active?: number;
  spawnName?: string;
  modules?: Record<string, unknown>;
}

export interface SerializedRoomObject {
  serial: string;
  objects: {
    type: string;
    x: number;
    y: number;
    attributes: Record<string, Record<string, string | number | boolean>>;
  }[];
}

export default class World {
  private server: Server;

  public constructor(server: Server) {
    this.server = server;
  }

  public get gameTime(): Promise<number> {
    return this.load().then(({ env }) => env.get(env.keys.GAMETIME)) as Promise<number>;
  }

  /**
   * 连接到服务器并返回 constants, database, env 和 pubsub 对象
   */
  public async load(): Promise<{
    C: CommonConstants;
    db: CommonStorageDBCollection;
    env: CommonStorageEnv;
    pubsub: CommonStoragePubsub;
  }> {
    if (!this.server.connected) await this.server.connect();
    const { db, env, pubsub } = this.server.common.storage;
    const C = this.server.constants;
    return { C, db, env, pubsub };
  }

  /**
   * 设置房间状态，如果没有就创建
   * @param room 房间名
   * @param status 房间状态
   * @param active 是否激活
   */
  public async setRoom(room: string, status = "normal", active = true): Promise<void> {
    const { db } = this.server.common.storage;
    const data = await db.rooms.find({ _id: room });
    if (data.length > 0) {
      await db.rooms.update({ _id: room }, { $set: { status, active } });
    } else {
      await db.rooms.insert({ _id: room, status, active });
    }
    await this.server.driver.updateAccessibleRoomsList();
  }

  /**
   * setRoom() 的别名
   * @param room 房间名
   */
  public async addRoom(room: string): Promise<void> {
    return this.setRoom(room);
  }

  /**
   * 获取房间的地形数据
   * @param room 房间名
   */
  public async getTerrain(room: string): Promise<TerrainMatrix> {
    const { db } = this.server.common.storage;
    const data = await db["rooms.terrain"].find({ room });

    if (data.length === 0) {
      throw new Error(`room ${room} doesn't appear to have any terrain data`);
    }

    const serial = get(first(data), "terrain") as string;
    return TerrainMatrix.unserialize(serial);
  }

  /**
   * 设置房间的地形数据
   * @param room 房间名
   * @param terrain 地形矩阵
   */
  public async setTerrain(room: string, terrain = new TerrainMatrix()): Promise<void> {
    const { db, env } = this.server.common.storage;

    const data = await db["rooms.terrain"].find({ room });
    if (data.length > 0) {
      await db["rooms.terrain"].update({ room }, { $set: { terrain: terrain.serialize() } });
    } else {
      await db["rooms.terrain"].insert({ room, terrain: terrain.serialize() });
    }

    await this.updateEnvTerrain(db, env);
  }

  /**
   * 添加房间对象
   * @param room 房间对象所在房间名
   * @param type 房间对象类型
   * @param x 房间对象 x 座标
   * @param y 房间对象 x 座标
   * @param attributes 房间对象的其他属性
   */
  public async addRoomObject(
    room: string,
    type: string,
    x: number,
    y: number,
    attributes: Record<string, unknown> = {}
  ): Promise<DBRoomObject> {
    const { db } = this.server.common.storage;
    if (x < 0 || y < 0 || x >= 50 || y >= 50) {
      throw new Error("invalid x/y coordinates (they must be between 0 and 49)");
    }
    const object = { ...{ room, x, y, type }, ...attributes };
    return db["rooms.objects"].insert(object);
  }

  /**
   * 重置世界数据
   */
  public async reset(): Promise<void> {
    const { db, env } = await this.load();
    // Clear database
    await Promise.all(map(db, col => col.clear()));
    await env.set(env.keys.GAMETIME, 1);

    // Insert invaders and sourcekeeper users
    await Promise.all([
      db.users.insert({ _id: "2", username: "Invader", cpu: 100, cpuAvailable: 10000, gcl: 13966610.2, active: 0 }),
      db.users.insert({
        _id: "3",
        username: "Source Keeper",
        cpu: 100,
        cpuAvailable: 10000,
        gcl: 13966610.2,
        active: 0
      })
    ]);
  }

  /**
   * 创建一个拥有 sources, minerals 和 controllers 的 9 个房间的基础世界
   */
  public async stubWorld(): Promise<void> {
    await this.reset();
    const addRoomObjects = (roomName: string, objects: DBRoomObject[]) =>
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      Promise.all(objects.map(o => this.addRoomObject(roomName, o.type!, o.x!, o.y!, o.attributes)));
    const addRoom = (roomName: string, terrain: TerrainMatrix, roomObjects: DBRoomObject[]) =>
      Promise.all([this.addRoom(roomName), this.setTerrain(roomName, terrain), addRoomObjects(roomName, roomObjects)]);
    // eslint-disable-next-line global-require, import/no-unresolved, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
    const rooms: Record<string, SerializedRoomObject> = require("../assets/rooms.json");
    await Promise.all(
      map(rooms, (data, roomName) => {
        const terrain = TerrainMatrix.unserialize(data.serial);
        return addRoom(roomName, terrain, data.objects);
      })
    );
  }
  /**
   * 获取房间的所有房间对象
   * @param room 在房间名
   */
  public async roomObjects(room: string): Promise<DBRoomObject[]> {
    const { db } = await this.load();
    return db["rooms.objects"].find({ room });
  }

  /**
   * 为用户生成一个随机头像
   */
  public genRandomBadge(): UserBadge {
    return {
      type: Math.floor(Math.random() * 24) + 1,
      color1: `#${Math.floor(Math.random() * 0xffffff).toString(16)}`,
      color2: `#${Math.floor(Math.random() * 0xffffff).toString(16)}`,
      color3: `#${Math.floor(Math.random() * 0xffffff).toString(16)}`,
      flip: Math.random() > 0.5,
      param: Math.floor(Math.random() * 200) - 100
    };
  }

  /**
   * 添加一个新用户到世界
   * @param username 用户名
   * @param room 房间
   * @param x Spawn x 座标
   * @param y Spawn y 座标
   * @param gcl 初始 GCL
   * @param cpu 初始 CPU
   * @param cpuAvailable 可用 CPU
   * @param active 是否激活
   * @param spawnName Spawn 名
   * @param modules 代码模块
   */
  public async addBot({
    username,
    room,
    x,
    y,
    gcl = 1,
    cpu = 100,
    cpuAvailable = 10000,
    active = 10000,
    spawnName = "Spawn1",
    modules = {}
  }: AddBotOptions): Promise<User> {
    const { C, db, env } = await this.load();
    const data = await db["rooms.objects"].findOne({ $and: [{ room }, { type: "controller" }] });
    if (data == null) {
      throw new Error(`cannot add user in ${room}: room does not have any controller`);
    }
    const user = await db.users.insert({
      username,
      cpu,
      cpuAvailable,
      gcl,
      active,
      badge: this.genRandomBadge()
    });
    await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      env.set(env.keys.MEMORY + user._id!, "{}"),
      env.sadd(env.keys.ACTIVE_ROOMS, room),
      db.rooms.update({ _id: room }, { $set: { active: true } }),
      db["users.code"].insert({ user: user._id, branch: "default", modules, activeWorld: true }),
      db["rooms.objects"].update(
        { room, type: "controller" },
        { $set: { user: user._id, level: 1, progress: 0, downgradeTime: null, safeMode: 20000 } }
      ),
      db["rooms.objects"].insert({
        room,
        type: "spawn",
        x,
        y,
        user: user._id,
        name: spawnName,
        store: { energy: C.SPAWN_ENERGY_START },
        storeCapacityResource: { energy: C.SPAWN_ENERGY_CAPACITY },
        hits: C.SPAWN_HITS as number,
        hitsMax: C.SPAWN_HITS as number,
        spawning: null,
        notifyWhenAttacked: true
      })
    ]);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return new User(this.server, { _id: user._id!, username: user.username! }).init();
  }

  private async updateEnvTerrain(db: CommonStorageDBCollection, env: CommonStorageEnv) {
    const [rooms, terrain] = await Promise.all([db.rooms.find(), db["rooms.terrain"].find()]);
    rooms.forEach((room: DBRoom) => {
      if (room.status === "out of borders") {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-non-null-assertion
        find(terrain, { room: room._id })!.terrain = walled;
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const m = /([WE])(\d+)(NS)(\d+)/.exec(room._id!);
      if (m) {
        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
        const roomH = m[1] + (+m[2] + 1) + m[3] + m[4];
        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
        const roomV = m[1] + m[2] + m[3] + (+m[4] + 1);
        if (!some(terrain, { room: roomH })) {
          terrain.push({ room: roomH, terrain: walled });
        }
        if (!some(terrain, { room: roomV })) {
          terrain.push({ room: roomV, terrain: walled });
        }
      }
    });
    const compressed = await util.promisify(zlib.deflate)(JSON.stringify(terrain));
    await env.set(env.keys.TERRAIN_DATA, compressed.toString("base64"));
  }
}
