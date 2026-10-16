# ИИ-вселенная — бесплатный прототип

Проект состоит из Node.js сервера (Gemini API + WebSocket) и статической страницы.

## Что понадобится
- GitHub account
- Render account
- Google AI Studio account and Gemini API key
- Git installed locally, OR use GitHub website to upload files

## 1. Создайте API-ключ
1. Open https://aistudio.google.com/app/apikey
2. Create an API key in a project eligible for the Gemini API free tier.
3. Never put the key in `site/index.html` or commit it to GitHub.
4. Check the model's active quota in AI Studio. Free access and quotas can vary.

## 2. Deploy the server to Render
1. Create a GitHub repository, e.g. `ai-universe`.
2. Upload the contents of this folder while preserving `server/` and `site/`.
3. In Render choose **New → Web Service**, connect the repository.
4. Set **Root Directory** to `server`.
5. Build Command: `npm install`
6. Start Command: `npm start`
7. Choose **Free** instance.
8. In Environment add:
   - `GEMINI_API_KEY` = your secret key
   - `GEMINI_MODEL` = `gemini-2.5-flash`
   - `INTERVAL_MS` = `25000`
9. Deploy. Copy the public URL, e.g. `https://your-service-name.onrender.com`.
10. Open `https://your-service-name.onrender.com/health`; expect JSON with `"ok":true`.

## 3. Configure and deploy the page to GitHub Pages
1. Edit `site/index.html`.
2. Replace `https://YOUR-SERVICE-NAME.onrender.com` in `SERVER_URL` with the real Render URL.
3. In GitHub open the repository → **Settings → Pages**.
4. Copy `site/index.html` into a folder named `docs/` at the repository root (create `docs` if needed). GitHub Pages branch publishing supports the repository root or `/docs`, not an arbitrary `/site` folder.
5. In **Settings → Pages**, choose **Deploy from a branch**, select `main` and folder `/docs`, then save.
6. Wait for the Pages URL, typically `https://USERNAME.github.io/REPOSITORY/`.
7. Open the URL over HTTPS. Browser will connect to Render using secure WebSockets (`wss://`).

## 4. Important operational notes
- Render free services sleep after 15 minutes without inbound HTTP requests or incoming WebSocket messages. A connected client sends keepalive messages every 20 seconds, but when no viewers are connected the server may sleep.
- Render's free filesystem is ephemeral. `memory.json` is best-effort memory only and can be lost on restart, sleep, or redeploy. If persistent history is essential, use a free database tier and check its current limits/expiry before relying on it.
- The service makes one Gemini request roughly every 25 seconds while awake. That can reach 144 requests/hour and 3,456/day if continuously running, which may exceed free API quotas. Reduce generation frequency, for example `INTERVAL_MS=120000`, if you hit quota limits.
- A single server instance is intended. Do not run multiple replicas unless you also implement a shared lock and shared database.
- If your Render URL changes, update `SERVER_URL` in the frontend.
- This is a hobby prototype, not a guaranteed 24/7 service. Free-tier terms, model availability, and quotas can change.

## Local test (optional)
In `server/` run:
```bash
npm install
GEMINI_API_KEY="YOUR_KEY" npm start
```
Then change `SERVER_URL` in the page to `http://localhost:3000` (the browser code will connect with `ws://` if the URL begins with `http:`). Open `site/index.html` in a browser.
