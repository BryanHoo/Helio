# 本机画面基础模块

`ScreenSharing` 保留 Computer Use 本机预览所需的窗口捕获、帧邮箱、Metal 渲染和测试替身。
它不提供独立工作台屏幕共享、远端控制、VNC/RFB 或 WebRTC 传输。

本机预览由 `CodevisorCoreMac/Server/ComputerUseLivePreview.swift` 调用；
Computer Use 工具与权限检查仍由原生桥接负责。
