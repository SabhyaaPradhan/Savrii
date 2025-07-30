import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Serve favicon with correct MIME type
app.get('/favicon.ico', (req, res) => {
  res.setHeader('Content-Type', 'image/x-icon');
  res.sendFile(path.resolve('public/favicon.ico'));
});

app.get('/favicon.png', (req, res) => {
  res.setHeader('Content-Type', 'image/png');
  res.sendFile(path.resolve('public/favicon.png'));
});

// Domain redirection middleware - redirect all traffic to www.savrii.com
// Disabled in development to allow OAuth to work on replit domain
app.use((req, res, next) => {
  const host = req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  
  // Only redirect in production and only for non-OAuth routes
  if (process.env.NODE_ENV === 'production' && 
      host && 
      host !== 'www.savrii.com' && 
      !req.path.includes('/auth/') &&
      !req.path.includes('/api/')) {
    return res.redirect(301, `https://www.savrii.com${req.url}`);
  }
  
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Ensure root path serves the React app (not README or other files)
app.get('/', (req, res, next) => {
  // In production, always serve the React app index.html
  if (app.get("env") === "production") {
    const distPath = path.resolve(__dirname, "..", "dist", "public");
    const indexPath = path.resolve(distPath, "index.html");
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
  }
  // In development, let Vite handle it
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
