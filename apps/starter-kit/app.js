// app.js
import express from 'express';
import cors from 'cors'
import { createServer as createViteServer } from "vite";
import swaggerUi from 'swagger-ui-express'
import fs from 'fs'
import YAML from "yaml";
import path from 'path';
import { fileURLToPath } from 'url';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// 🔹 Import APIs
// register
import register from './api/routes/register.js'
// consent creation (oauth)
import consentCreate from './api/routes/consentCreate.js'
// token 
import tokens from './api/routes/tokens.js'
// resources
import bankData from './api/routes/bankData.js'
import paymentInitiation from './api/routes/paymentInitiation.js'
import productsAndLeads from './api/routes/productsAndLeads.js'
import confirmationOfPayee from './api/routes/confirmationOfPayee.js'




const app = express();
app.use(express.json());
app.use(cors());


// API routes
app.use('', register);

app.use('/consent-create', consentCreate);
app.use('/token', tokens);

app.use('/open-finance/account-information/v1.2', bankData);
app.use('/open-finance/payment/v1.2', paymentInitiation);
app.use('/open-finance/product/v1.2', productsAndLeads);
app.use('/open-finance/confirmation-of-payee/v1.2', confirmationOfPayee);



// Swagger UI
const file = fs.readFileSync("./api/swagger.yaml", "utf8");
const swaggerSpec = YAML.parse(file);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));


// client
// Vite middleware setup (dev mode)
const vite = await createViteServer({
  server: { middlewareMode: true },
  root: path.join(__dirname, "./client"),
  appType: "custom", // don't serve index.html automatically
});

app.use(vite.middlewares);


// Let Vite handle /client routes
app.use(async (req, res, next) => {
  try {
    // Serve index.html for any route under /client (including deep links)
    if (!req.originalUrl.startsWith("/client")) return next();

    const templatePath = path.join(vite.config.root, "index.html");
    let template = await fs.promises.readFile(templatePath, "utf-8");

    // Let Vite transform index.html (for dev mode, HMR, env vars, etc.)
    template = await vite.transformIndexHtml(req.originalUrl, template);

    res.status(200).set({ "Content-Type": "text/html" }).end(template);
  } catch (err) {
    vite.ssrFixStacktrace(err);
    next(err);
  }
});

// Start server
const PORT = process.env.PORT || 1411;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));