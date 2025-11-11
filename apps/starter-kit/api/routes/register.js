import {axiosOF} from '../utils.js';
import { Router } from 'express';
import config from '../config.js'

const router = Router();

const url = `${config.RESOURCE_SERVER}/tpp-registration`

router.get('/register', async (req, res) => {
  const requestConfig = {
      'method': 'post',
       'url': url,
      data: {}
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
  })

export default router;
