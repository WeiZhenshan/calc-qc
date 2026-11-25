# 差价计算器

面向手机的卷烟差价计算工具。支持品牌库、标签、价格粘贴匹配、实时汇总、计算快照、分享、打印和数据备份。三个角色共用品牌库和厂家标签，每个账号独立保存计算快照。

## 账号角色

新注册账号和升级前的旧账号默认为商户。底部用户中心显示当前用户名、密码掩码和角色。

| 功能 | 商户 | 客户经理 | 管理员 |
| --- | --- | --- | --- |
| 使用计算器、保存计算、查看用户中心 | ✓ | ✓ | ✓ |
| 编辑共享品牌库、添加品牌、批量导入价格 |  | ✓ | ✓ |

通过数据库为指定的已有账号分配角色。例如，将客户经理的实际用户名代入以下语句。角色值支持 `MERCHANT`、`ACCOUNT_MANAGER` 和 `ADMIN`。

```sql
UPDATE app_user SET account_role = 'ACCOUNT_MANAGER' WHERE username = 'your_username';
```

## 用 Docker Compose 启动

1. 将 `.env.example` 复制为 `.env`，填写独立的 `DB_PASSWORD` 和 `MYSQL_ROOT_PASSWORD`。
2. 执行 `docker compose up --build -d`。
3. 打开 [本机应用](http://127.0.0.1:8080)，选择「注册账号」。新账号直接读取共享目录。全新安装使用商品信息列表初始化 355 个品规和 30 个厂家标签。

应用默认只映射到本机，MySQL 使用 Compose 内部网络和持久卷。首次启动时由 Flyway 创建业务表。

## 本地开发

需要 JDK 17、Maven 3.6.3+、Node.js 20.19+ 或 22.12+，以及 MySQL 8.0。先为应用创建独立的数据库和账号，给账号授予该库的建表及读写权限。

```bash
# 在第一个终端，从仓库根目录执行
export DB_USER=calc_qc
export DB_PASSWORD='填写该数据库账号的密码'
# MySQL 非本地 3306 时，另外设置 DB_URL
mvn -f backend/pom.xml spring-boot:run

# 在第二个终端执行
npm ci --prefix frontend
npm run dev --prefix frontend
```

开发页面使用 [Vite 本地地址](http://localhost:5173)，`/api` 由 Vite 转发到本地 8080。可用 `CALC_QC_API_TARGET` 修改转发目标。

## 构建和验证

```bash
npm ci --prefix frontend
npm test --prefix frontend
npm run build --prefix frontend
mvn -B -f backend/pom.xml clean package
java -jar backend/target/calc-qc-1.0.0.jar
```

打包后的 Spring Boot JAR 同时提供 Vue 静态资源和 API。启用 HTTPS 后设置 `SESSION_COOKIE_SECURE=true`。应用壳的离线缓存适用于构建版，经 HTTPS 或回环地址访问并至少在线登录一次。

配置独立测试库的 `DB_URL`、`DB_USER`、`DB_PASSWORD`，安装 MySQL 命令行客户端后运行接口验收，在应用启动后执行 `node scripts/smoke-test.mjs`。脚本会创建两个随机测试账号，并为其中一个依次分配三种角色以验证权限，可通过 `TEST_BASE_URL` 指定地址。GitHub Actions 构建并上传 JAR，同时用临时 MySQL 执行该脚本。

## 文档

- [架构与请求链路](docs/architecture/README.md)
- [MySQL 数据字典与表关系](docs/database/README.md)
- [预置品牌、完整别名与旧版样例](docs/data/README.md)
- [接口与会话协议](docs/api/README.md)
- [功能对照及旧版数据迁移](docs/migration/README.md)
