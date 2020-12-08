
const express = require('express'); 
const router = express.Router(); //use router instead of app
const session = require('express-session'); 

const {postgresClient, connectPostgreSQL} = require('../db/pg.js'); 

// get connection object
connectPostgreSQL('default');
console.log(postgresClient); 
const db = postgresClient.getConnection.db;
// get SQL formatter
const formatSQL = postgresClient.format;

// session store init
let Store = require('memorystore')(session); 
let MyStore = new Store({checkPeriod: 1000000});

router.use(session({
    store: MyStore, 
    secret: 'shhhhh',
    resave: false,
    saveUninitialized: false,
    name: 'sessionID',
    cookie: {
        maxAge: 60000, 
    }
}));

router.post('/login/', (req, res) => {
    let combo = [req.body.user, req.body.pass];
    //console.log(req.body); 

    db.one(formatSQL('SELECT * FROM users WHERE name = $(user) AND password = $(password)', {
        user: combo[0], 
        password: combo[1]
    }))
    .then(data => {
        console.log('DATA:', data); 
        req.session.loggedIn = true;
        req.session.userName = req.body.user;
        res.send('you logged in');
    })
    .catch(error => {
        console.log('ERROR:', error);
        // req.session.destroy(); 
        res.send('not a valid login');
    })
});

router.get('/secure', (req, res) => {
    // if the session store shows that the user is logged in
    if(req.session.loggedIn) {
        res.send(`Here is your confidential data, ${req.session.userName}`);

        // logging the contents of the entire session store
        MyStore.all((err, session) => {
            console.log(session)
        });
        
    } else {    
        res.send('Permission Denied');
    };
});

module.exports = {
    router,
    startSession
}; 