# 贡献指南

感谢你考虑为八爪鱼项目做出贡献！🎉

## 如何贡献

### 报告 Bug

如果你发现了 bug，请通过 [GitHub Issues](https://github.com/your-username/octopus/issues) 提交，包含：

1. **问题描述** - 清晰描述发生了什么
2. **复现步骤** - 如何重现这个问题
3. **预期行为** - 你期望发生什么
4. **实际行为** - 实际发生了什么
5. **环境信息** - 操作系统、浏览器、Node.js 版本等
6. **截图** - 如果适用，添加截图帮助解释

### 提出新功能

我们欢迎新功能建议！请：

1. 先在 Issues 中讨论你的想法
2. 描述功能的使用场景
3. 说明为什么这个功能对项目有价值

### 提交代码

1. **Fork 项目**
   ```bash
   git clone https://github.com/your-username/octopus.git
   ```

2. **创建分支**
   ```bash
   git checkout -b feature/amazing-feature
   # 或
   git checkout -b fix/bug-description
   ```

3. **编写代码**
   - 遵循现有的代码风格
   - 添加必要的测试
   - 更新相关文档

4. **提交更改**
   ```bash
   git add .
   git commit -m "feat: 添加某某功能"
   ```
   
   提交信息格式：
   - `feat:` 新功能
   - `fix:` 修复 bug
   - `docs:` 文档更新
   - `style:` 代码格式调整
   - `refactor:` 代码重构
   - `test:` 测试相关
   - `chore:` 构建/工具链相关

5. **推送分支**
   ```bash
   git push origin feature/amazing-feature
   ```

6. **创建 Pull Request**
   - 在 GitHub 上创建 PR
   - 描述你的更改
   - 关联相关的 Issue

## 开发规范

### 代码风格

- **TypeScript**: 使用严格模式
- **ESLint**: 遵循项目配置
- **Prettier**: 统一格式化

```bash
# 运行 linter
npm run lint

# 自动修复
npm run lint:fix
```

### 分支命名

- `feature/` - 新功能
- `fix/` - Bug 修复
- `docs/` - 文档更新
- `refactor/` - 代码重构
- `test/` - 测试相关

### 测试

请确保所有测试通过：

```bash
# 后端测试
cd src/backend && npm test

# 前端测试
cd src/frontend && npm test
```

## 行为准则

- 尊重所有贡献者
- 接受建设性批评
- 关注对社区最有利的事情
- 对新手友好和耐心

## 许可证

通过贡献代码，你同意你的代码将以 MIT 许可证发布。

---

再次感谢你的贡献！🐙
