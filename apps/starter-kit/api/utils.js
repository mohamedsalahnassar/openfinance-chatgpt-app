import axios from 'axios';
import https from 'https';
import fs from 'fs'

  const agent = new https.Agent({
    cert: fs.readFileSync("./api/certificates/client_transport.pem"),
    key: fs.readFileSync("./api/certificates/client_transport.key"),
    rejectUnauthorized: false, // Set to true in production if you want to verify the server’s certificate
  });

  const axiosOF = axios.create({
    httpsAgent: agent,
  });

export { axiosOF };
