# 八爪鱼系统架构设计

## 1. 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              用户接入层                                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐           │
│  │ Web App │  │Desktop  │  │ Mobile  │  │ 小程序  │  │   API   │           │
│  │ (React) │  │(Electron)│  │(RN/Flutter)│ │         │  │ Client  │           │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            API Gateway (Kong/APISIX)                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  认证鉴权 │ 限流熔断 │ 路由转发 │ 负载均衡 │ WebSocket管理 │ 日志追踪    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
        ▼                             ▼                             ▼
┌───────────────┐           ┌───────────────┐           ┌───────────────┐
│   用户服务     │           │   企业服务     │           │    AI服务     │
│  (User Svc)   │           │  (Org Svc)    │           │  (AI Svc)     │
├───────────────┤           ├───────────────┤           ├───────────────┤
│ - 用户注册登录 │           │ - 企业注册认证 │           │ - 模型路由    │
│ - 个人Claw管理│           │ - 企业Claw管理 │           │ - Agent引擎   │
│ - 习惯学习引擎│           │ - 成员权限管理 │           │ - 记忆系统    │
│ - 个人数据存储│           │ - 资源池管理  │           │ - 工具调用    │
│ - 连接管理    │           │ - 企业数据管理 │           │ - 技能系统    │
└───────────────┘           └───────────────┘           └───────────────┘
        │                             │                             │
        │                             │                             │
        ▼                             ▼                             ▼
┌───────────────┐           ┌───────────────┐           ┌───────────────┐
│   协作服务     │           │   数据服务     │           │   消息服务     │
│ (Collab Svc)  │           │  (Data Svc)   │           │ (Message Svc) │
├───────────────┤           ├───────────────┤           ├───────────────┤
│ - 多维表格    │           │ - 文档存储    │           │ - IM消息     │
│ - 云文档协作  │           │ - 文件存储    │           │ - 通知推送    │
│ - OKR系统    │           │ - 搜索索引    │           │ - 邮件发送    │
│ - 实时同步    │           │ - 数据分析    │           │ - 短信通知    │
└───────────────┘           └───────────────┘           └───────────────┘
        │                             │                             │
        └─────────────────────────────┼─────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              基础设施层                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │PostgreSQL│  │  Redis   │  │ElasticSearch│ │  MinIO  │  │ RabbitMQ │      │
│  │  主数据库 │  │缓存/会话  │  │   搜索    │  │对象存储  │  │ 消息队列  │      │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘      │
│                                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                    │
│  │Vector DB │  │  日志    │  │  监控    │  │  K8s     │                    │
│  │(Qdrant) │  │(Loki/ES) │  │(Prometheus)│ │ 容器编排  │                    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 核心数据模型

### 2.1 用户与个人 Claw

