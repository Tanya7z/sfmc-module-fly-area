# @sfmc-bds/module-fly-area

Wave C official SFMC module: **fly-area**（区域飞行赋权）.

挂接 `area.registerFeature('fly')`：生存模式进区 `mayfly`，离区剥离并缓降；离线清理防带飞。

## Develop

```bash
npm install
npm run typecheck
npm test
```

Install into platform:

```bash
sfmc mod install fly-area --from dir:. --link
```
