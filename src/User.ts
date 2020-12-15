import { DBUser, DBUserConsole } from "../types/DataBase";
import { clone, first, get } from "lodash";
import { EventEmitter } from "events";
import ScreepsServer from "./ScreepsServer";

export interface UserNotification {
  message: string;
  type: string;
  date: number;
  count: number;
  _id: string;
}

export default class User extends EventEmitter {
  private knownNotifications: string[];
  private _id: string;
  private _username: string;
  private _server: ScreepsServer;

  public constructor(server: ScreepsServer, data: { _id: string; username: string }) {
    super();
    this._id = data._id;
    this._username = data.username;
    this._server = server;
    this.knownNotifications = [];
  }

  public get id(): string {
    return this._id;
  }
  public get username(): string {
    return this._username;
  }
  public get cpu(): Promise<number> {
    return this.getData("cpu") as Promise<number>;
  }
  public get cpuAvailable(): Promise<number> {
    return this.getData("cpuAvailable") as Promise<number>;
  }
  public get gcl(): Promise<number> {
    return this.getData("gcl") as Promise<number>;
  }
  public get rooms(): Promise<string> {
    return this.getData("rooms") as Promise<string>;
  }
  public get lastUsedCpu(): Promise<number> {
    return this.getData("lastUsedCpu") as Promise<number>;
  }
  public get memory(): Promise<string> {
    const { env } = this._server.common.storage;
    return env.get(env.keys.MEMORY + this.id);
  }
  public get notifications(): Promise<UserNotification[]> {
    const { db } = this._server.common.storage;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return db["users.notifications"].find({ user: this.id }).then((list: any[]) =>
      list.map(({ message, type, date, count, _id }) => {
        this.knownNotifications.push(_id);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        return { message, type, date, count, _id };
      })
    );
  }
  public get newNotifications(): Promise<UserNotification[]> {
    const known = clone(this.knownNotifications);
    return this.notifications.then(list => list.filter(notif => !known.includes(notif._id)));
  }

  public get activeSegments(): Promise<number[]> {
    return this.getData("activeSegments") as Promise<number[]>;
  }

  /**
   * 获取用户内存分段
   * @param list 需要的内存分段索引
   */
  public async getSegments(list: number[]): Promise<string[]> {
    const { env } = this._server.common.storage;
    return env.hmget(env.keys.MEMORY_SEGMENTS + this._id, list);
  }

  /**
   * 发送一条在下一个 tick 运行的命令
   * @param expression 所要运行的命令
   */
  public async console(expression: string): Promise<DBUserConsole> {
    const { db } = this._server.common.storage;
    return db["users.console"].insert({ user: this._id, expression, hidden: false });
  }

  /**
   * 从用户数据中检索需要的字段
   * @param name 字段名
   */
  public async getData(name: keyof DBUser): Promise<unknown> {
    const { db } = this._server.common.storage;
    const data = await db.users.find({ _id: this._id });
    return get(first(data), name);
  }

  /**
   * 初始化控制台
   */
  public async init(): Promise<User> {
    const { pubsub } = this._server.common.storage;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await pubsub.subscribe(`user:${this._id}/console`, (event: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { messages } = JSON.parse(event);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { log = [], results = [] } = messages || {};
      this.emit("console", log, results, this._id, this.username);
    });
    return this;
  }
}
