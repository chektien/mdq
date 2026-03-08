# Local Runtime Config

MDQ can read optional runtime settings from `data/config.json`.

Quick start:

```bash
cp data/config.example.json data/config.json
```

Then edit the values you want. If `data/config.json` is missing, mdq keeps the existing defaults.

Supported keys:

- `port`: server port, defaults to `3000`
- `portFallbacks`: how many higher ports mdq will try if the requested port is busy, defaults to `10`
- `quizDir`: alternate quiz folder, resolved relative to `data/config.json` when you use a relative path
- `instanceId`: stable label for this machine or classroom instance

Example:

```json
{
  "port": 3100,
  "portFallbacks": 3,
  "quizDir": "./quizzes",
  "instanceId": "seminar-room-a"
}
```

Practical extra customizations you can keep in the same file:

- move quiz editing to another local folder with `quizDir`
- reduce `portFallbacks` if you want mdq to fail fast instead of scanning many ports
- set a memorable `instanceId` so logs and access checks are easier to read on shared teaching machines
