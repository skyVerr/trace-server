const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const mysql = require('mysql');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
app.use(cors());
app.use(bodyParser.json());

const secretKey = "traceme";

console.clear();

//Create Connection
const conn = mysql.createConnection({
    host     : 'localhost',
    user     : 'root',
    password : '',
    database : 'db_trace'
  });

//Connect to database
conn.connect();

app.post('/sign-up', (req,res)=>{

    console.log(req.body);

    let hash = bcrypt.hashSync(req.body.user.password, 10);

    let sql = ` INSERT INTO user SET
    firstname = '${req.body.user.firstname}',
    lastname = '${req.body.user.lastname}',
    middlename = '${req.body.user.firstname}',
    password = '${hash}',
    email = '${req.body.user.email}'`;

    conn.query(sql, (err,result)=> {
        if(err) throw err;
        res.setHeader('Content-type','Application/json');
        let user = {
            user_id : result.insertId,
            email: req.body.email,
            firstname: req.body.user.firstname,
            lastname: req.body.user.lastname,
            middlename: req.body.user.middlename,
            isPremium: false
        };
        const token = jwt.sign({user},secretKey);
        res.json({token});
    });
    
});

function verifyToken(req,res,next){
    res.setHeader('Content-type','Application/json');
    const bearerHeader = req.headers['authorization'];
    if(bearerHeader !== 'undefined'){
        const bearerToken = bearerHeader.split(' ')[1];
        jwt.verify(bearerToken,secretKey , (err,result) =>{
            if(err){
                res.status(403).json({message: err.message});
            } else {
                req.token = result;
                next();
            }
        });
    } else {
        res.status(403).json({message: "Token missing from header"});
    }
}

app.post('/login',(req,res)=>{
    res.setHeader('Content-type','Application/json');
    let sql = `SELECT * FROM user WHERE email = '${req.body.email}'`;
    conn.query(sql, (err,result)=>{
        if (err) throw err;
        if(result.length == 1){
            if(bcrypt.compareSync(req.body.password, result[0].password)){
                let user = {
                    user_id : result[0].insertId,
                    email: result[0].email,
                    firstname: result[0].firstname,
                    lastname: result[0].lastname,
                    middlename: result[0].middlename,
                    isPremium: result[0].isPremium
                };
                const token = jwt.sign({user},secretKey);
                res.json({token});
            } else {
                res.status(400).json({message: "Invalid username/password"});
            }
        } else {
            res.status(400).json({message:"Invalid username/password"});
        }
    });
});


var server = app.listen(8080, ()=>{
    console.log("server started on port 8080");
});