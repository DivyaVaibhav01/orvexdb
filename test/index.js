// Basic usage example of the orvexdb

import { OrvexClient } from "orvexdb";

const client = new OrvexClient({
    dbUrl: "http://api.orvex.tech/v1",
    token: "sk_live_31...."
});

await client.set("newData", {
    name: "Divya Vaibhav",
    age: 19,
    from: "India"
});
console.log(await client.get("newData"));