import {axiosOF} from '../utils.js';
import { JWTSign } from '../services/JWTCreator.js'
import { Router } from 'express';
import config from '../config.js'
import { v4 as uuidv4 } from 'uuid';

const router = Router();

const requireAccessToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(400).json({ error: 'Access token required' });
    }
    next();
};

router.post('/confirmation', requireAccessToken, async (req, res) => {

 const interactionId = uuidv4();
 const authHeader = req.headers['authorization'];

 const { iban, full_name, given_name, last_name } = req.body;

 if(!iban || !full_name || !given_name || !last_name) {
   return res.status(400).json({ error: 'iban, full_name, given_name, last_name are required' });
 }

 const request = {
          "message": {
            "Data": {
                "SchemeName": "IBAN",
                "Identification": iban,
                "Name": {
                    "FullName": full_name,
                    "GivenName": given_name,
                    "LastName": last_name
                    // "BusinessName": "Business Inc."
                }
            }
        }
 }

 const signedRequest = await JWTSign(request)


const url = `${config.RESOURCE_SERVER}/open-finance/confirmation-of-payee/v1.2/confirmation`

 const requestConfig = {
       'method': 'post',
       'url': url,
       headers: {
        'Content-Type': 'application/jwt',
        'Accept': 'application/jwt',
        'Authorization': authHeader,
        'x-fapi-interaction-id': interactionId,
      },
        data : signedRequest
     };
 
 try {
     const response = await axiosOF.request(requestConfig);
     console.log(response.data);
     res.status(response.status).json(response.data);
   } catch (error) {
     console.error(error.response?.data || error.message);
     // Send the error response to the client
     res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
   }
});

export default router;
