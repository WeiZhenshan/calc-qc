# 预置数据和旧版样例

以下数据完整提取自迁移前的 Git 提交 `fe108f0`。仓库中的预置价格用于计算器初始化，无外部实时价格源。

| 文件 | 来源与用途 |
| --- | --- |
| [default-brands.json](default-brands.json) | 旧 `web/js/storage.js` 的 `DEFAULT_BRANDS`，共 44 条，保留顺序、名称和批发价。44 条均未设置市场价。注册新账号时 Spring Boot 逐条写入该用户的品牌表。 |
| [brand-aliases.json](brand-aliases.json) | 旧 `web/js/brands.js` 的 `BRAND_ALIASES`，共 88 条别名，值指向预置品牌的标准名称。Vue 直接读取该文件。 |
| [legacy-ui-examples.json](legacy-ui-examples.json) | 旧 `web/index.html` 的两个文本框占位示例。品牌库包含一行格式说明和两条录入示例，价格导入有三条示例。 |
| [legacy-ui-parsed.json](legacy-ui-parsed.json) | 上述示例的解析结果。品牌库示例给出两条记录。价格导入示例在默认品牌库上匹配到三个品牌，数量按默认 1 条计算。 |

默认品牌记录含 `name` 和 `wholesale`，可选字段 `market` 只出现在品牌库录入示例或用户维护数据中。别名数据以别名作为键，标准品牌名称作为值。价格导入在只有一列数字时将其解释为市场价，有两列时依次解释为批发价和市场价。

迁移前仓库没有测试账号、数据库备份或用户浏览器存档。用户曾保存的自定义品牌、标签和快照可按[旧版数据迁移](../migration/README.md)导入。接口验收用的临时账号由脚本每次运行时创建。
