import { axiosOF } from '../utils.js';
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


router.get('/accounts', requireAccessToken, async (req, res) => {

 const interactionId = uuidv4();
 const authHeader = req.headers['authorization'];

const url = `${config.RESOURCE_SERVER}/open-finance/account-information/v1.2/accounts`

 const requestConfig = {
       'method': 'get',
       'url': url,
       headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authHeader,
        'x-fapi-interaction-id': interactionId,
      },
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


router.get('/parties', requireAccessToken, async (req, res) => {

 const interactionId = uuidv4();
 const authHeader = req.headers['authorization'];

const url = `${config.RESOURCE_SERVER}/open-finance/account-information/v1.2/parties`

 const requestConfig = {
       'method': 'get',
       'url': url,
       headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authHeader,
        'x-fapi-interaction-id': interactionId,
      },
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


router.get('/accounts/:accountId/:dataType',
  requireAccessToken,
  async (req, res) => {
    const { accountId, dataType } = req.params; // ✅ Fix: include dataType here

    const validTypes = [
      'balances',
      'transactions',
      'direct-debits',
      'beneficiaries',
      'scheduled-payments',
      'standing-orders',
      'product',
    ];

    // ✅ Validate dataType
    if (!validTypes.includes(dataType)) {
      return res
        .status(400)
        .json({
          description: `Invalid data type. Must be one of: ${validTypes.join(', ')}`,
        });
    }

    // ✅ Validate accountId
    if (!accountId) {
      return res.status(400).json({ description: 'accountId required' });
    }

    const interactionId = uuidv4();
    const authHeader = req.headers['authorization'];
    const url = `${config.RESOURCE_SERVER}/open-finance/account-information/v1.2/accounts/${accountId}/${dataType}`;

    try {
      const response = await axiosOF.get(url, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: authHeader,
          'x-fapi-interaction-id': interactionId,
        },
      });

      console.log(response.data);
      res.status(response.status).json(response.data);
    } catch (error) {
      console.error(error.response?.data || error.message);
      res
        .status(error.response?.status || 500)
        .json(error.response?.data || { error: error.message });
    }
  }
);

export default router;
