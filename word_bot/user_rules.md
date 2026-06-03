# 用户规则

## 基础交互
1. 请用中文回答
2. 如果回答的是代码，请给每个关键节点增加中文注释
3. 代码超过20行时考虑聚合和颗粒度

## 代码质量规范

### 通用编码规范
1. 避免不必要的对象复制或克隆
2. 避免多层嵌套，提前返回
3. 使用适当的并发控制机制
4. 函数职责单一

### 敏感信息处理
1. 禁止在代码中硬编码敏感信息（API密钥、密码等）
2. 使用环境变量管理配置
3. 本地开发用 `.env` 文件，服务器用环境变量

## 项目开发规范

### 文档与代码同步
1. **更新 PRD 时必须同步更新相关代码**
2. 代码实现与文档描述保持一致
3. 重大变更先更新 PRD 再改代码

### 提交前检查
1. 代码是否可读、有注释
2. 是否遵循现有代码风格
3. 是否引入不必要的依赖
4. **代码必须本地测试通过后才能准备git推送**

### 部署规范
1. 后端先本地测试
2. Git 推送后 Render 自动部署
3. 环境变量在 Render Dashboard 配置

### 数据库操作
1. 批量操作添加延迟避免频率限制
2. 操作前确认字段存在
3. 记录操作日志便于排查

## 飞书多维表格操作规范

### API调用要点
1. **GET接口** vs **Search接口**：
   - GET `/records`：返回 `fields: {}`（权限不足时）
   - Search `/records/search`：返回完整字段数据，**优先使用此接口**
   
2. **filter字段过滤问题**：
   - 多条件filter可能返回 `99992402 field validation failed`
   - 改用前端过滤：用 `sort` 获取全部数据，JavaScript过滤条件
   
3. **分页策略**：
   - page_size 最大500
   - 依赖 `has_more` 和 `page_token` 循环获取
   - 总数用 `GET /records?page_size=1` 的 `total` 字段

### 记录归档/删除流程
1. 用 `GET /records` 获取 record_id 列表
2. 前端过滤需要归档的记录
3. 备份表需先创建匹配字段结构，否则报 `FieldNameNotFound` 或 `NumberFieldConvFail`
4. 删除前获取完整数据，确认 fields 不为空

### 常见错误码
- `99992402 field validation failed`：filter格式错误或字段不存在
- `FieldNameNotFound`：目标表缺少源表字段
- `NumberFieldConvFail`：字段类型不匹配（如文本写入数字字段）
- `fields: {}`：应用无权限读取该表格，需在飞书设置权限

## 终端命令规范

### PowerShell 限制
- **禁止使用 `&&` 连接多条命令**（PowerShell 不支持）
- 使用单条命令或 PowerShell 分隔符 `;`
- 失败后必须分开执行 git add / commit / push