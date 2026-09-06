/**
 * fly-area 单测：配置归一、赋权判定、ability 命令与内存标记。
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildMayFlyCommand,
  DEFAULT_CONFIG,
  FEATURE_ID,
  FlyGrantState,
  PERM_USE,
  resolveConfig,
  shouldApplySlowFalling,
  shouldGrantFly,
} from "../sapi/src/fly.ts";

const MANIFEST_PATH = fileURLToPath(new URL("../sapi/manifest.json", import.meta.url));

describe("fly-area identity", () => {
  it("manifest 与短名/依赖对齐", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
      id: string;
      configKey: string;
      requires: string[];
      permissions: string[];
      services: { requires: { name: string }[] };
    };
    assert.equal(manifest.id, "fly-area");
    assert.equal(manifest.configKey, "fly_area");
    assert.deepEqual(manifest.requires, ["area"]);
    assert.ok(
      manifest.services.requires.some((s) => s.name === "area.registerFeature"),
    );
    assert.equal(FEATURE_ID, "fly");
    assert.equal(PERM_USE, "fly_area.use");
  });
});

describe("resolveConfig", () => {
  it("缺省回退默认值", () => {
    assert.deepEqual(resolveConfig(undefined), { ...DEFAULT_CONFIG });
  });

  it("接受合法覆盖", () => {
    const cfg = resolveConfig({
      slow_falling_duration_ticks: 40,
      slow_falling_amplifier: 1,
      actionbar_notify: false,
    });
    assert.equal(cfg.slow_falling_duration_ticks, 40);
    assert.equal(cfg.slow_falling_amplifier, 1);
    assert.equal(cfg.actionbar_notify, false);
  });

  it("非法数值回退", () => {
    const cfg = resolveConfig({
      slow_falling_duration_ticks: -1,
      slow_falling_amplifier: -2,
      actionbar_notify: "yes",
    });
    assert.equal(cfg.slow_falling_duration_ticks, DEFAULT_CONFIG.slow_falling_duration_ticks);
    assert.equal(cfg.slow_falling_amplifier, DEFAULT_CONFIG.slow_falling_amplifier);
    assert.equal(cfg.actionbar_notify, DEFAULT_CONFIG.actionbar_notify);
  });
});

describe("grant / slow-fall 判定", () => {
  it("仅生存模式赋权", () => {
    assert.equal(shouldGrantFly("Survival"), true);
    assert.equal(shouldGrantFly("survival"), true);
    assert.equal(shouldGrantFly("Creative"), false);
    assert.equal(shouldGrantFly("Adventure"), false);
  });

  it("悬空或飞行时需要缓降", () => {
    assert.equal(shouldApplySlowFalling(true, false), false);
    assert.equal(shouldApplySlowFalling(false, false), true);
    assert.equal(shouldApplySlowFalling(true, true), true);
  });
});

describe("buildMayFlyCommand", () => {
  it("构造 ability mayfly", () => {
    assert.equal(buildMayFlyCommand(true), "ability @s mayfly true");
    assert.equal(buildMayFlyCommand(false), "ability @s mayfly false");
  });
});

describe("FlyGrantState", () => {
  it("标记进出与离线清理", () => {
    const state = new FlyGrantState();
    state.mark("p1");
    assert.equal(state.has("p1"), true);
    assert.equal(state.clear("p1"), true);
    assert.equal(state.has("p1"), false);
    assert.equal(state.clear("p1"), false);
    state.mark("p2");
    state.clearAll();
    assert.equal(state.size(), 0);
  });
});
