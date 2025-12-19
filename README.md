# 硅基流动代金券助手

一个用于 [硅基流动](https://cloud.siliconflow.cn/) 平台的油猴脚本，帮助用户更方便地管理和使用代金券。

## ✨ 功能特性

### 1. 代金券总额显示
在费用账单页面（`/expensebill`）自动显示代金券总余额，替换原有的代金券数量显示。

### 2. 模型代金券标记
在模型列表页面（`/me/models`）为支持代金券抵扣的模型添加 `💰 代金券` 徽章标识，方便快速识别。

### 3. 开关控制
提供右上角的开关按钮，可随时开启/关闭模型标记功能，状态会自动保存。

## 📦 安装

1. 安装油猴扩展（[Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)）
2. **[点击此处安装脚本](https://github.com/hyb-oyqq/siliconflow-voucher-assistant/raw/main/硅基流动代金券脚本.user.js)**
3. 访问 [硅基流动云平台](https://cloud.siliconflow.cn/) 即可自动生效

## 🔧 技术实现

- **SPA 导航监听**：拦截 `pushState`/`replaceState`，支持单页应用路由切换
- **数据缓存**：5 分钟缓存机制，减少 API 请求
- **模块化架构**：URLRouter、APIFetcher、VoucherCalculator、ModelMarker 等独立模块
- **降级兼容**：`GM_xmlhttpRequest` 不可用时自动降级为 `fetch`

## 🐛 调试

打开浏览器控制台，使用全局调试接口：

```javascript
// 查看状态
__VoucherHelper.status()

// 强制刷新数据
__VoucherHelper.refresh()

// 设置日志级别 (0=DEBUG, 1=INFO, 2=WARN, 3=ERROR)
__VoucherHelper.setLogLevel(0)
```

## 📄 许可证

MIT License

## 👤 作者

ouyangqiqi - [GitHub](https://github.com/hyb-oyqq)
