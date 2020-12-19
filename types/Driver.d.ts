import { CommonConfig, CommonConstants, CommonQueue, CommonStorageEnv, CommonStoragePubsub } from "./Common";
import { DBUser } from "./DataBase";

export interface Driver {
  queue: DriverQueue;
  config: DriverEngine;
  constants: CommonConstants;

  notifyTickStarted(): Promise<void>;

  getAllUsers(): Promise<DBUser[]>;

  updateAccessibleRoomsList(): Promise<Record<string, unknown>>;

  connect(processType: string): Promise<void>;

  getAllRoomsNames(): Promise<string[]>;

  commitDbBulk(): Promise<any>;

  incrementGameTime(): Promise<number>;

  updateRoomStatusData(): Promise<CommonStorageEnv>;

  notifyRoomsDone(gameTime: number): Promise<CommonStoragePubsub>;
}

export interface DriverEngine extends CommonConfig {
  driver: Driver;
  mainLoopMinDuration: number;
  mainLoopResetInterval: number;
  cpuMaxPerTick: number;
  cpuBucketSize: number;
  customIntentTypes: Record<string, unknown>;
  historyChunkSize: number;
  useSigintTimeout: boolean;
  reportMemoryUsageInterval: number;
  enableInspector: boolean;

  mainLoopCustomStage(): any;
}

export interface DriverQueue {
  create(name: string): CommonQueue;
  resetAll(): unknown;
  // eslint-disable-next-line @typescript-eslint/ban-types
  createDoneListener(name: string, callback: Function): void;
}
