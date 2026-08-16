import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
const pk = generatePrivateKey();
const acct = privateKeyToAccount(pk);
console.log(JSON.stringify({ address: acct.address, privateKey: pk }));