```sql
-- 用户表
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    name VARCHAR(100),
    avatar_url TEXT,
    phone VARCHAR(20),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 个人 Claw 实例
CREATE TABLE personal_claws (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id) UNIQUE,
    name VARCHAR(100),
    config JSONB DEFAULT '{}',
    storage_quota BIGINT DEFAULT 5368709120, -- 5GB
    storage_used BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 用户习惯记录
CREATE TABLE user_habits (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    habit_type VARCHAR(50),        -- action_type: 'create_doc', 'use_table', etc.
    habit_data JSONB DEFAULT '{}',
    frequency INT DEFAULT 1,
    last_occurred TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, habit_type)
);

-- 用户记忆（向量嵌入存储在 Qdrant，这里存元数据）
CREATE TABLE user_memories (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    memory_type VARCHAR(20),       -- 'short_term', 'long_term'
    content TEXT,
    embedding_id VARCHAR(100),     -- Qdrant 中的向量 ID
    importance FLOAT DEFAULT 0.5,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accessed_at TIMESTAMP,
    access_count INT DEFAULT 0
);

-- 个人 Agent 配置
CREATE TABLE personal_agents (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    name VARCHAR(100),
    description TEXT,
    config JSONB DEFAULT '{}',
    model_provider VARCHAR(50),
    model_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2.2 企业与资源池

```sql
-- 企业表
CREATE TABLE enterprises (
    id UUID PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(100) UNIQUE,      -- 企业短链接标识
    plan VARCHAR(20) DEFAULT 'team',
    max_members INT DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 企业 Claw 实例
CREATE TABLE enterprise_claws (
    id UUID PRIMARY KEY,
    enterprise_id UUID REFERENCES enterprises(id) UNIQUE,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 企业成员
CREATE TABLE enterprise_members (
    id UUID PRIMARY KEY,
    enterprise_id UUID REFERENCES enterprises(id),
    user_id UUID REFERENCES users(id),
    role VARCHAR(20) DEFAULT 'member',  -- owner, admin, member, guest
    status VARCHAR(20) DEFAULT 'active',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(enterprise_id, user_id)
);

-- 企业大模型池
CREATE TABLE enterprise_models (
    id UUID PRIMARY KEY,
    enterprise_id UUID REFERENCES enterprises(id),
    provider VARCHAR(50),          -- openai, anthropic, azure, local
    model_id VARCHAR(100),
    model_name VARCHAR(100),
    quota_limit BIGINT,            -- token 配额
    quota_used BIGINT DEFAULT 0,
    config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true
);

-- 企业共享 Agent
CREATE TABLE enterprise_agents (
    id UUID PRIMARY KEY,
    enterprise_id UUID REFERENCES enterprises(id),
    name VARCHAR(100),
    description TEXT,
    config JSONB DEFAULT '{}',
    allowed_roles JSONB DEFAULT '["admin", "member"]',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 企业技能库
CREATE TABLE enterprise_skills (
    id UUID PRIMARY KEY,
    enterprise_id UUID REFERENCES enterprises(id),
    skill_id VARCHAR(100),
    name VARCHAR(100),
    description TEXT,
    config JSONB DEFAULT '{}',
    scope VARCHAR(20) DEFAULT 'enterprise',  -- enterprise, department
    is_active BOOLEAN DEFAULT true
);
```

### 2.3 连接与权限

```sql
-- 用户-企业连接
CREATE TABLE user_enterprise_connections (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    enterprise_id UUID REFERENCES enterprises(id),
    status VARCHAR(20) DEFAULT 'active',  -- pending, active, inactive
    personal_claw_id UUID REFERENCES personal_claws(id),
    enterprise_claw_id UUID REFERENCES enterprise_claws(id),
    connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    disconnected_at TIMESTAMP,
    UNIQUE(user_id, enterprise_id)
);

-- 细粒度权限
CREATE TABLE permissions (
    id UUID PRIMARY KEY,
    resource_type VARCHAR(50),     -- document, table, agent, model
    resource_id UUID,
    enterprise_id UUID REFERENCES enterprises(id),
    role VARCHAR(20),
    permissions JSONB DEFAULT '{}',  -- {"read": true, "write": true, ...}
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2.4 协作内容

```sql
-- 多维表格
CREATE TABLE tables (
    id UUID PRIMARY KEY,
    enterprise_id UUID REFERENCES enterprises(id),
    creator_id UUID REFERENCES users(id),
    name VARCHAR(200),
    description TEXT,
    icon VARCHAR(50),
    fields JSONB DEFAULT '[]',     -- 字段定义
    views JSONB DEFAULT '[]',      -- 视图配置
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 表格数据（分区表，按企业）
CREATE TABLE table_rows (
    id UUID PRIMARY KEY,
    table_id UUID REFERENCES tables(id),
    data JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 云文档
CREATE TABLE documents (
    id UUID PRIMARY KEY,
    enterprise_id UUID REFERENCES enterprises(id),
    creator_id UUID REFERENCES users(id),
    parent_id UUID REFERENCES documents(id),  -- 文件夹结构
    name VARCHAR(255),
    type VARCHAR(20),              -- doc, sheet, slide, folder
    content JSONB DEFAULT '{}',    -- Y.js 格式的 CRDT 数据
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- OKR
CREATE TABLE okrs (
    id UUID PRIMARY KEY,
    enterprise_id UUID REFERENCES enterprises(id),
    owner_id UUID REFERENCES users(id),
    parent_id UUID REFERENCES okrs(id),  -- 支持层级
    period VARCHAR(50),            -- 2026-Q2
    type VARCHAR(10),              -- objective, key_result
    title VARCHAR(500),
    description TEXT,
    progress FLOAT DEFAULT 0,
    score FLOAT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 文件存储
CREATE TABLE files (
    id UUID PRIMARY KEY,
    enterprise_id UUID REFERENCES enterprises(id),
    uploader_id UUID REFERENCES users(id),
    filename VARCHAR(255),
    storage_key VARCHAR(500),      -- MinIO 中的 key
    size BIGINT,
    mime_type VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. AI 服务架构

### 3.1 模型路由层

```python
# core/model_router.py

from typing import Optional, Dict, Any
from enum import Enum

class ModelProvider(Enum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    AZURE = "azure"
    LOCAL = "local"

class ModelRouter:
    """
    智能模型路由：
    1. 检查企业配额
    2. 根据任务类型选择最优模型
    3. 支持降级和重试
    """
    
    def __init__(self):
        self.providers = {}
        self.quota_checker = QuotaChecker()
        self.cost_optimizer = CostOptimizer()
    
    async def route(
        self,
        user_id: str,
        enterprise_id: Optional[str],
        task_type: str,  # chat, code, analysis, embedding
        messages: list,
        **kwargs
    ) -> Dict[str, Any]:
        """
        路由决策流程：
        1. 确定可用模型池（个人/企业）
        2. 根据任务类型选择模型
        3. 检查配额
        4. 调用模型
        5. 记录用量
        """
        
        # 1. 获取可用模型
        available_models = await self._get_available_models(
            user_id, enterprise_id
        )
        
        # 2. 任务-模型映射
        model_preference = self._get_model_preference(task_type)
        
        # 3. 选择模型（考虑配额和成本）
        selected_model = await self._select_model(
            available_models, 
            model_preference,
            enterprise_id
        )
        
        # 4. 调用模型
        response = await self._call_model(
            selected_model, 
            messages, 
            **kwargs
        )
        
        # 5. 记录用量
        await self._record_usage(
            user_id, 
            enterprise_id, 
            selected_model, 
            response.usage
        )
        
        return response
    
    def _get_model_preference(self, task_type: str) -> list:
        """
        任务类型到模型偏好的映射
        """
        preferences = {
            "chat": ["gpt-4-turbo", "claude-3-opus", "gpt-3.5-turbo"],
            "code": ["claude-3-opus", "gpt-4-turbo", "codestral"],
            "analysis": ["claude-3-opus", "gpt-4-turbo"],
            "embedding": ["text-embedding-3-large", "text-embedding-3-small"],
            "fast": ["gpt-3.5-turbo", "claude-3-haiku"],
        }
        return preferences.get(task_type, preferences["chat"])
```

### 3.2 Agent 引擎

```python
# core/agent_engine.py

from typing import List, Dict, Any, Optional
from abc import ABC, abstractmethod

class Tool(ABC):
    """工具基类"""
    
    @property
    @abstractmethod
    def name(self) -> str:
        pass
    
    @property
    @abstractmethod
    def description(self) -> str:
        pass
    
    @property
    @abstractmethod
    def parameters(self) -> dict:
        pass
    
    @abstractmethod
    async def execute(self, **kwargs) -> Any:
        pass

class Agent:
    """
    Agent 实体：
    - 拥有工具集
    - 拥有记忆
    - 可以执行任务
    """
    
    def __init__(
        self,
        agent_id: str,
        name: str,
        model_config: dict,
        tools: List[Tool],
        memory_config: dict
    ):
        self.agent_id = agent_id
        self.name = name
        self.model_config = model_config
        self.tools = {tool.name: tool for tool in tools}
        self.memory = Memory(**memory_config)
    
    async def run(self, user_input: str, context: dict = None) -> dict:
        """
        Agent 执行循环：
        1. 加载记忆
        2. 构建提示词
        3. 调用 LLM
        4. 执行工具调用（如果有）
        5. 更新记忆
        6. 返回结果
        """
        
        # 加载相关记忆
        memories = await self.memory.retrieve(user_input)
        
        # 构建消息
        messages = self._build_messages(user_input, memories, context)
        
        # 调用 LLM
        response = await self._call_llm(messages)
        
        # 处理工具调用
        while response.tool_calls:
            tool_results = await self._execute_tools(response.tool_calls)
            messages.append({
                "role": "assistant",
                "content": None,
                "tool_calls": response.tool_calls
            })
            messages.extend(tool_results)
            response = await self._call_llm(messages)
        
        # 保存记忆
        await self.memory.store(user_input, response.content)
        
        return {
            "content": response.content,
            "agent_id": self.agent_id
        }

class AgentManager:
    """
    Agent 管理器：
    - 创建/销毁 Agent
    - 权限控制
    - 资源隔离
    """
    
    async def get_agent(
        self, 
        agent_id: str, 
        user_id: str,
        enterprise_id: Optional[str]
    ) -> Agent:
        """
        获取 Agent 实例：
        1. 检查权限
        2. 加载配置
        3. 初始化工具
        4. 返回实例
        """
        pass
    
    async def create_agent(
        self,
        user_id: str,
        enterprise_id: Optional[str],
        config: dict
    ) -> Agent:
        """创建新 Agent"""
        pass
    
    async def list_tools(
        self,
        scope: str,  # personal, enterprise
        scope_id: str
    ) -> List[Tool]:
        """列出可用工具"""
        pass
```

### 3.3 记忆系统

```python
# core/memory.py

from typing import List, Dict, Any, Optional
import qdrant_client
from datetime import datetime

class Memory:
    """
    分层记忆系统：
    - 工作记忆（当前会话）
    - 短期记忆（最近交互）
    - 长期记忆（重要信息）
    """
    
    def __init__(
        self,
        user_id: str,
        vector_db: qdrant_client.QdrantClient,
        redis_client
    ):
        self.user_id = user_id
        self.vector_db = vector_db
        self.redis = redis_client
        
        self.working_memory = []  # 当前会话
        self.short_term_limit = 50  # 短期记忆条数
    
    async def store(self, input_text: str, output_text: str, metadata: dict = None):
        """
        存储记忆：
        1. 生成 embedding
        2. 计算重要性
        3. 决定存储层级
        4. 写入对应存储
        """
        
        # 生成 embedding
        embedding = await self._get_embedding(f"{input_text} {output_text}")
        
        # 计算重要性（基于内容长度、关键词等）
        importance = self._calculate_importance(input_text, output_text)
        
        # 添加到工作记忆
        memory_item = {
            "input": input_text,
            "output": output_text,
            "timestamp": datetime.now().isoformat(),
            "importance": importance,
            "metadata": metadata or {}
        }
        self.working_memory.append(memory_item)
        
        # 重要信息存入长期记忆
        if importance > 0.7:
            await self._store_long_term(memory_item, embedding)
        
        # 定期压缩短期记忆
        if len(self.working_memory) > self.short_term_limit:
            await self._compress_short_term()
    
    async def retrieve(self, query: str, limit: int = 10) -> List[Dict]:
        """
        检索记忆：
        1. 从工作记忆获取
        2. 从长期记忆向量搜索
        3. 合并去重
        """
        
        # 工作记忆
        working = self.working_memory[-5:]  # 最近5条
        
        # 向量搜索长期记忆
        query_embedding = await self._get_embedding(query)
        long_term = await self.vector_db.search(
            collection_name=f"user_{self.user_id}",
            query_vector=query_embedding,
            limit=limit
        )
        
        # 合并结果
        return working + [hit.payload for hit in long_term]
    
    async def _compress_short_term(self):
        """
        压缩短期记忆：
        将低重要性的记忆删除，高重要性的提升为长期记忆
        """
        pass
```

---

## 4. 协作服务架构

### 4.1 实时协作（CRDT）

```typescript
// collab/yjs-server.ts

import { WebSocket } from 'ws'
import * as Y from 'yjs'
import { LeveldbPersistence } from 'y-leveldb'

/**
 * 基于 Y.js 的实时协作服务
 * 支持：文档、表格、白板
 */

interface CollabDocument {
  docId: string
  doc: Y.Doc
  clients: Set<WebSocket>
  persistence: LeveldbPersistence
}

class CollabServer {
  private documents: Map<string, CollabDocument> = new Map()
  
  async handleConnection(ws: WebSocket, docId: string, userId: string) {
    // 获取或创建文档
    const collab = await this.getOrCreateDocument(docId)
    collab.clients.add(ws)
    
    // 发送初始状态
    const state = Y.encodeStateAsUpdate(collab.doc)
    ws.send(state)
    
    // 监听客户端更新
    ws.on('message', (data) => {
      const update = new Uint8Array(data as Buffer)
      Y.applyUpdate(collab.doc, update)
      
      // 广播给其他客户端
      collab.clients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(update)
        }
      })
      
      // 异步持久化
      collab.persistence.storeUpdate(docId, update)
    })
    
    ws.on('close', () => {
      collab.clients.delete(ws)
      if (collab.clients.size === 0) {
        // 延迟清理
        setTimeout(() => this.cleanupDocument(docId), 300000) // 5分钟
      }
    })
  }
  
  private async getOrCreateDocument(docId: string): Promise<CollabDocument> {
    if (this.documents.has(docId)) {
      return this.documents.get(docId)!
    }
    
    const doc = new Y.Doc()
    const persistence = new LeveldbPersistence(`./data/${docId}`)
    
    // 加载持久化数据
    const persistedState = await persistence.getYDoc(docId)
    Y.applyUpdate(doc, persistedState)
    
    const collab: CollabDocument = {
      docId,
      doc,
      clients: new Set(),
      persistence
    }
    
    this.documents.set(docId, collab)
    return collab
  }
}
```

### 4.2 多维表格引擎

```typescript
// table/table-engine.ts

import { EventEmitter } from 'events'

/**
 * 多维表格核心引擎
 * 支持：字段计算、视图过滤、实时同步
 */

interface Field {
  id: string
  name: string
  type: 'text' | 'number' | 'date' | 'select' | 'multiSelect' | 'formula' | 'ai'
  config: FieldConfig
}

interface View {
  id: string
  name: string
  type: 'grid' | 'kanban' | 'gantt' | 'calendar' | 'gallery'
  filter: FilterCondition[]
  sort: SortCondition[]
  groupBy?: string
}

interface Row {
  id: string
  data: Record<string, any>
  createdAt: Date
  updatedAt: Date
  createdBy: string
}

class TableEngine extends EventEmitter {
  private fields: Map<string, Field> = new Map()
  private rows: Map<string, Row> = new Map()
  private views: Map<string, View> = new Map()
  
  /**
   * AI 字段计算
   */
  async calculateAIField(rowId: string, fieldId: string): Promise<any> {
    const field = this.fields.get(fieldId)
    if (field.type !== 'ai') return
    
    const row = this.rows.get(rowId)
    const prompt = this.buildAIPrompt(field, row)
    
    // 调用 AI 服务
    const result = await this.aiService.generate(prompt)
    
    // 更新行数据
    row.data[fieldId] = result
    this.emit('row-updated', { rowId, fieldId, value: result })
    
    return result
  }
  
  /**
   * 公式字段计算
   */
  calculateFormulaField(rowId: string, fieldId: string): any {
    const field = this.fields.get(fieldId)
    if (field.type !== 'formula') return
    
    const row = this.rows.get(rowId)
    const formula = field.config.formula
    
    // 安全的公式解析器
    const result = this.formulaEngine.evaluate(formula, row.data)
    row.data[fieldId] = result
    
    return result
  }
  
  /**
   * 视图过滤
   */
  getFilteredRows(viewId: string): Row[] {
    const view = this.views.get(viewId)
    let rows = Array.from(this.rows.values())
    
    // 应用过滤条件
    for (const filter of view.filter) {
      rows = rows.filter(row => this.matchFilter(row, filter))
    }
    
    // 应用排序
    rows.sort((a, b) => this.compareRows(a, b, view.sort))
    
    // 应用分组
    if (view.groupBy) {
      rows = this.groupRows(rows, view.groupBy)
    }
    
    return rows
  }
  
  /**
   * 实时同步
   */
  syncChange(change: TableChange) {
    // 应用变更
    this.applyChange(change)
    
    // 广播给订阅者
    this.emit('change', change)
    
    // 触发相关计算
    if (change.type === 'row-updated') {
      this.triggerDependentCalculations(change.rowId, change.fieldId)
    }
  }
}
```

---

## 5. 微服务通信

### 5.1 事件驱动架构

```yaml
# 事件定义 (RabbitMQ)

exchanges:
  user.events:
    type: topic
    queues:
      - user.created
      - user.updated
      - user.deleted
      
  enterprise.events:
    type: topic
    queues:
      - enterprise.created
      - enterprise.member_joined
      - enterprise.member_left
      - enterprise.resource_updated
      
  ai.events:
    type: topic
    queues:
      - ai.conversation_started
      - ai.tool_called
      - ai.memory_stored
      
  collab.events:
    type: topic
    queues:
      - collab.document_created
      - collab.document_updated
      - collab.table_row_changed
```

### 5.2 服务间 RPC

```typescript
// 使用 gRPC 或 HTTP REST

// 用户服务接口
interface UserService {
  getUser(userId: string): Promise<User>
  getPersonalClaw(userId: string): Promise<PersonalClaw>
  getUserHabits(userId: string): Promise<Habit[]>
  connectEnterprise(userId: string, enterpriseId: string): Promise<Connection>
  disconnectEnterprise(userId: string, enterpriseId: string): Promise<void>
}

// 企业服务接口
interface EnterpriseService {
  getEnterprise(enterpriseId: string): Promise<Enterprise>
  getMembers(enterpriseId: string): Promise<Member[]>
  getAvailableModels(enterpriseId: string): Promise<Model[]>
  getAvailableAgents(enterpriseId: string): Promise<Agent[]>
  checkPermission(userId: string, resource: string, action: string): Promise<boolean>
}

// AI 服务接口
interface AIService {
  chat(request: ChatRequest): Promise<ChatResponse>
  executeAgent(agentId: string, input: string): Promise<AgentResult>
  getMemory(userId: string, query: string): Promise<Memory[]>
  storeMemory(userId: string, content: string): Promise<void>
}
```

---

## 6. 安全架构

### 6.1 认证授权

```
┌─────────────────────────────────────────────────────────────┐
│                      认证流程                                │
│                                                              │
│  1. 用户登录 → JWT Token (access + refresh)                 │
│  2. Token 包含: user_id, personal_claw_id                   │
│  3. 每次请求验证 Token 有效性                                │
│  4. 访问企业资源时额外检查连接状态                           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      权限检查流程                            │
│                                                              │
│  用户请求企业资源:                                           │
│  1. Token 解析 → user_id                                    │
│  2. 查询 user_enterprise_connections → status=active?       │
│  3. 查询 enterprise_members → role                          │
│  4. 查询 permissions → 有对应权限?                           │
│  5. 执行操作                                                 │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 数据隔离

```sql
-- 行级安全策略 (PostgreSQL RLS)

-- 用户只能访问自己的个人数据
CREATE POLICY user_isolation ON personal_claws
    USING (user_id = current_user_id());

-- 用户只能访问已连接企业的数据
CREATE POLICY enterprise_access ON documents
    USING (
        enterprise_id IN (
            SELECT enterprise_id 
            FROM user_enterprise_connections 
            WHERE user_id = current_user_id() 
            AND status = 'active'
        )
    );

-- 企业数据不被个人访问（除非已连接）
CREATE POLICY enterprise_data_isolation ON enterprise_claws
    USING (
        enterprise_id IN (
            SELECT enterprise_id 
            FROM user_enterprise_connections 
            WHERE user_id = current_user_id() 
            AND status = 'active'
        )
    );
```

---

## 7. 部署架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Kubernetes Cluster                      │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │   Ingress       │  │   CDN/WAF       │                  │
│  │   (Nginx/Traefik)│  │                 │                  │
│  └─────────────────┘  └─────────────────┘                  │
│           │                                                  │
│           ▼                                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  API Gateway                         │   │
│  └─────────────────────────────────────────────────────┘   │
│           │                                                  │
│           ▼                                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               Service Mesh (Istio)                   │   │
│  └─────────────────────────────────────────────────────┘   │
│           │                                                  │
│  ┌────────┼────────┬────────┬────────┬────────┐            │
│  ▼        ▼        ▼        ▼        ▼        ▼            │
│ ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐            │
│ │User│  │ Org│  │ AI │  │Collab│ │Data│  │Msg │            │
│ │Svc │  │Svc │  │Svc │  │Svc │  │Svc │  │Svc │            │
│ └────┘  └────┘  └────┘  └────┘  └────┘  └────┘            │
│     │        │        │        │        │        │          │
│     └────────┴────────┴────────┴────────┴────────┘          │
│                       │                                      │
│                       ▼                                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Stateful Services                       │   │
│  │  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐            │   │
│  │  │ PG   │  │Redis │  │ ES   │  │Qdrant│            │   │
│  │  │(主从)│  │(集群)│  │(集群)│  │      │            │   │
│  │  └──────┘  └──────┘  └──────┘  └──────┘            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Object Storage (MinIO)                  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

这份架构设计文档覆盖了八爪鱼的核心技术实现。需要我详细展开某个模块吗？比如：

1. **习惯学习引擎**的具体算法
2. **多维表格**的完整实现
3. **Agent 编排**的工作流设计
4. **前端架构**和技术栈
