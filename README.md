# uTools Plus

推荐的 GitHub 仓库名是 `utools-plus`。当前仓库已经按单插件、多命令、多模块的方向重组，适合作为后续扩展 `bluetooth`、`sound`、以及更多 macOS 系统能力补全功能的基础仓库。

## 定位

`uTools Plus` 是一个面向 macOS 的 [uTools](https://u.tools/) 插件工程。它不是单一功能插件，而是一个命令式入口集合，用来补齐 uTools 当前没有直接覆盖的系统能力：

- `bluetooth`: 管理蓝牙连接、断开和蓝牙开关
- `sound`: 管理音频输入和输出设备，并提供系统声音设置入口
- `wifi`: 管理 Wi-Fi 开关、当前连接和附近无线网络
- 后续可以继续追加 `display`、`network` 等命令

## 命名方案

- GitHub 仓库名：`utools-plus`
- 插件显示名：`uTools Plus`
- 当前插件工程目录：`apps/utools-plus/`

`Plus` 的含义更直接，就是把 uTools 里暂未支持或支持不完整的系统功能补上。

## 当前仓库结构

```text
.
├── .github/workflows/ci.yml
├── apps/
│   └── utools-plus/
│       ├── public/
│       │   ├── plugin.json
│       │   └── preload/
│       │       ├── bluetooth-helper.js
│       │       ├── native/
│       │       ├── services.js
│       │       └── services/
│       ├── scripts/
│       ├── src/
│       │   ├── app/
│       │   ├── modules/
│       │   │   ├── bluetooth/
│       │   │   ├── sound/
│       │   │   └── wifi/
│       │   ├── App.jsx
│       │   ├── main.css
│       │   └── main.jsx
│       ├── package.json
│       └── vite.config.js
├── docs/
├── LICENSE
└── README.md
```

## 插件内部结构约定

`apps/utools-plus/src/` 现在按“路由层 + 模块层”拆开：

- `app/`: 命令路由、feature registry、全局入口
- `modules/bluetooth/`: 蓝牙模块页面、组件、文案和偏好逻辑
- `modules/sound/`: 音频输入和输出设备管理页面
- `modules/wifi/`: Wi-Fi 状态、开关和附近无线网络页面

`public/preload/` 也改成了命名空间服务模式：

- `services/bluetooth.js`
- `services/sound.js`
- `services/wifi.js`
- `services.js` 作为聚合入口，向前端暴露 `window.services.bluetooth`、`window.services.sound` 和 `window.services.wifi`

这个结构的关键点是：后面新增命令时，不再往一个页面或一个 preload 文件里堆代码，而是按命令独立扩展。

## 当前功能状态

### bluetooth

已经支持：

- 读取蓝牙控制器状态
- 读取已配对设备
- 搜索设备
- 收藏常用设备
- 快速连接和断开
- 蓝牙开关控制
- 跳转系统蓝牙设置

### sound

已经支持：

- 独立命令入口
- 独立页面模块
- 独立 preload service
- 读取音频输入和输出设备
- 切换默认输入设备
- 切换默认输出设备
- 调节默认输入和输出音量
- 静音和取消静音默认输入、输出设备
- 打开系统声音设置

### wifi

已经支持：

- 读取 Wi-Fi 开关状态
- 读取当前连接网络信息
- 扫描附近无线网络
- 打开和关闭 Wi-Fi
- 跳转系统 Wi-Fi 设置

## 开发

要求：

- Node.js 20+
- npm 10+
- uTools 桌面应用
- macOS
- Xcode Command Line Tools

安装依赖：

```bash
cd apps/utools-plus
npm install
```

启动开发：

```bash
cd apps/utools-plus
npm run dev
```

构建：

```bash
cd apps/utools-plus
npm run build
```

## 在 uTools 中接入

开发模式：

1. 运行 `apps/utools-plus` 下的 `npm run dev`
2. 在 uTools 开发者工具中接入 `apps/utools-plus/public/plugin.json`
3. 保持 dev 服务运行

构建产物：

1. 执行 `npm run build`
2. 在 uTools 开发者工具中接入 `apps/utools-plus/dist/plugin.json`

## 扩展新命令的建议方式

以后新增命令时，按下面的模板追加：

1. 在 `public/plugin.json` 增加新 feature
2. 在 `src/modules/<feature>/` 增加页面、组件和业务逻辑
3. 在 `public/preload/services/<feature>.js` 增加对应服务
4. 在 `src/app/feature-registry.js` 注册 feature code
5. 在 `src/app/AppRouter.jsx` 接入新页面

这样每个命令的 UI、逻辑和系统调用边界都比较清晰。

## License

MIT
