import { each, find, size, sumBy, toArray } from "lodash";
import { SerializedRoomObject } from "../src/World";
import Server from "../src/Server";
import StdHooks from "../utils/StdHooks";
import { expect } from "chai";
import { removeAsync } from "fs-extra-promise";
import { resolve } from "path";

StdHooks.hookWrite();

describe("World", function () {
  this.timeout(30 * 1000);
  this.slow(5 * 1000);

  let server: Server | null = null;

  it("可以获取内部常量和对象", async () => {
    server = new Server();
    const { C } = await server.world.load();
    // 检验是否符合预期
    expect(C.OK).to.equal(0);
  });

  it("可以获取游戏 tick", async () => {
    // 初始化服务器
    server = new Server();
    await server.start();
    const initial = await server.world.gameTime;
    // 检验是否符合预期
    expect(initial).to.be.above(0);
    await server.tick();
    expect(await server.world.gameTime).to.equal(initial + 1);
    server.stop();
  });

  it("可以重置世界", async () => {
    // 初始化服务器
    server = new Server();
    await server.start();
    await server.tick();
    await server.world.reset();
    // 检验是否符合预期
    expect(await server.world.gameTime).to.equal(1);
  });

  it("可以添加用户", async () => {
    // 初始化服务器
    server = new Server();
    const { db } = await server.world.load();
    await server.world.reset();

    const modules = {
      main: "console.log(Game.time)"
    };
    await server.world.addRoomObject("W0N1", "controller", 20, 20);
    await server.world.addBot({ username: "bot1", room: "W0N1", x: 25, y: 25, spawnName: "azerty", modules });
    await server.world.addRoomObject("W0N2", "controller", 25, 25);
    await server.world.addBot({ username: "bot2", room: "W0N2", x: 30, y: 10, gcl: 9, cpu: 110, cpuAvailable: 10000 });
    // 检验用户是否在数据库中
    const bot1 = await db.users.findOne({ username: "bot1" });
    expect(bot1.gcl).to.equal(1);
    const bot2 = await db.users.findOne({ username: "bot2" });
    expect(bot2.gcl).to.equal(9);
    expect(bot2.cpu).to.equal(110);
    // 检验 controller 和 spawn 是否设置
    const controller1 = await db["rooms.objects"].findOne({
      $and: [{ room: "W0N1" }, { type: "controller" }]
    });
    const spawn1 = await db["rooms.objects"].findOne({ $and: [{ room: "W0N1" }, { type: "spawn" }] });
    expect(controller1.user).to.equal(bot1._id);
    expect(spawn1.user).to.equal(bot1._id);
    expect(spawn1.name).to.equal("azerty");

    // 检验代码是否符合预期
    const code = await db["users.code"].findOne({ $and: [{ user: bot1._id }, { branch: "default" }] });
    expect(code.modules).to.deep.equal(modules);
  });

  it("可以添加房间", async () => {
    // 初始化服务器
    server = new Server();
    const { db } = server.common.storage;
    await server.world.reset();
    // 添加房间 W0N1 并检验是否成功
    await server.world.addRoom("W0N1");
    const room = await db.rooms.findOne({ _id: "W0N1" });
    expect(room._id).to.equal("W0N1");
    // 修改房间状态并确定没有创建新房间
    await server.world.setRoom("W0N1", "normal", false);
    const rooms = await db.rooms.find({ _id: "W0N1" });
    // 检验是否符合预期
    expect(rooms.length).to.equal(1);
    expect(rooms[0]?.active).to.false;
  });

  it("可以设置和获取房间对象", async () => {
    // 初始化服务器
    server = new Server();
    await server.world.reset();
    await server.world.addRoom("W0N1");
    // 往房间 W0N1 添加一些房间对象
    await server.world.addRoomObject("W0N1", "source", 10, 40, {
      energy: 1000,
      energyCapacity: 1000,
      ticksToRegeneration: 300
    });
    await server.world.addRoomObject("W0N1", "mineral", 40, 40, { mineralType: "H", density: 3, mineralAmount: 3000 });
    // 获取房间 W0N1里的所有房间对象
    const objects = await server.world.roomObjects("W0N1");
    const source = find(objects, { type: "source" });
    const mineral = find(objects, { type: "mineral" });
    // 检验是否符合预期
    expect(objects.length).to.equal(2);
    expect(source?.x).to.equal(10);
    expect(source?.energy).to.equal(1000);
    expect(mineral?.density).to.equal(3);
  });

  it("可以设置和获取房间地形", async () => {
    // 初始化服务器
    server = new Server();
    await server.world.reset();
    await server.world.addRoom("W0N1");
    // 设置房间地形
    await server.world.setTerrain("W0N1");
    let matrix = await server.world.getTerrain("W0N1");
    expect(matrix.get(0, 0)).to.equal("plain");
    expect(matrix.serialize()).to.equal(
      Array(50 * 50)
        .fill("0")
        .join("")
    );

    // 重置房间地形
    matrix.set(0, 0, "wall");
    matrix.set(25, 25, "swamp");
    await server.world.setTerrain("W0N1", matrix);
    matrix = await server.world.getTerrain("W0N1");
    expect(matrix.get(0, 0)).to.equal("wall");
    expect(matrix.get(25, 25)).to.equal("swamp");
    // 尝试获取一个不存在的房间的地形
    await server.world
      .getTerrain("W1N1")
      .then(() => {
        throw new Error("获取 W1N1 地形没有返回错误");
      })
      .catch(() => "ok");
  });

  it("可以定义一个 World", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const samples = require("../assets/rooms.json") as Record<string, SerializedRoomObject>;
    // 初始化服务器
    server = new Server();
    const { db } = server.common.storage;
    await server.world.stubWorld();
    // 检查房间都被添加
    const rooms = await db.rooms.find();
    expect(rooms.length).to.equal(size(samples));
    // 检查地形都被添加
    const terrain = await db["rooms.terrain"].find();
    expect(terrain.length).to.equal(size(samples));
    each(samples, async (sourceData, roomName) => {
      const roomData = await db["rooms.terrain"].findOne({ room: roomName });
      expect(roomData.terrain).to.equal(sourceData.serial);
    });
    // 检查房间对象都被添加
    const nbObjects = sumBy(toArray(samples), room => size(room.objects));
    const objects = await db["rooms.objects"].find();
    expect(objects.length).to.equal(nbObjects);
  });

  it("可以读取地形", async () => {
    // 初始化服务器
    server = new Server();
    await server.world.stubWorld();
    // 定义代码
    const modules = {
      main: `module.exports.loop = function() {
               console.log('W0N0 terrain: ' + Game.map.getTerrainAt(25, 25, 'W0N0'));
               console.log('W0N1 terrain: ' + Game.map.getTerrainAt(15, 48, 'W0N1'));
               console.log('W1N2 terrain: ' + Game.map.getTerrainAt(37, 0, 'W1N2'));
            }`
    };
    // 初始化用户
    let logs: string[] = [];
    const user = await server.world.addBot({ username: "bot", room: "W0N0", x: 25, y: 25, modules });
    user.on("console", (log: string[]) => {
      logs = log;
    });
    // 运行一个 tick，然后停止服务器
    await server.start();
    await server.tick();
    server.stop();
    // 检查是否正确读取了地形
    expect(logs.filter(line => /terrain/.exec(line)).length).to.equal(3);
    expect(logs.filter(line => /W0N0 terrain: plain/.exec(line))).to.be.not.empty;
    expect(logs.filter(line => /W0N1 terrain: wall/.exec(line))).to.be.not.empty;
    expect(logs.filter(line => /W1N2 terrain: wall/.exec(line))).to.be.not.empty;
  });

  it("可以读取房间出口", async () => {
    // 初始化服务器
    server = new Server();
    await server.world.stubWorld();
    // 定义代码
    const modules = {
      main: `module.exports.loop = function() {
               console.log('W0N0 exits: ' + JSON.stringify(Game.map.describeExits('W0N0')));
               console.log('W0N1 exits: ' + JSON.stringify(Game.map.describeExits('W0N1')));
               console.log('W1N2 exits: ' + JSON.stringify(Game.map.describeExits('W1N2')));
            }`
    };
    // 初始化用户
    let logs: string[] = [];
    const user = await server.world.addBot({ username: "bot", room: "W0N0", x: 25, y: 25, modules });
    user.on("console", (log: string[]) => {
      logs = log;
    });
    // 运行一个 tick，然后停止服务器
    await server.start();
    await server.tick();
    server.stop();
    // 检查是否正确读取了出口
    expect(logs.filter(line => /exits/.exec(line)).length).to.equal(3);
    expect(logs.filter(line => /W0N0 exits: {"7":"W1N0"}/.exec(line))).to.be.not.empty;
    expect(logs.filter(line => /W0N1 exits: {"1":"W0N2","7":"W1N1"}/.exec(line))).to.be.not.empty;
    expect(logs.filter(line => /W1N2 exits: {"5":"W1N1","7":"W2N2"}/.exec(line))).to.be.not.empty;
  });

  afterEach(async () => {
    // 确保服务器停止
    if (server?.stop) {
      server.stop();
      server = null;
    }
    // 清理生成的文件
    await removeAsync(resolve("server")).catch(console.error);
  });
});
