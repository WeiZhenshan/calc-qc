# HTTP API

所有路径与前端同源。登录会话由 HTTP-only 的 `JSESSIONID` 识别。每次写请求前，可用当前 Cookie 请求 `GET /api/auth/csrf`，将返回的 `token` 放在 `headerName` 指定的请求头。登录会更新会话及 CSRF 状态，之后的写请求重新获取令牌。

| 方法 | 路径 | 请求和响应 |
| --- | --- | --- |
| GET | `/api/auth/csrf` | 返回 `{headerName, token}` |
| POST | `/api/auth/register` | JSON `{username, password}`。成功返回 201 |
| POST | `/api/auth/login` | 表单 `application/x-www-form-urlencoded`，字段为 `username`、`password`。成功返回 204 |
| GET | `/api/auth/me` | 返回已登录账号 `{id, username, role}` |
| POST | `/api/auth/logout` | 结束会话，返回 204 |
| GET | `/api/workspace` | 返回 `{catalog, snapshot}`。无快照时 `snapshot` 为 `null` |
| PUT | `/api/workspace/catalog` | 替换品牌库，返回新版本的 `catalog` |
| PUT | `/api/workspace/snapshot` | 保存 `{items}`，返回含服务端 `savedAt` 的快照 |
| DELETE | `/api/workspace/snapshot` | 删除快照，返回 204 |
| PUT | `/api/workspace/backup` | 原子替换 JSON `{catalog, snapshot}`，返回新工作区 |

新账号默认为商户（`MERCHANT`）。客户经理（`ACCOUNT_MANAGER`）和管理员（`ADMIN`）可以写品牌库、恢复备份和使用计算器的价格批量录入。三种角色读取同一份品牌库和标签，分别保存自己的计算快照。只有管理员可以在快照中新增隐藏行，服务端在事务内对快照保存和备份恢复执行相同校验。价格粘贴识别在浏览器内完成，手工录入与批量录入的最终数值共用快照接口。

工作区请求需携带 `X-Workspace-User`，值为 `/api/auth/me` 返回的 `id`。后端只以会话确认数据归属，请求头用来检测浏览标签页的会话是否已换成其他账号。

## 数据示例

```json
{
  "catalog": {
    "revision": 3,
    "tags": ["常用"],
    "brands": [
      {
        "id": "00000000-0000-4000-8000-000000000001",
        "name": "中华(软)",
        "wholesale": 583.5,
        "market": null,
        "tags": ["常用"]
      }
    ]
  },
  "snapshot": {
    "savedAt": "2026-11-25T11:00:00Z",
    "items": [
      {
        "brandId": "00000000-0000-4000-8000-000000000001",
        "wholesale": null,
        "market": "700.0",
        "quantity": "2",
        "hidden": false
      }
    ]
  }
}
```

品牌和标签数组顺序就是显示顺序。在备份导入时，前端将品牌库版本改为目标账号的当前版本；服务端重新生成快照保存时间。

常见错误包括请求格式不合法的 400、会话缺失或登录凭据错误的 401、CSRF 校验失败或会话账号不匹配的 403、用户名重复或品牌库版本冲突的 409。业务错误响应含 `message`。快照引用已被删除的品牌也会返回 409。
