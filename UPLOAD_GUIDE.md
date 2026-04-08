# 📤 GitHub上传指南

## 上传前准备

### 1. 创建私有文件夹（不上传）
在你的项目目录下创建这些文件夹，存放核心代码：

```
octopus-project/
├── PRIVATE/              # 核心（不上传）
│   ├── ai-models/        # AI模型配置
│   ├── prompts/          # 提示词模板
│   ├── business/         # 商业逻辑
│   └── billing/          # 计费系统
```

### 2. 确认.gitignore生效
检查这些文件不会被上传：
- .env（含密钥）
- PRIVATE/ 文件夹
- node_modules/
- data/ 数据库文件

---

## GitHub上传步骤

### 方法1：网页上传（最简单）

1. 登录 GitHub.com
2. 点击右上角 `+` → `New repository`
3. 填写信息：
   - Repository name: `octopus`
   - Description: `🐙 八爪鱼 - 个人AI触手 × 企业协作平台`
   - 选择 Public（公开）
   - 勾选 Add a README file
4. 点击 `Create repository`
5. 在新仓库页面点击 `uploading an existing file`
6. 把这些文件拖进去：
   - README.md
   - LICENSE
   - .gitignore
   - .env.example
   - src/ 文件夹（除了PRIVATE）
   - scripts/ 文件夹
   - package.json
7. 点击 `Commit changes`

### 方法2：Git命令（推荐）

```bash
# 1. 打开项目目录
cd C:\Users\a1478\.qclaw\workspace\octopus-project

# 2. 初始化Git
git init
git branch -M main

# 3. 添加文件（会自动排除.gitignore里的文件）
git add .

# 4. 首次提交
git commit -m "Initial commit: 八爪鱼开源版"

# 5. 连接GitHub仓库（先在GitHub创建空仓库）
git remote add origin https://github.com/你的用户名/octopus.git

# 6. 推送
git push -u origin main
```

---

## 上传后检查

去GitHub仓库页面，确认：
- ✅ README.md 显示正常
- ✅ 没有 .env 文件
- ✅ 没有 PRIVATE/ 文件夹
- ✅ 没有 node_modules/
- ✅ LICENSE 显示 MIT

---

## 商业模式说明

```
GitHub开源版（免费）
├── 基础协作功能
├── 基础AI助手
└── 吸引用户

      ↓ 升级

商业版（付费）
├── 高级AI模型
├── 企业大脑
├── 私有部署
└── 定制开发
```

**核心保留在PRIVATE/文件夹，开源版不包含。**

---

## 需要帮助？

如有问题，联系：[你的联系方式]
