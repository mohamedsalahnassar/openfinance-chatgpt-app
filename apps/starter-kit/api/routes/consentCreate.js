import { axiosOF } from '../utils.js';
import { Router } from 'express';
import config from '../config.js'
import { JWTSign, CreateClientAssertion, encryptPII } from '../services/JWTCreator.js'
import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();


router.post('/single-payment', async (req, res) => {

    const { payment_amount } = req.body;

    if (
        typeof payment_amount !== 'string' ||
        payment_amount.trim() === '' ||
        !/^(?:0|[1-9]\d*)(\.\d{2})$/.test(payment_amount) ||
        parseFloat(payment_amount) <= 0
    ) {
        return res.status(400).json({ error: 'Invalid payment_amount' });
    }


    const PII = {
        "Initiation": {
            "Creditor": [
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
            ]
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

    console.log('encryptedPII', encryptedPII)

    const now = new Date();
    const expirationConsent = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        23, 0, 0
    ).toISOString();

    const consentId = uuidv4()
    const authorizationDetails = [
        {
            "type": "urn:openfinanceuae:service-initiation-consent:v1.2",
            "consent": {
                "ConsentId": consentId,
                "IsSingleAuthorization": true,
                "ExpirationDateTime": expirationConsent,
                // "Permissions": [
                //     "ReadAccountsBasic",
                //     "ReadAccountsDetail",
                //     "ReadBalances",
                //     "ReadRefundAccount"
                // ],
                "PersonalIdentifiableInformation": encryptedPII,
                "ControlParameters": {
                    "ConsentSchedule": {
                        "SinglePayment": {
                            "Type": "SingleInstantPayment",
                            "Amount": {
                                "Amount": payment_amount,
                                "Currency": "AED"
                            }
                        }
                    }
                },
                // "DebtorReference": "TPP=abcdef12-3456-789a-bcde-123456abcdef,,BIC=CHASUS33,REFERENCE",
                // "CreditorReference": "TPP=abcdef12-3456-789a-bcde-123456abcdef,BIC=CHASUS33,REFERENCE",
                "PaymentPurposeCode": "ACM"
            },
            // "subscription": {
            //     "Webhook": {
            //         "Url": "http://localhost:4700/mock-tpp-event-receiver",
            //         "IsActive": false
            //     }
            // }
        }
    ]

    console.log(authorizationDetails)

    const nonce = uuidv4()


    const codeVerifier = uuidv4() + uuidv4();

    console.log(codeVerifier)


    const hashedCodeVerifier = CryptoJS.SHA256(codeVerifier);
    let codeChallenge = CryptoJS.enc.Base64.stringify(hashedCodeVerifier);

   


    codeChallenge = codeChallenge.replaceAll('+', '-');
    codeChallenge = codeChallenge.replaceAll('/', '_');
    if (codeChallenge.endsWith('=')) { codeChallenge = codeChallenge.substring(0, codeChallenge.length - 1) }

    const stateData = {
        code_verifier: codeVerifier,
        consent_id: consentId
    };

    console.log(codeVerifier)
    console.log(codeChallenge)

    const state = btoa(JSON.stringify(stateData));

    const request = {
        scope: 'payments openid',
        redirect_uri: config.REDIRECT_URI,
        client_id: config.CLIENT_ID,
        nonce: nonce,
        state: state,
        response_type: 'code',
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
        max_age: 3600,
        authorization_details: authorizationDetails,
    }

    const signedRequest = await JWTSign(request)


    console.log(config.CLIENT_ASSERTION)

    const signedClientAssertion = await CreateClientAssertion()

    console.log(signedClientAssertion)

    const data = {
        'client_id': config.CLIENT_ID,
        'request': signedRequest,
        'client_assertion_type': 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        'client_assertion': signedClientAssertion
    };


    const requestConfig = {
        method: 'post',
        maxBodyLength: Infinity,
        url: config.PAR_ENDPOINT,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        data: data,
    };

    console.log(requestConfig)

    try {
        const response = await axiosOF.request(requestConfig);
        const authEndpoint = config.AUTH_ENDPOINT

        const redirectLink = `${authEndpoint}?client_id=${config.CLIENT_ID}&response_type=code&scope=openid&request_uri=${response.data.request_uri}`;
        res.status(response.status).json({ redirect: redirectLink, consent_id: consentId, code_verifier: codeVerifier });

    } catch (error) {
        console.error(error.response?.data || error.message);
        // Send the error response to the client
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

router.post('/variable-on-demand-payments', async (req, res) => {

    const { max_payment_amount } = req.body;

    if (
        typeof max_payment_amount !== 'string' ||
        max_payment_amount.trim() === '' ||
        !/^(?:0|[1-9]\d*)(\.\d{2})$/.test(max_payment_amount) ||
        parseFloat(max_payment_amount) <= 0
    ) {
        return res.status(400).json({ error: 'Invalid max_payment_amount' });
    }


    const PII = {
        "Initiation": {
            "Creditor": [
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
            ]
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


    const today = new Date();

    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');

    const periodStart = `${yyyy}-${mm}-${dd}`;

    const consentId = uuidv4()

    const authorizationDetails = [
        {
            "type": "urn:openfinanceuae:service-initiation-consent:v1.2",
            "consent": {
                "ConsentId": consentId,
                "IsSingleAuthorization": true,
                // "AuthorizationExpirationDateTime": "720:00:00",
                "ExpirationDateTime": "2025-12-25T00:00:00.000Z",
                "Permissions": [
                    "ReadAccountsBasic",
                    "ReadAccountsDetail",
                    "ReadBalances",
                    // "ReadRefundAccount"
                ],
                "ControlParameters": {
                    "IsDelegatedAuthentication": false,
                    "ConsentSchedule": {
                        "MultiPayment": {
                            //     "MaximumCumulativeNumberOfPayments": 2,
                            //     "MaximumCumulativeValueOfPayments": {
                            //         "Amount": "500.00",
                            //         "Currency": "AED"
                            //     },
                            "PeriodicSchedule": {
                                "Type": "VariableOnDemand",
                                "PeriodType": "Day",
                                "PeriodStartDate": periodStart,
                                "Controls": {
                                    "MaximumIndividualAmount": {
                                        "Amount": max_payment_amount,
                                        "Currency": "AED"
                                    },
                                    //      "MaximumCumulativeNumberOfPaymentsPerPeriod": 2,
                                    //      "MaximumCumulativeValueOfPaymentsPerPeriod": {
                                    //          "Amount": "200.00",
                                    //          "Currency": "AED"
                                    //     }
                                }
                            }
                        }
                    }
                },
                "PersonalIdentifiableInformation": encryptedPII,
                // "DebtorReference": "TPP=123e4567-e89b-12d3-a456-426614174000,Merchant=ABC-ABCD-TL001-2024,BIC=DEUTDEFFXXX",
                "PaymentPurposeCode": "ACM",
            },
            // "subscription": {
            //     "Webhook": {
            //         "Url": "http://localhost:4700/mock-event-receiver",
            //         "IsActive": false
            //     }
            // }
        }
    ]

    console.log(authorizationDetails)

    const nonce = uuidv4()

    const codeVerifier = uuidv4() + uuidv4();

    const hashedCodeVerifier = CryptoJS.SHA256(codeVerifier);
    let codeChallenge = CryptoJS.enc.Base64.stringify(hashedCodeVerifier);


    codeChallenge = codeChallenge.replaceAll('+', '-');
    codeChallenge = codeChallenge.replaceAll('/', '_');
    if (codeChallenge.endsWith('=')) { codeChallenge = codeChallenge.substring(0, codeChallenge.length - 1) }


    const stateData = {
        code_verifier: codeVerifier,
        consent_id: consentId
    };

    const state = btoa(JSON.stringify(stateData));

    const request = {
        scope: 'payments accounts openid',
        redirect_uri: config.REDIRECT_URI,
        client_id: config.CLIENT_ID,
        nonce: nonce,
        state: state,
        response_type: 'code',
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
        max_age: 3600,
        authorization_details: authorizationDetails,
    }

    const signedRequest = await JWTSign(request)


    console.log(config.CLIENT_ASSERTION)

    const signedClientAssertion = await CreateClientAssertion()

    console.log(signedClientAssertion)

    const data = {
        'client_id': config.CLIENT_ID,
        'request': signedRequest,
        'client_assertion_type': 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        'client_assertion': signedClientAssertion
    };

    const interactionId = uuidv4()

    console.log('consentId', consentId)
    console.log('interactionId', interactionId)

    const requestConfig = {
        method: 'post',
        maxBodyLength: Infinity,
        url: config.PAR_ENDPOINT,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'x-fapi-interaction-id': interactionId
        },
        data: data,
    };

    console.log(requestConfig)

    try {
        const response = await axiosOF.request(requestConfig);
        const authEndpoint = config.AUTH_ENDPOINT

        const redirectLink = `${authEndpoint}?client_id=${config.CLIENT_ID}&response_type=code&scope=openid&request_uri=${response.data.request_uri}`;
        res.status(response.status).json({ redirect: redirectLink, consent_id: consentId, code_verifier: codeVerifier });

    } catch (error) {
        console.error(error.response?.data || error.message);
        // Send the error response to the client
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});


router.post('/bank-data', async (req, res) => {

    const { data_permissions } = req.body;

    const allowedPermissions = [
        'ReadAccountsBasic',
        'ReadAccountsDetail',
        'ReadBalances',
        'ReadBeneficiariesBasic',
        'ReadBeneficiariesDetail',
        'ReadTransactionsBasic',
        'ReadTransactionsDetail',
        'ReadTransactionsCredits',
        'ReadTransactionsDebits',
        'ReadScheduledPaymentsBasic',
        'ReadScheduledPaymentsDetail',
        'ReadDirectDebits',
        'ReadStandingOrdersBasic',
        'ReadStandingOrdersDetail',
        'ReadConsents',
        'ReadPartyUser',
        'ReadPartyUserIdentity',
        'ReadParty'
    ];

    if (
        !Array.isArray(data_permissions) ||
        data_permissions.length === 0 ||
        !data_permissions.every(permission => allowedPermissions.includes(permission))
    ) {
        return res.status(400).json({
            description: 'Inalid data_permissions'
        });
    }

    const consentId = uuidv4()

    const authorizationDetails = [
        {
            type: 'urn:openfinanceuae:account-access-consent:v1.2',
            consent: {
                ExpirationDateTime: '2025-12-25T00:00:00.000Z',
                // "OnBehalfOf": {
                //     "TradingName": "Ozone",
                //     "LegalName": "Ozone-CBUAE",
                //     "IdentifierType": "Other",
                //     "Identifier": "Identifier"
                // },
                ConsentId: consentId,
                "BaseConsentId": "b265ab23-017e-4d86-98d2-bff578e0de08",
                Permissions: data_permissions,
                //  "TransactionFromDateTime": "2023-10-23T23:00:00.000Z",
                //  "TransactionToDateTime": "2023-12-30T23:00:00.000Z",
                OpenFinanceBilling: {
                    UserType: 'Retail',
                    Purpose: 'AccountAggregation'
                }
            },
            // "subscription": {
            //     "Webhook": {
            //         "Url": "http://localhost:4700/mock-event-receiver",
            //         "IsActive": false
            //     }
            // }
        }
    ]

    console.log(authorizationDetails)

    const nonce = uuidv4()

    const codeVerifier = uuidv4() + uuidv4();

    const hashedCodeVerifier = CryptoJS.SHA256(codeVerifier);
    let codeChallenge = CryptoJS.enc.Base64.stringify(hashedCodeVerifier);


    codeChallenge = codeChallenge.replaceAll('+', '-');
    codeChallenge = codeChallenge.replaceAll('/', '_');
    if (codeChallenge.endsWith('=')) { codeChallenge = codeChallenge.substring(0, codeChallenge.length - 1) }


    const stateData = {
        code_verifier: codeVerifier,
        consent_id: consentId
    };

    const state = btoa(JSON.stringify(stateData));


    const request = {
        scope: 'accounts openid',
        redirect_uri: config.REDIRECT_URI,
        client_id: config.CLIENT_ID,
        nonce: nonce,
        state: state,
        response_type: 'code',
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
        max_age: 3600,
        authorization_details: authorizationDetails,
    }

    const signedRequest = await JWTSign(request)

    const interactionId = uuidv4()
    console.log('consentId', consentId)
    console.log('interactionId', interactionId)

    const signedClientAssertion = await CreateClientAssertion()

    console.log(signedClientAssertion)

    const data = {
        'client_id': config.CLIENT_ID,
        'request': signedRequest,
        'client_assertion_type': 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        'client_assertion': signedClientAssertion
    };


    const requestConfig = {
        method: 'post',
        maxBodyLength: Infinity,
        url: config.PAR_ENDPOINT,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'x-fapi-interaction-id': interactionId
        },
        data: data,
    };

    console.log(requestConfig)

    try {
        const response = await axiosOF.request(requestConfig);
        const authEndpoint = config.AUTH_ENDPOINT

        const redirectLink = `${authEndpoint}?client_id=${config.CLIENT_ID}&response_type=code&scope=openid&request_uri=${response.data.request_uri}`;
        res.status(response.status).json({ redirect: redirectLink, consent_id: consentId, code_verifier: codeVerifier });

    } catch (error) {
        console.error(error.response?.data || error.message);
        // Send the error response to the client
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

export default router;
