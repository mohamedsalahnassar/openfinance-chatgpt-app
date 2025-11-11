import { axiosOF } from '../utils.js';
import { Router } from 'express';
import config from '../config.js'
import { JWTSign, CreateClientAssertion, encryptPII } from '../services/JWTCreator.js'
import { v4 as uuidv4 } from 'uuid';

const router = Router();

const requireAccessToken = (req, res, next) => {
    console.log(req.headers)
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(400).json({ error: 'Access token required' });
    }
    next();
};


router.post('/payments', requireAccessToken,  async (req, res) => {


    const authHeader = req.headers['authorization'];
    const { payment_amount, consent_id  } = req.body;

    if (
        typeof payment_amount !== 'string' ||
        payment_amount.trim() === '' ||
        !/^(?:0|[1-9]\d*)(\.\d{2})$/.test(payment_amount) ||
        parseFloat(payment_amount) <= 0 || ! consent_id
    ) {
        return res.status(400).json({ error: 'Invalid payment_amount' });
    }

    const interactionId = uuidv4();
    const idempotencyKey = uuidv4();


    const PII = {
        "Initiation": {
            "Creditor":
            {
                "CreditorAgent": {
                    "SchemeName": "BICFI",
                    "Identification": "10000109010101",
                    "Name": "Mario International",
                    "PostalAddress":
                        [
                            {
                                "AddressType": "Business",
                                "Country": "AE"
                            }
                        ]
                },
                "Creditor": {
                    "Name": "Mario International"
                },
                "CreditorAccount": {
                    "SchemeName": "AccountNumber",
                    "Identification": "10000109010101",
                    "Name": {
                        "en": "Mario International"
                    }
                }
            }

        },
        "Risk": {
            "DebtorIndicators": {
                "UserName": {
                    "en": "xx"
                }
            },
            "CreditorIndicators": {
                "AccountType": "Retail",
                "IsCreditorConfirmed": true,
                "IsCreditorPrePopulated": true,
                "TradingName": "xxx"
            }
        }
    }


    const encryptedPII = await encryptPII(PII)


    const request = {
        "message": {
            "Data": {
                "ConsentId": consent_id,
                "Instruction": {
                    "Amount": {
                        "Amount": payment_amount,
                        "Currency": "AED"
                    }
                },
                "OpenFinanceBilling": {
                    "Type": "Collection"
                },
                "PersonalIdentifiableInformation": encryptedPII,
                "PaymentPurposeCode": "ACM",
                // "DebtorReference": "TPP=a06154a7-fcb0-0472-be1c-21c8e5a74b6a,BIC=QW292P4TW8T",
                // "CreditorReference": "TPP=a06154a7-fcb0-0472-be1c-21c8e5a74b6a,BIC=QW292P4TW8T"
            }
        }
    }

    const signedRequest = await JWTSign(request)

    const url = `${config.RESOURCE_SERVER}/open-finance/payment/v1.2/payments`

    const requestConfig = {
        method: 'post',
        maxBodyLength: Infinity,
        'url': url,
        headers: {
            'Content-Type': 'application/jwt',
            'x-fapi-interaction-id': interactionId,
            'Authorization': authHeader,
            'x-idempotency-key': idempotencyKey,
        },
        data: signedRequest
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
