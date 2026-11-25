# 从静态版迁移

## 功能对照

| 旧功能 | 迁移后 |
| --- | --- |
| 单行改价、数量、实时差价和总计 | 保留。合计覆盖所有有效且未移除的品牌，标签仅筛选明细 |
| 删除和恢复行、首页新增品牌 | 保留。移除行只影响当前计算，新增品牌进入账号品牌库 |
| 品牌库文本编辑、预设批发价/市场价、清空 | 保留，对应 MySQL 品牌表 |
| 标签新建、分配、搜索、删除、筛选 | 保留，对应标签表和关联表 |
| Excel、微信、网页粘贴和品牌模糊匹配 | 保留分隔格式、匹配顺序、别名及导入结果提示 |
| 计算保存、刷新恢复、分享、清空 | 快照由账号持有，可从另一设备登录后恢复。分享仍为摘要和页面地址 |
| 打印 | 保留 A4 打印。筛选后，打印的明细和合计按同一批有效行计算 |
| PWA、离线计算 | 保留安装与断网使用。先在线登录；离线保存产生本机待同步改动 |
| 旧代码中的 CSV 和 JSON 辅助方法 | 计算器可导出 CSV，品牌库可导入和导出 JSON |
| 登录、注册、退出 | 新增。各账号有独立品牌库、标签和快照 |

## 迁移已有的浏览器数据

如果新旧应用使用同一浏览器和站点源，登录新版，在「品牌库」选择「导入旧版本地数据」。导入需确认，会替换该账号的品牌库、标签和计算快照。

如果新旧地址的域名、协议或端口不同，先在旧页面保存当前计算，再在旧页面的浏览器开发者工具运行以下备份代码。然后登录新版，在「品牌库」选择「导入 JSON」。

```js
const data = JSON.parse(localStorage.getItem('cigarette_calc_data_v3'));
const snapshot = JSON.parse(localStorage.getItem('cigarette_calc_snapshot_v1'));
if (!data) throw new Error('此浏览器里没有旧版品牌库');

const url = URL.createObjectURL(new Blob([JSON.stringify({ ...data, snapshot }, null, 2)], {
    type: 'application/json',
}));
const link = document.createElement('a');
link.href = url;
link.download = '差价计算-旧版备份.json';
link.click();
setTimeout(() => URL.revokeObjectURL(url), 1000);
```

旧版快照按品牌名称关联。如果旧品牌库存在重名，导入按旧版行为将快照关联到最后一条同名品牌。旧 `records` 字段没有 UI 读写路径，仍随上述原始 JSON 备份保留。新应用通过品牌库、标签和快照覆盖旧版界面可编辑的数据。

从 GitHub Pages 切换时，应在能运行 Java 进程和 MySQL 的环境部署新版，并通过 HTTPS 访问。原先推送后发布静态目录的 GitHub Actions 已改为只构建和验证 JAR。
