# Calc QC 仓库指引

- `frontend/` 是 Vue 3 和 Vite 项目。开发时通过 Vite 代理访问 Spring Boot。
- `backend/` 使用 Java 17、Spring Boot、Spring Security、JdbcTemplate、Flyway 和 MySQL 8.0。
- `docs/data/default-brands.json` 是注册时初始化品牌库的源数据。`docs/data/brand-aliases.json` 是前端匹配器使用的别名字典。
- `docs/` 的总索引在 [docs/README.md](docs/README.md)。启动及运行命令见 [README.md](README.md)。
- 品牌的归属由登录会话决定。品牌库和快照引用稳定的品牌 UUID，表关系使用含用户 ID 的复合外键。
- 本地构建先运行 `npm run build --prefix frontend`，再运行 `mvn -B -f backend/pom.xml clean package`。
- GitHub Actions 产出 JAR 并使用临时 MySQL 验证接口。构建后的应用包含 Vue 静态资源和 Service Worker。
