/**
 * fly-area 纯逻辑：配置归一、飞行赋权判定与 ability 命令构造。
 */

/** 区域特性 id（挂接到 area.registerFeature） */
export const FEATURE_ID = "fly";

/** 权限 / 临时赋权标记名 */
export const PERM_USE = "fly_area.use";

/** 缓降效果标识 */
export const SLOW_FALLING_EFFECT = "minecraft:slow_falling";

/** 模块默认配置 */
export const DEFAULT_CONFIG = {
  slow_falling_duration_ticks: 100,
  slow_falling_amplifier: 0,
  actionbar_notify: true,
} as const;

export type FlyAreaConfig = {
  slow_falling_duration_ticks: number;
  slow_falling_amplifier: number;
  actionbar_notify: boolean;
};

/**
 * 从配置源归一化 fly_area 配置（非法值回退默认）。
 */
export function resolveConfig(raw: {
  slow_falling_duration_ticks?: unknown;
  slow_falling_amplifier?: unknown;
  actionbar_notify?: unknown;
} | null | undefined): FlyAreaConfig {
  const ticks = raw?.slow_falling_duration_ticks;
  const amp = raw?.slow_falling_amplifier;
  const notify = raw?.actionbar_notify;
  return {
    slow_falling_duration_ticks:
      typeof ticks === "number" && Number.isFinite(ticks) && ticks > 0
        ? Math.floor(ticks)
        : DEFAULT_CONFIG.slow_falling_duration_ticks,
    slow_falling_amplifier:
      typeof amp === "number" && Number.isFinite(amp) && amp >= 0
        ? Math.floor(amp)
        : DEFAULT_CONFIG.slow_falling_amplifier,
    actionbar_notify: typeof notify === "boolean" ? notify : DEFAULT_CONFIG.actionbar_notify,
  };
}

/**
 * 仅生存模式玩家接受区域飞行赋权（创造本就可飞，不干预）。
 */
export function shouldGrantFly(gameMode: string): boolean {
  return gameMode === "Survival" || gameMode === "survival";
}

/**
 * 离区时若悬空（未着地或仍在飞）则需要缓降缓冲。
 */
export function shouldApplySlowFalling(isOnGround: boolean, isFlying: boolean): boolean {
  return isFlying || !isOnGround;
}

/**
 * 构造原生 ability mayfly 命令（沙箱 / BDS 主路径）。
 */
export function buildMayFlyCommand(enabled: boolean): string {
  return `ability @s mayfly ${enabled ? "true" : "false"}`;
}

/**
 * 内存态：当前由本模块赋权飞行的在线玩家集合（fly_area.use 临时标记）。
 */
export class FlyGrantState {
  private readonly granted = new Set<string>();

  has(playerId: string): boolean {
    return this.granted.has(playerId);
  }

  mark(playerId: string): void {
    this.granted.add(playerId);
  }

  /** @returns 移除前是否持有标记 */
  clear(playerId: string): boolean {
    return this.granted.delete(playerId);
  }

  clearAll(): void {
    this.granted.clear();
  }

  size(): number {
    return this.granted.size;
  }
}
