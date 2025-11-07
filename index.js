require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require('firebase-admin');
const serviceAccount = require('./deal-craft-firebase-admin-key.json');
const jwt = require('jsonwebtoken');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// firebase verify token
const verifyFirebaseToken = async (req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  const token = req.headers.authorization.split(' ')[1];
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' });
  }

  // verify token
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.token_email = decoded.email;
    // console.log('after token validation : ', decoded);
    next();
  } catch {
    // console.log('invalid token');
    return res.status(401).send({ message: 'unauthorized access' });
  }
};

// jwt verify token
const verifyJWTToken = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  const token = req.headers.authorization.split(' ')[1];
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' });
  }

  // verify token
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'unauthorized access' });
    }
    console.log('after decoded : ', decoded);
    req.token_email = decoded.email;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.h3kzrwg.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get('/', (req, res) => {
  res.send('DealCraft server is running...');
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const database = client.db('deal_craft_db');
    const usersCollection = database.collection('users');
    const productsCollection = database.collection('products');
    const bidsCollection = database.collection('bids');

    // JWT related APIs
    app.post('/getToken', (req, res) => {
      const loggedUser = req.body;
      const token = jwt.sign(loggedUser, process.env.JWT_SECRET, {
        expiresIn: '1h',
      });
      res.send({ token: token });
    });

    // Users Collection APIs

    // single user create with condition
    app.post('/users', async (req, res) => {
      const newUser = req.body;
      const email = req.body.email;
      const query = { email: email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        res.send({
          message: "User already exist, don't need to insert again.",
        });
      } else {
        const result = await usersCollection.insertOne(newUser);
        res.send(result);
      }
    });

    // single user delete
    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });

    // Products Collection APIs

    // all products get & specific user's products(by email)
    app.get('/products', async (req, res) => {
      // console.log(req.query)
      const email = req.query.email;
      const query = {};
      if (email) {
        query.email = email;
      }
      const cursor = productsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    // recent product get (6)
    app.get('/products/recent', async (req, res) => {
      const sortFields = { created_at: -1 };
      const limitNum = 6;
      const projectFields = {
        title: 1,
        price_min: 1,
        price_max: 1,
        category: 1,
        image: 1,
        description: 1,
      };
      const cursor = productsCollection
        .find()
        .sort(sortFields)
        .limit(limitNum)
        .project(projectFields);
      const result = await cursor.toArray();
      res.send(result);
    });

    // specific product get
    app.get('/products/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productsCollection.findOne(query);
      res.send(result);
    });

    // new single product create
    app.post('/products', async (req, res) => {
      const newProduct = req.body;
      const result = await productsCollection.insertOne(newProduct);
      res.send(result);
    });

    // single product update/patch
    app.patch('/products/:id', async (req, res) => {
      const id = req.params.id;
      const updatedProduct = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: {
          name: updatedProduct.name,
          price: updatedProduct.price,
        },
      };
      const result = await productsCollection.updateOne(query, update);
      res.send(result);
    });

    // single product delete
    app.delete('/products/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productsCollection.deleteOne(query);
      res.send(result);
    });

    // Bids Collection APIs

    // all bids get & specific user's bids(by email) with firebase token verify
    // app.get('/bids', verifyFirebaseToken, async (req, res) => {
    //   // console.log('headers : ', req);
    //   const email = req.query.email;
    //   const query = {};
    //   if (email) {
    // verify user have access to see this data
    //     if (email !== req.token_email) {
    //       return res.status(403).send({ message: 'forbidden access' });
    //     }
    //     query.buyer_email = email;
    //   }
    //   const cursor = bidsCollection.find(query);
    //   const result = await cursor.toArray();
    //   res.send(result);
    // });

    // all bids get & specific user's bids(by email) with jwt token verify
    app.get('/bids', verifyJWTToken, async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        // verify user have access to see this data
        if (email !== req.token_email) {
          return res.status(403).send({ message: 'forbidden access' });
        }
        query.buyer_email = email;
      }
      const cursor = bidsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    // bids by product
    app.get('/products/bids/:id', verifyFirebaseToken, async (req, res) => {
      const sortFields = { bid_price: -1 };
      const id = req.params.id;
      const query = { product: id };
      const cursor = bidsCollection.find(query).sort(sortFields);
      const result = await cursor.toArray();
      res.send(result);
    });

    // specific bid get
    app.get('/bids/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bidsCollection.findOne(query);
      res.send(result);
    });

    // new single bid create
    app.post('/bids', async (req, res) => {
      const newBid = req.body;
      const result = await bidsCollection.insertOne(newBid);
      res.send(result);
    });

    // single bid delete
    app.delete('/bids/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bidsCollection.deleteOne(query);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`DealCraft server is listening on port : ${port}`);
});
