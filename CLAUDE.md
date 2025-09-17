# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目架构概览

这是一个基于MCP（Model Context Protocol）的Python代码执行服务器，主要组件：

- **MCP服务器** (`src/index.ts`): 主服务器实现，使用stdio传输协议
- **Python执行器** (`src/py.worker.ts`): Web Worker中的Pyodide WASM环境
- **依赖管理** (`src/deps.ts`): PEP 723格式的依赖提取和合并

架构特点：
- 主进程处理MCP协议，Worker进程执行Python代码
- 支持在线包安装和PEP 723依赖管理
- 使用Zod进行输入验证和类型检查

## 常用开发命令

### 安装依赖
```bash
bun install
```

### 开发运行
```bash
bun run dev
```

### 生产运行
```bash
bun run start
```

### 构建单文件可执行程序
```bash
bun build src/index.ts --compile --outfile mcp-python
```

## 运行时配置

### 离线Pyodide
设置环境变量使用本地Pyodide分发：
```bash
set PYODIDE_INDEX_URL=file:///absolute/path/to/pyodide/full/
./mcp-python
```

## 项目结构

```
src/
├── index.ts      # MCP服务器主入口
├── py.worker.ts  # Pyodide Web Worker执行器
└── deps.ts       # 依赖管理工具

package.json      # 项目配置和依赖
tsconfig.json     # TypeScript配置
bun.lock         # Bun依赖锁定文件
```

## 代码风格和配置

项目使用现代TypeScript配置：
- 目标ESNext，模块解析使用Bundler模式
- 启用严格类型检查和相关最佳实践
- 支持Web Worker和DOM环境
- JSX支持React样式（如果需要）