import { accessSync, removeAsync } from "fs-extra-promise";
import Server from "../src/Server";
import StdHooks from "../utils/StdHooks";
import { expect } from "chai";
import { resolve } from "path";
import { setConstants } from "../utils/setConstants";

StdHooks.hookWrite();

describe("ScreepsServer", function () {
  this.timeout(30 * 1000);
  this.slow(5 * 1000);

  let server: Server | null = null;

  it("可以启动服务器并正常运行几个 tick", async () => {
    // 初始化服务器
    server = new Server();
    await server.start();
    expect(await server.world.gameTime).to.deep.equal(1);
    for (let i = 1; i < 10; i += 1) {
      await server.tick();
      expect(await server.world.gameTime).to.deep.equal(1 + i);
    }
    server.stop();
  });

  it("可以在服务器构造函数设置选项", async () => {
    // 设置并初始化服务器
    const opts = {
      path: "another_dir",
      logdir: "another_logdir",
      port: 9999
    };
    server = new Server(opts);
    // 检验选项是否注册
    const serverOpts = server.getOpts();
    expect(serverOpts.path).to.deep.equal(opts.path);
    expect(serverOpts.logdir).to.deep.equal(opts.logdir);
    expect(serverOpts.port).to.deep.equal(opts.port);
    // 启动服务器运行 1 tick，然后停止
    await server.start();
    await server.tick();
    server.stop();
    // 检验文件是否在正确的位置
    expect(() => accessSync(resolve(opts.path))).to.not.throw();
    expect(() => accessSync(resolve(opts.logdir))).to.not.throw();
  });

  it("可以运行用户代码", async () => {
    // 初始化服务器
    server = new Server();
    await server.world.stubWorld();
    // 定义代码
    const modules = {
      main: `module.exports.loop = function() {
               console.log('tick', Game.time);
            }`
    };

    let logs: string[] = [];
    // 初始化用户
    const user = await server.world.addBot({ username: "bot", room: "W0N0", x: 25, y: 25, modules });
    user.on("console", log => {
      logs = logs.concat(log);
    });
    // 运行几个 tick
    await server.start();
    for (let i = 0; i < 5; i += 1) {
      await server.tick();
    }
    server.stop();
    // 检验输出是否符合
    expect(logs).to.deep.equal(["tick 1", "tick 2", "tick 3", "tick 4", "tick 5"]);
  });

  it("可以修改常量", async () => {
    // 初始化服务器
    setConstants({ FOO: 2 });
    server = new Server();
    await server.world.stubWorld();
    // 检验是否符合预期
    expect((await server.world.load()).C.FOO).to.equal(2);
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
    await removeAsync(resolve("another_dir")).catch(console.error);
    await removeAsync(resolve("another_logdir")).catch(console.error);
  });
});
