# 高架车流贴图接口

在 `src/game/scenes.ts` 的 `OVERPASS.traffic.textures` 中设置对应路径。
默认值 `null` 使用内置绘制，不请求不存在的文件；设置后刷新页面即可加载。

- `sedan`: `/game/scenes/overpass/sedan.png`，透明 PNG/WebP，建议 1060 × 390。
- `suv`: `/game/scenes/overpass/suv.png`，透明 PNG/WebP，建议 1190 × 550。
- `truck`: `/game/scenes/overpass/truck.png`，透明 PNG/WebP，建议 1760 × 880。
- `bridge`: `/game/scenes/overpass/bridge.png`，建议 1560 × 116，覆盖横贯画面的桥面横梁。

车辆侧视图朝右，车轮底部贴齐图片底边，车身填满画布；左行时自动镜像。
尺寸以 390 宽场地为基准，随画面等比缩放。轿车、SUV 的座舱位于宽度
22%–77%、高度 2%–52%；底盘位于宽度 2%–98%、高度 48%–86%。
卡车货箱位于左侧 2%–66%，驾驶室位于右侧 66%–98%、高度 28%–85%。
碰撞体由 `src/game/traffic.ts` 的 `vehicleHulls` 定义，换美术不会改变碰撞；
如轮廓发生明显变化，可同步调整相应 UV 矩形。

桥贴图从桥面车轮基线向下绘制，不带碰撞体。默认桥墩也是无碰撞的背景。
使用同源路径；跨域资源须允许 CORS。图片加载失败时保留内置绘制。
