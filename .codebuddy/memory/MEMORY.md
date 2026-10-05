# MEMORY

## Git 与远程仓库约定

- **git 远程地址一律用 SSH**（如 `git@github.com:psvmcode/dong.git`、`git@github.com:psvmcode/dong-web.git`）。`~/.ssh/config` 已配置 `Host github.com` + `~/.ssh/id_ed25519`，SSH 通道可用。
- **HTTPS 必须走本机代理**：本机系统代理（scutil --proxy）为 `127.0.0.1:7897`（HTTP/HTTPS/SOCKS 同一端口），但 shell 环境里没有 `http_proxy` 变量，所以直连 `github.com:443` 会超时。凡是需要 HTTPS/github API 的命令（curl、gh）都显式带上 `HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897` 才能通。
- **提交信息必须用中文**，英文 commit message 为硬禁止项。
- `push.autosetupremote=true`，全局 `user.name=dong`、`user.email=1084351114@qq.com`，凭据助手 `osxkeychain`。
- 参考项目：`/Users/dong/items/java/dong`（后端），`/Users/dong/items/java/dong-web`（前端控制台），两者前后端配套。
