# MEMORY

## Git 与远程仓库约定

- **所有 GitHub 仓库一律用 SSH 地址**（如 `git@github.com:psvmcode/dong.git`、`git@github.com:psvmcode/dong-web.git`）。本机直连 `github.com:443` 超时（无 http 代理、gh 未登录），但 `~/.ssh/config` 已配置 `Host github.com` + `~/.ssh/id_ed25519`，SSH 通道可用。
- **提交信息必须用中文**，英文 commit message 为硬禁止项。
- `push.autosetupremote=true`，全局 `user.name=dong`、`user.email=1084351114@qq.com`，凭据助手 `osxkeychain`。
- 参考项目：`/Users/dong/items/java/dong`（后端），`/Users/dong/items/java/dong-web`（前端控制台），两者前后端配套。
