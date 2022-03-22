const express = require('express');
const app = express();
const cors = require('cors');
const admin = require("firebase-admin");
require('dotenv').config();
const { MongoClient } = require('mongodb');
const ObjectId = require('mongodb').ObjectId;
const stripe = require("stripe")(process.env.STRIPE_ACCOUNT);
// const serviceAccount = require('./service.JSON')
// console.log(service)
const port = process.env.PORT || 5000;

// console.log(serviceAccount)
// const serviceAccount = JSON.parse(require("./service.json"));
const serviceAccount = require('./service.json')

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});


app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.n5vc4.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

// For admin

async function verifyToken(req, res, next) {
    if (req.headers?.authorization?.startsWith('Bearer ')) {
        const token = req.headers.authorization.split(' ')[1];
    }
    try {
        const decodedUser = await admin.auth().verifyIdToken(token);
        req.decodedEmail = decodedUser.email;
    }
    catch {

    }
    next();
};



async function run() {
    try {
        await client.connect();

        const database = client.db('doctors_portals')
        const appointmentCollection = database.collection('appointments');
        const usersCollection = database.collection('users');

        // Get means find the data from client site
        app.get('/appointments', verifyToken, async (req, res) => {
            const email = req.query.email;
            const date = req.query.date;
            const query = { email: email, date: date };
            const cursor = appointmentCollection.find(query);
            const appointments = await cursor.toArray();
            res.json(appointments);
        })

        // /For stripe payment
        app.get('/appointments/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await appointmentCollection.findOne(query);
            res.json(result);
        })

        // Post means storing data in the server site
        app.post('/appointments', async (req, res) => {
            const appointment = req.body;
            const result = await appointmentCollection.insertOne(appointment);
            res.json(result);
        })

        // for stripe confirmation update

        app.put('/appointments/:id', async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updateDoc = {
                $set: {
                    payment: payment
                }
            };
            const result = await appointmentCollection.updateOne(filter, updateDoc);
            res.json(result);
        })


        // Get is used make Admin or Not have make admin
        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            let isAdmin = false;
            if (user?.role === 'admin') {
                isAdmin = true
            }
            res.json({ admin: isAdmin });
        })

        // Post means storing data in the server site
        app.post('/users', async (req, res) => {
            const user = req.body;
            console.log('put', user);
            const result = await usersCollection.insertOne(user);
            res.json(result);

        })

        // Put means save the old user and get the new user anew.
        app.put('/users', async (req, res) => {
            const user = req.body;
            const filter = { email: user.email };
            const options = { upsert: true };
            const updateDoc = { $set: user };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.json(result);

        })


        // Role admin where Put has to be used

        app.put('/users/admin', verifyToken, async (req, res) => {
            const user = req.body;
            const requester = req.decodedEmail;
            if (requester) {
                const requesterAccount = await usersCollection.findOne({ email: requester })
                if (requesterAccount.role === 'admin') {
                    const filter = { email: user.email };
                    const updateDoc = { $set: { role: 'admin' } };
                    const result = await usersCollection.updateOne(filter, updateDoc);
                    res.json(result);
                    console.log(result);
                }
            }
            else {
                res.status(403).json({ message: 'You do not access to make admin' })
            }

        })

        // For stripe
        app.post("/create-payment-intent", async (req, res) => {
            const paymentInfo = req.body;
            const amount = paymentInfo.price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                payment_method_types: ['card']
            });
            res.json({ clientSecret: paymentIntent.client_secret });
        });
    }
    finally {
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(port, () => {
    console.log(`listening at ${port}`)
});