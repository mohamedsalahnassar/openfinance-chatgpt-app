import { axiosOF } from '../utils.js';
import { Router } from 'express';
import config from '../config.js'
import { JWTSign, CreateClientAssertion, encryptPII } from '../services/JWTCreator.js'
import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';
import { logInfo, logError, logDebug, summarizePayload } from '../logger.js';

const router = Router();


router.post('/single-payment', async (req, res) => {

    const { payment_amount, bank_label } = req.body;
    const bankLabel = bank_label || 'unspecified';

    if (
        typeof payment_amount !== 'string' ||
        payment_amount.trim() === '' ||
        !/^(?:0|[1-9]\d*)(\.\d{2})$/.test(payment_amount) ||
        parseFloat(payment_amount) <= 0
    ) {
        return res.status(400).json({ error: 'Invalid payment_amount' });
    }

    logInfo('[consent-create] Single instant payment consent requested', {
        payment_amount,
        bank: bankLabel,
    });

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

    const now = new Date();
    const expirationConsent = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1, // Tomorrow
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

    logInfo('[consent-create] Prepared single payment consent payload', {
        consentId,
        expirationConsent,
        payment_amount,
        piiCipherLength: encryptedPII.length,
        bank: bankLabel,
    });

    logDebug('[consent-create] PKCE material ready', {
        consentId,
        codeVerifierPreview: `${codeVerifier.slice(0, 6)}…`,
    });

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


    const signedClientAssertion = await CreateClientAssertion()

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

    logInfo('[consent-create] Sending single payment PAR request', {
        consentId,
        endpoint: config.PAR_ENDPOINT,
        bank: bankLabel,
    });

    try {
        const response = await axiosOF.request(requestConfig);
        const authEndpoint = config.AUTH_ENDPOINT

        const redirectLink = `${authEndpoint}?client_id=${config.CLIENT_ID}&response_type=code&scope=openid&request_uri=${response.data.request_uri}`;
        logInfo('[consent-create] Single payment consent ready', {
            consentId,
            redirect: redirectLink,
            bank: bankLabel,
        });
        res.status(response.status).json({ redirect: redirectLink, consent_id: consentId, code_verifier: codeVerifier });

    } catch (error) {
        logError('[consent-create] Single payment consent failed', {
            consentId,
            status: error.response?.status,
            data: summarizePayload(error.response?.data),
            message: error.message,
            bank: bankLabel,
        });
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

router.post('/variable-on-demand-payments', async (req, res) => {

    const { max_payment_amount, bank_label } = req.body;
    const bankLabel = bank_label || 'unspecified';

    if (
        typeof max_payment_amount !== 'string' ||
        max_payment_amount.trim() === '' ||
        !/^(?:0|[1-9]\d*)(\.\d{2})$/.test(max_payment_amount) ||
        parseFloat(max_payment_amount) <= 0
    ) {
        return res.status(400).json({ error: 'Invalid max_payment_amount' });
    }

    logInfo('[consent-create] VRP consent requested', {
        max_payment_amount,
        bank: bankLabel,
    });

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


    const signedClientAssertion = await CreateClientAssertion()

    const data = {
        'client_id': config.CLIENT_ID,
        'request': signedRequest,
        'client_assertion_type': 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        'client_assertion': signedClientAssertion
    };

    const interactionId = uuidv4()

    logInfo('[consent-create] VRP consent payload prepared', {
        consentId,
        interactionId,
        max_payment_amount,
        periodStart,
        bank: bankLabel,
    });
    logDebug('[consent-create] VRP PKCE ready', {
        consentId,
        codeVerifierPreview: `${codeVerifier.slice(0, 6)}…`,
    });

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

    logInfo('[consent-create] Sending VRP PAR request', {
        consentId,
        endpoint: config.PAR_ENDPOINT,
        interactionId,
        bank: bankLabel,
    });

    try {
        const response = await axiosOF.request(requestConfig);
        const authEndpoint = config.AUTH_ENDPOINT

        const redirectLink = `${authEndpoint}?client_id=${config.CLIENT_ID}&response_type=code&scope=openid&request_uri=${response.data.request_uri}`;
        logInfo('[consent-create] VRP consent ready', {
            consentId,
            redirect: redirectLink,
            bank: bankLabel,
        });
        res.status(response.status).json({ redirect: redirectLink, consent_id: consentId, code_verifier: codeVerifier });

    } catch (error) {
        logError('[consent-create] VRP consent failed', {
            consentId,
            interactionId,
            status: error.response?.status,
            data: summarizePayload(error.response?.data),
            message: error.message,
            bank: bankLabel,
        });
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});


router.post('/bank-data', async (req, res) => {

    const { data_permissions, valid_from, valid_until, bank_label } = req.body;
    const bankLabel = bank_label || 'unspecified';

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
            description: 'Invalid data_permissions'
        });
    }

    const parseIsoOrUndefined = (value) => {
        if (!value) {
            return undefined;
        }
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            return null;
        }
        return parsed.toISOString();
    };

    const parsedValidFrom = parseIsoOrUndefined(valid_from);
    const parsedValidUntil = parseIsoOrUndefined(valid_until);

    if (parsedValidFrom === null || parsedValidUntil === null) {
        return res.status(400).json({
            description: 'valid_from and valid_until must be valid ISO date strings',
        });
    }

    if (parsedValidFrom && parsedValidUntil && parsedValidFrom >= parsedValidUntil) {
        return res.status(400).json({
            description: 'valid_until must be later than valid_from',
        });
    }

    logInfo('[consent-create] Data sharing consent requested', {
        permissions: data_permissions,
        valid_from,
        valid_until,
        bank: bankLabel,
    });

    const consentId = uuidv4()

    const authorizationDetails = [
        {
            type: 'urn:openfinanceuae:account-access-consent:v1.2',
            consent: {
                ExpirationDateTime: parsedValidUntil ?? '2025-12-25T00:00:00.000Z',
                // "OnBehalfOf": {
                //     "TradingName": "Ozone",
                //     "LegalName": "Ozone-CBUAE",
                //     "IdentifierType": "Other",
                //     "Identifier": "Identifier"
                // },
                ConsentId: consentId,
                "BaseConsentId": "b265ab23-017e-4d86-98d2-bff578e0de08",
                Permissions: data_permissions,
                ...(parsedValidFrom && { TransactionFromDateTime: parsedValidFrom }),
                ...(parsedValidUntil && { TransactionToDateTime: parsedValidUntil }),
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

    logInfo('[consent-create] Data sharing consent payload prepared', {
        consentId,
        permissions: data_permissions.length,
        validFrom: parsedValidFrom,
        validUntil: parsedValidUntil,
        bank: bankLabel,
    });

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
    logDebug('[consent-create] Data consent PKCE ready', {
        consentId,
        interactionId,
        codeVerifierPreview: `${codeVerifier.slice(0, 6)}…`,
    });

    const signedClientAssertion = await CreateClientAssertion()

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

    logInfo('[consent-create] Sending data consent PAR request', {
        consentId,
        interactionId,
        endpoint: config.PAR_ENDPOINT,
        bank: bankLabel,
    });

    try {
        const response = await axiosOF.request(requestConfig);
        const authEndpoint = config.AUTH_ENDPOINT

        const redirectLink = `${authEndpoint}?client_id=${config.CLIENT_ID}&response_type=code&scope=openid&request_uri=${response.data.request_uri}`;
        logInfo('[consent-create] Data sharing consent ready', {
            consentId,
            redirect: redirectLink,
            bank: bankLabel,
        });
        res.status(response.status).json({ redirect: redirectLink, consent_id: consentId, code_verifier: codeVerifier });

    } catch (error) {
        logError('[consent-create] Data sharing consent failed', {
            consentId,
            interactionId,
            status: error.response?.status,
            data: summarizePayload(error.response?.data),
            message: error.message,
            bank: bankLabel,
        });
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

export default router;
