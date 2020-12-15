import Server from "../src/ScreepsServer";
import StdHooks from "../utils/StdHooks";
import { expect } from "chai";
import { removeAsync } from "fs-extra-promise";
import { resolve } from "path";

StdHooks.hookWrite();

describe("User", function () {
  this.timeout(30 * 1000);
  this.slow(5 * 1000);

  let server: Server | null = null;

  it("可以获取用户属性和状态", async () => {
    // 初始化服务器
    server = new Server();
    await server.start();
    // 定义代码
    const modules = {
      main: `module.exports.loop = function() {
                Memory.foo = { bar: 'baz' }
            }`
    };
    // 初始化用户
    const user = await server.world.addBot({ username: "bot", room: "W0N0", x: 25, y: 25, modules });
    // 运行一个 tick
    await server.tick();
    (await user.newNotifications).forEach(({ message }) => console.log("[notification]", message));
    // 检验属性是否符合预期
    expect(user.id).not.be.undefined;
    expect(user.username).to.equal("bot");
    expect(await user.cpu).to.equal(100);
    expect(await user.cpuAvailable).to.equal(10000);
    expect(await user.gcl).to.equal(1);
    expect(await user.rooms).to.deep.equal(["W0N0"]);
    // 检验 Memory 是否符合预期
    expect(JSON.parse(await user.memory)).to.deep.equal({ foo: { bar: "baz" } });
    server.stop();
  });

  it("可以获取 segment 内容", async () => {
    // 初始化服务器
    server = new Server();
    await server.world.stubWorld();
    // 定义代码
    const modules = {
      main: `module.exports.loop = function() {
                RawMemory.setActiveSegments([0, 1]);
                if (_.size(RawMemory.segments) > 0) {
                    RawMemory.segments[0] = '{"foo":"bar"}';
                    RawMemory.segments[1] = 'azerty';
                }
            }`
    };
    // 初始化用户
    const user = await server.world.addBot({ username: "bot", room: "W0N0", x: 25, y: 25, modules });
    // 运行几个 tick
    await server.start();
    for (let i = 0; i < 3; i += 1) {
      await server.tick();
    }
    // 检验 segment 是否符合预期
    expect(await user.activeSegments).to.deep.equal([0, 1]);
    const segments = await user.getSegments([0, 1]);
    expect(segments[0]).to.equal('{"foo":"bar"}');
    expect(segments[1]).to.equal("azerty");
    server.stop();
  });

  it("可以发生控制台命令，以及接收日志", async () => {
    // 初始化服务器
    server = new Server();
    await server.world.stubWorld();
    // 定义代码
    const modules = {
      main: `module.exports.loop = function() {
               console.log('tick')
            }`
    };
    // 初始化用户
    interface Log {
      log: string[];
      results: string[];
      userid: string;
      username: string;
    }
    const logs: Log[] = [];
    const user = await server.world.addBot({ username: "bot", room: "W0N0", x: 25, y: 25, modules });
    user.on("console", (log, results, userid, username) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      logs.push({ log, results, userid, username });
    });
    // 运行几个 tick
    await server.start();
    for (let i = 0; i < 5; i += 1) {
      await user.console("_.sample(Game.spawns).owner.username");
      await server.tick();
    }
    server.stop();
    // 检验是否符合预期
    logs.forEach(({ log, results, userid, username }) => {
      expect(userid).to.equal(user.id);
      expect(username).to.equal("bot");
      expect(log).to.deep.equal(["tick"]);
      expect(results).to.deep.equal(["bot"]);
    });
  });

  it("可以获取通知和报错", async () => {
    // 初始化服务器
    server = new Server();
    await server.world.stubWorld();
    // 定义代码
    const modules = {
      main: `module.exports.loop = function() {
                throw new Error('something broke!')
            }`
    };
    // 初始化用户
    const user = await server.world.addBot({ username: "bot", room: "W0N0", x: 25, y: 25, modules });
    // 运行几个 tick
    await server.start();
    for (let i = 0; i < 3; i += 1) {
      await server.tick();
    }
    // 检验是否符合预期
    (await user.notifications).forEach(({ message, type }) => {
      expect(type).to.equal("error");
      expect(message).to.includes("something broke!");
      expect(message).to.includes("main:2");
    });
    server.stop();
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
