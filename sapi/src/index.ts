/**
 * @sfmc-bds/module-fly-area — 区域飞行赋权（area 特性插槽 fly）
 */

import { Player, world } from "@minecraft/server";
import { config } from "@sfmc-bds/sdk/sapi/config";
import { ModuleRegistry } from "@sfmc-bds/sdk/module-loader";
import { debug, Permission } from "@sfmc-bds/sdk/sapi/runtime";
import { service } from "@sfmc-bds/sdk/sapi/service";
import {
  buildMayFlyCommand,
  FEATURE_ID,
  FlyGrantState,
  PERM_USE,
  resolveConfig,
  shouldApplySlowFalling,
  shouldGrantFly,
  SLOW_FALLING_EFFECT,
  type FlyAreaConfig,
} from "./fly.js";

export const MODULE_ID = "fly-area";
/** 权限节点名（与 PERM_USE 同义，便于测试引用） */
export const PERM = PERM_USE;

const grantState = new FlyGrantState();
let cfg: FlyAreaConfig = resolveConfig(undefined);
let featureRegistered = false;

function notifyActionBar(player: Player, text: string): void {
  if (!cfg.actionbar_notify) return;
  try {
    player.onScreenDisplay.setActionBar(text);
  } catch (err) {
    debug.w(
      "FlyArea",
      `actionbar 失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function setMayFly(player: Player, enabled: boolean): void {
  try {
    player.runCommand(buildMayFlyCommand(enabled));
  } catch (err) {
    debug.w(
      "FlyArea",
      `mayfly=${enabled} 失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function applySlowFalling(player: Player): void {
  try {
    player.addEffect(SLOW_FALLING_EFFECT, cfg.slow_falling_duration_ticks, {
      amplifier: cfg.slow_falling_amplifier,
      showParticles: false,
    });
  } catch (err) {
    debug.w(
      "FlyArea",
      `缓降失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * 剥离本模块赋予的飞行能力；可选缓降。
 * @returns 是否实际执行了剥离
 */
function revokeFly(player: Player, withSlowFall: boolean): boolean {
  if (!grantState.clear(player.id)) return false;
  setMayFly(player, false);
  if (withSlowFall) {
    let onGround = true;
    let flying = false;
    try {
      onGround = player.isOnGround;
      flying = player.isFlying;
    } catch {
      /* 离线瞬时可能抛错，保守施加缓降 */
      onGround = false;
      flying = true;
    }
    if (shouldApplySlowFalling(onGround, flying)) {
      applySlowFalling(player);
      notifyActionBar(player, "§e已离开飞行区，缓降保护生效");
    } else {
      notifyActionBar(player, "§7已离开飞行区");
    }
  }
  return true;
}

function onEnter(player: Player): void {
  let mode: string;
  try {
    mode = String(player.getGameMode());
  } catch {
    return;
  }
  // 仅生存模式赋权；创造本就可飞，不干预
  if (!shouldGrantFly(mode)) return;

  setMayFly(player, true);
  grantState.mark(player.id);
  notifyActionBar(player, "§a已进入飞行区，可双击跳跃飞行");
}

function onLeave(player: Player): void {
  revokeFly(player, true);
}

/**
 * 向 area 挂接 fly 特性。area 在 init 中 provide，故本模块亦在 init 调用。
 */
async function registerFlyFeature(): Promise<void> {
  const result = await service.call<{ ok?: boolean }>("area.registerFeature", {
    id: FEATURE_ID,
    handler: {
      id: FEATURE_ID,
      onEnter(player: Player) {
        onEnter(player);
      },
      onLeave(player: Player) {
        onLeave(player);
      },
    },
  });
  featureRegistered = result?.ok === true;
  if (!featureRegistered) {
    debug.w("FlyArea", `area.registerFeature(fly) 返回 ok=${String(result?.ok)}`);
  } else {
    debug.i("FlyArea", "已挂接 area 特性 fly");
  }
}

async function loadConfig(): Promise<void> {
  const ticks = await config.get<number>("slow_falling_duration_ticks");
  const amp = await config.get<number>("slow_falling_amplifier");
  const notify = await config.get<boolean>("actionbar_notify");
  cfg = resolveConfig({
    slow_falling_duration_ticks: ticks,
    slow_falling_amplifier: amp,
    actionbar_notify: notify,
  });
}

ModuleRegistry.register({
  id: MODULE_ID,
  afterWorldLoad: true,
  lifecycle: {
    registerPermissions() {
      // 飞行能力标记节点（进区动态赋予语义；等级 Any）
      Permission.register(PERM_USE, Permission.Any);
    },
    registerCommands() {
      // 纯空间插槽驱动，无玩家命令面
    },
    registerEvents() {
      // 规格将 fly 挂接写在本阶段；area 于 init 才 provide，故 service.call 放 init。
      // 离线清理：area.handlePlayerLeave 会派发 onLeave → 剥离 mayfly 并清标记。
    },
    async init() {
      await loadConfig();
      config.onChange((key) => {
        if (
          key === "slow_falling_duration_ticks" ||
          key === "slow_falling_amplifier" ||
          key === "actionbar_notify"
        ) {
          void loadConfig();
        }
      });

      try {
        await registerFlyFeature();
      } catch (err) {
        debug.e(
          "FlyArea",
          "area.registerFeature 失败",
          err instanceof Error ? err : new Error(String(err)),
        );
      }

      debug.i(
        "FlyArea",
        `init slow_falling=${cfg.slow_falling_duration_ticks}t amp=${cfg.slow_falling_amplifier} notify=${cfg.actionbar_notify} hooked=${featureRegistered}`,
      );
    },
    cleanup() {
      for (const p of world.getAllPlayers()) {
        if (grantState.has(p.id)) revokeFly(p, false);
      }
      grantState.clearAll();
      featureRegistered = false;
      debug.i("FlyArea", "cleanup");
    },
  },
});
