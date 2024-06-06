const express = require('express');
const app = express();
const port = process.env.PORT || 2000;
const jwt = require('jsonwebtoken');
require('dotenv').config();
const cors = require('cors');

app.use(cors());
app.use(express.json());


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri =`mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lzevybe.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;



// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
   
    const userCollection = client.db("workScoutDB").collection("users");
    const taskCollection = client.db("workScoutDB").collection("alltasks");
    const submissionCollection = client.db("workScoutDB").collection("submission");
    const approvedCollection = client.db("workScoutDB").collection("approved");
    const subscribersCollection = client.db("workScoutDB").collection('subscribers');

    // jwt
    app.post('/jwt',(req,res) => {
      const user = req.body;
      const token = jwt.sign(user,process.env.ACCESS_TOKEN_SECRET,{expiresIn : '1h'})
      res.send({token});
    })

    // verify token
    const verifyToken = async(req,res,next) => {
      if(!req.headers.authorization){
        return res.status(401).send({message : 'Unathorized Access'})
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token,process.env.ACCESS_TOKEN_SECRET,(err,decoded) => {
        if(err){
          return res.status(400).send({message : 'Bad Request'})
        }
        req.user = decoded;
        next();
      })
    }

    // user
    app.post('/users', async(req,res) => {
      const email = req.body.email;
      const query = {email : email};
      const user = req.body;
      const find = await userCollection.findOne(query);
      if(find){
          return res.send({message : 'already exist'})
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    })

    app.get('/users',verifyToken,async(req,res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    })
    app.get('/users/:email',async(req,res) => {
      const email = req.params.email;
      const query = {email : email};
      const result = await userCollection.findOne(query);
      res.send(result);
    })

    app.patch('/users',verifyToken,async(req,res) => {
        const role = req.body.role;
        const filter = {email : req.body.worker_email};
        const update = {
          $set : {
            role : role
          }
        }
        const result = await userCollection.updateOne(filter,update);
        res.send(result);
    })

    // tasks
    app.post('/alltasks',verifyToken,async(req,res) => {
      const task = req.body;
      const email = req.body.email;
      const query = {email : email};
      const amount = req.body.payable_amount;
      const quantity = req.body.task_quantity;
      const total = amount * quantity;
      const dec = {$inc : {coins : -total}}
      await userCollection.updateOne(query,dec);
      const result = await taskCollection.insertOne(task);
      res.send(result);
    })

    app.get('/alltasks',verifyToken, async(req,res) => {
      const email = req.query.email;
      let query = {};
      if(email){
        query = {creator_email : email};
      }

      const result = await taskCollection.find(query).toArray();
      res.send(result);
    })

    app.get('/alltasks/:id',async(req,res) => {
      const id = req.params.id;
      const filter = {_id : new ObjectId(id)};
      const result = await taskCollection.findOne(filter);
      res.send(result);
    })

    app.patch('/alltasks/:id',verifyToken,async(req,res) => {
      const id = req.params.id;
      const filter = {_id : new ObjectId(id)};
      const info = req.body;
      const options = { upsert: true };
      const update = {
        $set : {
          title : info.title,
          details : info.details
        }
      }
      const result = await taskCollection.updateOne(filter,update,options);
      res.send(result);
    })

    app.delete('/alltasks/:id',verifyToken,async(req,res) => {
        const id = req.params.id;
        const query = {_id : new ObjectId(id)};
        const found = await taskCollection.findOne(query);
        const filter = { email: found.creator_email};
        const total = found.task_quantity * found.payable_amount;
        const updateDoc = {
          $inc : {coins : total}
        }
        await userCollection.updateOne(filter,updateDoc);
        const result = await taskCollection.deleteOne(query);
        res.send(result);
    })

    // submissions
    app.post('/submissions',verifyToken, async(req,res) => {
      const info = req.body;
      const filter = {
        _id : new ObjectId(req.body.task_id),
      }
      const  update = {
        $inc : {task_quantity : -1}
      }
      await taskCollection.updateOne(filter,update)
      const result = await submissionCollection.insertOne(info);
      res.send(result);
    })

    app.get('/submissions',verifyToken,async(req,res) => {
      const email = req.query.email;
      const query = {
        worker_email : email,
        status : 'approved'
      }
      const result = await submissionCollection.find(query).toArray();
      res.send(result);
    })
    app.get('/submission/:email',verifyToken,async(req,res) => {
      const email = req.params.email;
      const query = {creator_email : email};
      const result = await submissionCollection.find(query).toArray();
      res.send(result);
    })
    app.get('/submissions/:email',verifyToken,async(req,res) => {
      const email = req.params.email;
      const query = {
        worker_email : email,
      }
      const result = await submissionCollection.find(query).toArray();
      res.send(result);
    })

    app.patch('/submissions/:id',verifyToken, async(req,res) => {
      const id = req.params.id;
      const action = req.body.approve;
      const workerEmail = req.body.worker_email;
      const filter = {_id : new ObjectId(id)};
      const update = {
        $set : {
          status : action
        }
      }
      const options = {upsert : true};
      if(action === 'approved'){
        const query = {email : workerEmail};
        const inc = {
          $inc : {coins : req.body.payable_amount,task_completion : 1}
        }
        await userCollection.updateOne(query,inc);

      }
      const result = await submissionCollection.updateOne(filter,update,options);
      res.send(result);
    })


    // approved tasks
    app.post('/approved',verifyToken, async(req,res) => {
      const completed = req.body;
      const approved = await approvedCollection.insertOne(completed);
      res.send(approved); 
    })

    app.get('/approved',verifyToken,async(req,res) => {
        const email = req.query.email;
        let query = {};
        if(email){
          query = {worker_email : email}
        }
        const result = await approvedCollection.find(query).toArray(); 
        res.send(result);
    })

    // top-earner 
    app.get('/top-earners',async(req,res) => {
      const result = await userCollection.aggregate([
        {$sort : {coins : -1}}
      ]).toArray();
      res.send(result)
    })

    // all-coins
    app.get('/total-coins',async(req,res) => {
      const totalCoins = await userCollection.aggregate([
        {
          $group : {
            _id : null,
            total_coins : {$sum : '$coins'}
          }
        }
      ]).toArray();
      res.send(totalCoins);
    })
    
    // subscribers
    app.post('/subscribers',async(req,res) => {
      const email = req.body;
      const result = await subscribersCollection.insertOne(email);
      res.send(result);
    })
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/',async(req,res) => {
    res.send('server is running');
})

app.listen(port,() => {
    console.log("server is running on",port);
})