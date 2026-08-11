<div align="center">

![Logo](public/logo.png)

# z-share

适配 [ZTools](https://github.com/ZToolsCenter/ZTools) 的局域网文件共享插件

</div>

***

[更新日志](./CHANGELOG.md)

***

## 功能一览

### 文件共享管理
- 通过系统文件对话框多选文件或文件夹进行共享
- 拖拽文件或文件夹到插件窗口即可快速共享
- 支持文件夹层级展示，共享目录结构一目了然
- 文件夹内文件超过 20 个时弹出确认提示，防止误操作
- 实时开关单个文件/文件夹的共享状态
- 一键删除不需要的共享条目

### 网络配置
- 自动检测所有可用网卡及对应 IP 地址
- 支持手动选择绑定的网卡和 IP
- 一键启动/停止 HTTP 文件服务器
- 随机生成访问令牌，保障访问安全
- 一键复制访问地址，方便分享给局域网内其他设备

### 在线预览（Web 端）
- 文件树浏览，支持层级展开折叠
- 文本文件在线预览，带行号显示
- 代码文件语法高亮（支持 JavaScript、Python、Java、Go、Rust 等 30+ 语言）
- Markdown 文件支持渲染视图和源码视图切换
- 图片文件直接展示
- 音频文件 HTML5 播放器在线播放
- 视频文件 HTML5 播放器在线播放
- PDF 文件内嵌预览
- 亮色/暗色主题切换

### 安全与性能
- 访问令牌鉴权，防止未授权访问
- 文件流式传输，不占用额外内存
- 支持 Range 请求，音视频支持拖动进度条
- 引用原文件路径，不复制文件，不占用额外存储空间

## 快速开始

### 安装

- ZTools 插件市场搜索 **z-share**，点击安装
- 下载 GitHub Release 文件，在 ZTools 搜索框完成导入

### 开发

```bash
npm install
npm run dev      # 启动开发服务器
npm run build    # 构建生产版本
```

### 触发方式

在 ZTools 中输入以下关键词即可唤起：

`共享文件` · `share` · `文件共享` · `zshare`

也可以直接拖拽文件或文件夹到 ZTools 搜索框实现快速共享。

## 指令说明

| 指令 | 类型 | 说明 |
|------|------|------|
| 共享文件 / share / 文件共享 / zshare | text | 打开插件主窗口 |
| 拖拽文件/文件夹 | files | 快速共享文件 |

## 使用说明

1. 在 ZTools 中输入 `共享文件` 打开插件
2. 点击「添加文件」选择文件/文件夹，或直接拖拽到窗口
3. 在上方下拉菜单中选择要绑定的网卡 IP
4. 点击「启动服务」开启 HTTP 文件服务器
5. 复制访问地址发送给局域网内其他设备
6. 其他设备在浏览器中打开该地址即可浏览和预览文件

## 技术细节

<details>
<summary><b>HTTP 文件服务器</b></summary>

基于 Node.js `http` 模块实现的轻量级文件服务器。支持流式文件传输（`fs.createReadStream`）、HTTP Range 请求、访问令牌鉴权、CORS 跨域支持、自定义端口和绑定 IP。

</details>

<details>
<summary><b>文件扫描与索引</b></summary>

添加文件夹时，插件会递归扫描所有子文件和子目录，构建完整的层级树结构。扫描过程会跳过隐藏文件（以 `.` 开头的文件/文件夹）。扫描结果持久化存储在 ZTools 的 `dbStorage` 中。

</details>

<details>
<summary><b>Web 预览界面</b></summary>

外部 Web UI 是一个完全自包含的 HTML 文件，内联了所有 CSS 和 JavaScript，无需任何外部依赖。内置了轻量级 Markdown 解析器和代码语法高亮器，即使在无互联网连接的局域网环境中也能正常使用。

</details>

## 项目结构

```
├── public/
│   ├── plugin.json               # ZTools 插件配置
│   ├── logo.png                  # 插件图标
│   ├── web/
│   │   └── index.html            # 外部 Web 预览界面
│   └── preload/
│       ├── package.json
│       └── services.js           # Node.js 后端服务
├── src/
│   ├── App.vue                   # 根组件
│   ├── main.ts                   # 应用入口
│   ├── main.css                  # 全局样式
│   ├── env.d.ts                  # 类型定义
│   ├── share/
│   │   └── types.ts              # 共享类型定义
│   └── Share/
│       ├── index.vue             # 主管理界面
│       ├── FileTree.vue          # 递归文件树
│       ├── ShareItem.vue         # 共享条目行
│       ├── NetworkSelector.vue   # 网卡选择器
│       └── ConfirmDialog.vue     # 确认弹窗
├── .gitignore
├── CHANGELOG.md
├── LICENSE
├── package.json
├── tsconfig.json
├── vite.config.js
└── README.md
```

## 开源协议

[GPLv3](./LICENSE)

***
