import { SignJWT, importPKCS8, importJWK, CompactEncrypt } from 'jose';
import axios from 'axios';
import config from '../config.js'
import fs from 'fs'
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const alg = 'PS256';

const keyPath = path.resolve('./api/certificates/client_signing.key');
const privateKeyPem = fs.readFileSync(keyPath, 'utf8'); // ✅ read as string

const privateKey = await importPKCS8(privateKeyPem, alg);



const JWTSign = async (request) => {

    const now = Math.floor(Date.now() / 1000);
    const exp = now + 300;

    const jwt = await new SignJWT(request)
        .setProtectedHeader({ alg, kid: config.SIGNING_KEY_ID })
        .setIssuedAt(now)
        .setNotBefore(now - 10)
        .setExpirationTime(exp)
        .setIssuer(config.CLIENT_ID)
        .setAudience(config.ISSUER)
        .sign(privateKey);

    return jwt;
}

const CreateClientAssertion = async () => {

    const now = Math.floor(Date.now() / 1000);
    const exp = now + 300;

    const jwt = await new SignJWT({})
        .setProtectedHeader({ alg, kid: config.SIGNING_KEY_ID })
        .setIssuedAt(now)
        .setExpirationTime(exp)
        .setJti(uuidv4())
        .setIssuer(config.CLIENT_ID)
        .setSubject(config.CLIENT_ID)
        .setAudience(config.ISSUER)
        .sign(privateKey);

    return jwt;
}


const encryptPII = async (request) => {

    const now = Math.floor(Date.now() / 1000);
    const exp = now + 300;

    const jwt = await new SignJWT(request)
        .setProtectedHeader({ alg, kid: config.SIGNING_KEY_ID })
        .setIssuedAt(now)
        .setExpirationTime(exp)
        .setJti(uuidv4())
        .setIssuer(config.CLIENT_ID)
        .setSubject(config.CLIENT_ID)
        .setAudience(config.ISSUER)
        .sign(privateKey);

    console.log(config.JWKS)

    const response = await axios.get(config.JWKS);
    const jwks = response.data;


    const jwk = jwks.keys.find(key => key.use === 'enc');

    if (!jwk) {
        throw new Error('No encryption key found in JWKS');
    }

    const publicKey = await importJWK(jwk, 'RSA-OAEP-256');

    const encoder = new TextEncoder();
    const jwe = await new CompactEncrypt(encoder.encode(jwt))
        .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM', kid: jwk.kid })
        .encrypt(publicKey);

    console.log("Encrypted JWT (JWE):", jwe);

    return jwe;

};


export { JWTSign, CreateClientAssertion, encryptPII };