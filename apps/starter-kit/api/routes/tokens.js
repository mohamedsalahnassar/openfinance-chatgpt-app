import { axiosOF } from '../utils.js';
import { Router } from 'express';
import config from '../config.js'
import { CreateClientAssertion } from '../services/JWTCreator.js'

const router = Router();


router.post('/client-credentials', async (req, res) => {

    const { scope } = req.body;

    const allowedScopes = [
        'confirmation-of-payee',
        'openid payments',
        'openid accounts',
        'openid accounts payments',
        'openid payments accounts',
        'openid products'
    ]


    if (!scope || !allowedScopes.includes(scope)) {
        return res.status(400).json({
            description: 'Invalid scope'
        });
    }

    const signedClientAssertion = await CreateClientAssertion()

    const data = {
        'grant_type': 'client_credentials',
        'scope': scope,
        'client_assertion_type': 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        'client_assertion': signedClientAssertion
    };


    const requestConfig = {
        method: 'post',
        maxBodyLength: Infinity,
        url: config.TOKEN_ENDPOINT,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        data: data,
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


router.post('/authorization-code', async (req, res) => {

    const { code, code_verifier } = req.body;

    if (!code || !code_verifier) {
        return res.status(400).json({
            description: 'code and code_verifier requred'
        });
    }

    const signedClientAssertion = await CreateClientAssertion()

    const data = {
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': config.REDIRECT_URI,
        'code_verifier': code_verifier,
        'client_assertion_type': 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        'client_assertion': signedClientAssertion
    };


    const requestConfig = {
        method: 'post',
        maxBodyLength: Infinity,
        url: config.TOKEN_ENDPOINT,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        data: data,
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

router.post('/refresh-token', async (req, res) => {

    const { refresh_token } = req.body;

    if (!refresh_token) {
        return res.status(400).json({
            description: 'refresh_token requred'
        });
    }

    const signedClientAssertion = await CreateClientAssertion()

    const data = {
          'grant_type': 'refresh_token',
          'refresh_token': refresh_token,
          'client_assertion_type': 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
          'client_assertion': signedClientAssertion
    };


    const requestConfig = {
        method: 'post',
        maxBodyLength: Infinity,
        url: config.TOKEN_ENDPOINT,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        data: data,
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
