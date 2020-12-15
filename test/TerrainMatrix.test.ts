import TerrainMatrix from "../src/TerrainMatrix";
import { expect } from "chai";

describe("TerrainMatrix", () => {
  it("可以设置和获取值", () => {
    const matrix = new TerrainMatrix();
    matrix.set(0, 1, "wall");
    matrix.set(0, 1, "swamp");
    matrix.set(0, 2, "wall");
    // 检验设置是否符合预期
    expect(matrix.get(0, 0)).to.equal("plain");
    expect(matrix.get(0, 1)).to.equal("swamp");
    expect(matrix.get(0, 2)).to.equal("wall");
    expect(matrix.get(0, 3)).to.equal("plain");
  });

  it("可以序列化反序列化", () => {
    let matrix = new TerrainMatrix();
    matrix.set(1, 0, "swamp");
    matrix.set(2, 0, "wall");
    const terrain: number[] = Array<number>(50 * 50).fill(0);
    terrain[1] = 2;
    terrain[2] = 1;
    const serial = terrain.join("");
    // 检验序列化
    expect(matrix.serialize()).to.equal(serial);
    // 检验反序列化
    matrix = TerrainMatrix.unserialize(serial);
    expect(matrix.get(0, 0)).to.equal("plain");
    expect(matrix.get(1, 0)).to.equal("swamp");
    expect(matrix.get(2, 0)).to.equal("wall");
    expect(matrix.get(3, 0)).to.equal("plain");
  });
});
