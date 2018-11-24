var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var mysql = require('mysql');
app.use(bodyParser.json());


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
    res.setHeader('Content-type','application/json');
    res.json(req.body);
});


var server = app.listen(8080, ()=>{
    console.log("server started on port 8080");
});