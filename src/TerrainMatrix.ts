import { each, get, set } from "lodash";

type TerrainType = "plain" | "wall" | "swamp";

const TYPES: TerrainType[] = ["plain", "wall", "swamp"];

export default class TerrainMatrix {
  private data: { [coords: string]: TerrainType };

  public constructor() {
    this.data = {};
  }

  public get(x: number, y: number): TerrainType {
    return get(this.data, `${x}:${y}`, "plain");
  }

  public set(x: number, y: number, value: TerrainType): TerrainMatrix {
    if (TYPES.includes(value)) {
      set(this.data, `${x}:${y}`, value);
    } else {
      throw new Error(`invalid value ${value}`);
    }
    return this;
  }

  /**
   * 序列化地形
   */
  public serialize(): string {
    let str = "";
    for (let y = 0; y < 50; y += 1) {
      for (let x = 0; x < 50; x += 1) {
        const terrain = this.get(x, y);
        const mask = TYPES.indexOf(terrain);
        if (mask !== -1) {
          str += mask;
        } else {
          throw new Error(`invalid terrain type: ${terrain}`);
        }
      }
    }
    return str;
  }

  /**
   * 反序列化地形
   */
  public static unserialize(str: string): TerrainMatrix {
    const matrix = new TerrainMatrix();
    each(str.split(""), (mask, idx) => {
      const x = idx % 50;
      const y = Math.floor(idx / 50);
      const terrain = get(TYPES, mask) as TerrainType;
      if (terrain == null) {
        throw new Error(`invalid terrain mask: ${mask}`);
      } else if (terrain !== "plain") {
        matrix.set(x, y, terrain);
      }
    });
    return matrix;
  }
}
