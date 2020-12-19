import * as cp from "child_process";
import * as fs from "fs-extra-promise";
import * as path from "path";
import { Common, CommonConfig, CommonConstants, CommonQueue } from "../types/Common";
import { defaults, each, map, noop } from "lodash";
import { Driver } from "../types/Driver";
import { EventEmitter } from "events";
import World from "./World";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const common = require("@screeps/common") as Common;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const driver = require("@screeps/driver") as Driver;

const ASSETS_PATH = path.join(__dirname, "..", "assets");
const MOD_FILE = "mods.json";
const DB_FILE = "db.json";
const MOD_DIR = "mods";

export interface ScreepServerOptions {
  path: string;
  logdir: string;
  port: number;
  modfile?: string;
}

export default class Server extends EventEmitter {
  public driver: Driver;
  public config: CommonConfig;
  public common: Common;
  public constants: CommonConstants;
  public connected: boolean;
  public processes: { [name: string]: cp.ChildProcess };
  public world: World;

  private usersQueue?: CommonQueue;
  private roomsQueue?: CommonQueue;

  private opts: ScreepServerOptions;

  public constructor(opts: Partial<ScreepServerOptions> = {}) {
    super();
    this.common = common;
    this.driver = driver;
    this.config = this.common.configManager.config;
    this.constants = this.config.common.constants;
    this.connected = false;
    this.processes = {};
    this.world = new World(this);
    this.opts = Server.computeDefaultOpts(opts);
  }

  /**
   * 生成服务器选项，用自定义服务器选项覆盖默认值
   * @param opts 自定义选项
   */
  private static computeDefaultOpts(opts: Partial<ScreepServerOptions>): ScreepServerOptions {
    const defaultOptions: ScreepServerOptions = {
      path: path.resolve("server"),
      logdir: path.resolve("server", "logs"),
      modfile: path.resolve("server", MOD_FILE),
      port: 21025
    };

    const options = defaults(opts, defaultOptions) as ScreepServerOptions;
    process.env.MODFILE = options.modfile;
    process.env.DRIVER_MODULE = "@screeps/driver";
    process.env.STORAGE_PORT = `${options.port}`;
    return options;
  }

  /**
   * 设置服务器选项，用自定义服务器选项覆盖默认值
   * @param opts 自定义选项
   */
  public setOpts(opts: ScreepServerOptions): Server {
    this.opts = Server.computeDefaultOpts(opts);
    return this;
  }

  /**
   * 获取服务器选项
   */
  public getOpts(): ScreepServerOptions {
    return this.opts;
  }

  /**
   * 启动 storage 进程并连接到 driver
   */
  public async connect(): Promise<Server> {
    // 删除已存在的目录
    await fs.mkdirAsync(this.opts.path).catch(() => {
      // PASS
    });
    await fs.mkdirAsync(this.opts.logdir).catch(() => {
      // PASS
    });
    // 复制 asset 到 server 目录
    await Promise.all([
      fs.copyAsync(path.join(ASSETS_PATH, DB_FILE), path.join(this.opts.path, DB_FILE)),
      fs.copyAsync(path.join(ASSETS_PATH, MOD_FILE), path.join(this.opts.path, MOD_FILE)),
      fs.copyAsync(path.join(ASSETS_PATH, MOD_DIR), path.join(this.opts.path, MOD_DIR))
    ]);
    // 启动 storage 进程
    this.emit("info", "Starting storage process.");
    const library = path.resolve(path.dirname(require.resolve("@screeps/storage")), "../bin/start.js");
    const process = await this.startProcess("storage", library, {
      DB_PATH: path.resolve(this.opts.path, DB_FILE),
      MODFILE: path.resolve(this.opts.path, MOD_FILE),
      STORAGE_PORT: `${this.opts.port}`
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Could not launch the storage process (timeout).")), 5000);
      process.on("message", message => {
        if (message === "storageLaunched") {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    // 连接 storage 进程
    try {
      const oldLog = console.log;
      console.log = noop; // 禁用控制台
      await this.driver.connect("main");
      console.log = oldLog; // 重启控制台
      this.usersQueue = this.driver.queue.create("users");
      this.roomsQueue = this.driver.queue.create("rooms");
      this.connected = true;
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-unsafe-member-access
      throw new Error(`Error connecting to driver: ${err.stack}`);
    }
    return this;
  }

  /**
   * 运行一个 tick
   */
  public async tick(): Promise<Server> {
    await this.driver.notifyTickStarted();
    const users = await this.driver.getAllUsers();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await this.usersQueue?.addMulti(map(users, user => user._id!.toString()));
    await this.usersQueue?.whenAllDone();
    const rooms = (await this.driver.getAllRoomsNames()) || [];
    await this.roomsQueue?.addMulti(rooms);
    await this.roomsQueue?.whenAllDone();
    await this.driver.commitDbBulk();
    // eslint-disable-next-line global-require,@typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-call
    await require("@screeps/engine/src/processor/global")();
    await this.driver.commitDbBulk();
    const gameTime = await this.driver.incrementGameTime();
    await this.driver.updateAccessibleRoomsList();
    await this.driver.updateRoomStatusData();
    await this.driver.notifyRoomsDone(gameTime);
    await this.driver.config.mainLoopCustomStage();
    return this;
  }

  /**
   * 启动一个带环境变量的子进程
   * @param name 进程名
   * @param execPath 脚本路径
   * @param env 环境变量
   */
  public async startProcess(name: string, execPath: string, env: Record<string, string>): Promise<cp.ChildProcess> {
    const fd = await fs.openAsync(path.resolve(this.opts.logdir, `${name}.log`), "a");
    this.processes[name] = cp.fork(path.resolve(execPath), [], { stdio: [0, fd, fd, "ipc"], env });
    this.emit("info", `[${name}] process ${this.processes[name].pid} started`);
    this.processes[name].on(
      "exit",
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async (code, signal): Promise<void> => {
        await fs.closeAsync(fd);
        if (code && code !== 0) {
          this.emit("error", `[${name}] process ${this.processes[name].pid} exited with code ${code}, restarting...`);
          void this.startProcess(name, execPath, env);
        } else if (code === 0) {
          this.emit("info", `[${name}] process ${this.processes[name].pid} stopped`);
        } else {
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          this.emit("info", `[${name}] process ${this.processes[name].pid} exited by signal ${signal}`);
        }
      }
    );
    return this.processes[name];
  }

  /**
   * 启动进程并连接到 driver.
   */
  public async start(): Promise<Server> {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-var-requires
    this.emit("info", `Server version ${require("screeps").version}`);
    if (!this.connected) {
      await this.connect();
    }
    this.emit("info", "Starting engine processes.");

    await this.startProcess(
      "engine_runner",
      path.resolve(path.dirname(require.resolve("@screeps/engine")), "runner.js"),
      {
        DRIVER_MODULE: "@screeps/driver",
        MODFILE: path.resolve(this.opts.path, DB_FILE),
        STORAGE_PORT: `${this.opts.port}`
      }
    );
    await this.startProcess(
      "engine_processor",
      path.resolve(path.dirname(require.resolve("@screeps/engine")), "processor.js"),
      {
        DRIVER_MODULE: "@screeps/driver",
        MODFILE: path.resolve(this.opts.path, DB_FILE),
        STORAGE_PORT: `${this.opts.port}`
      }
    );

    await this.driver.updateAccessibleRoomsList();
    await this.driver.updateRoomStatusData();

    return this;
  }

  /*
   * 停止进程
   */
  public stop(): Server {
    each(this.processes, process => process.kill());
    return this;
  }
}
