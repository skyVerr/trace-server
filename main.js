const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const mysql = require('mysql');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const secretKey = "traceme";
const cors = require('cors');

app.use(bodyParser.json());
app.use(cors({credentials: true}));

// Users online
users = [];

//Create server using express
var server = app.listen(8080, ()=>{
    console.log("server started on port 8080");
});

//Create instance of socket.io on same port of express server
var io = require('socket.io').listen(server);

io.on('connection',(socket)=>{

    socket.on('setId', id => {
        users[id] = socket.id;
        socket.user_id = id;
        console.log(`user[${id}] is set to ${socket.id}`);
    });

    socket.on('disconnect', ()=>{
        console.log('socket '+socket.user_id+' disconnected');
        delete users[socket.user_id] ;
    });

    socket.on('join',data => {
        socket.join(data.traceId);
        console.log('user joined trace id = '+data.traceId);
        socket.broadcast.to(data.traceId).emit('user join',data.user);
    });

    socket.on('location', data=> {
        io.in(data.traceId).emit('receive location',data);
        console.log('receive location from '+data.user.user_id+'having location=',data.location);
        console.log(data);
    });

});

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

    let hash = bcrypt.hashSync(req.body.user.password, 10);

    let sql = ` INSERT INTO user SET
    firstname = '${req.body.user.firstname}',
    lastname = '${req.body.user.lastname}',
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
                    user_id : result[0].user_id,
                    email: result[0].email,
                    firstname: result[0].firstname,
                    lastname: result[0].lastname,
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

app.post('/contacts',verifyToken,(req,res)=>{

    let sql = `SELECT user_id FROM user WHERE email = ?`;
    
    conn.query(sql, [req.body.email], (err,result) => {
        if (err) throw err;
        if(result.length == 1){

            const notification = [result[0].user_id,1,req.token.user.user_id];

            sql = "INSERT INTO user_notification(user_id,notification_type_id,from_user_id) VALUES (?) ";
            
            let query = conn.query(sql, [notification], (err,result2)=>{
                if(err) throw err;

                    io.to(users[result[0].user_id])
                    .emit('new notification',{notification: "someone wants to add you"});

                res.json({message: 'Request successful'});
            });

        } else {
            res.status(422).json({message: 'email not recognized'});
        }
    });

});


app.get('/contacts',verifyToken,(req,res)=>{
    let sql = "SELECT * FROM contacts WHERE user_id = ?";

    conn.query(sql, [req.token.user.user_id], (err,result)=>{
        if(err) throw err;
        res.json(result);
    });
});

app.delete('/contacts',verifyToken,(req,res)=>{
    console.log(req.body);
    let sql = "DELETE FROM contacts WHERE contact_id = ?";
    conn.query(sql, [req.body.contact_id], (err,result)=>{
        if(err) throw err;
        res.json({message: "delete success"});
    });
});

app.get('/notification',verifyToken,(req,res)=>{
    let sql = "SELECT * FROM user_notification WHERE user_id = ?";

    conn.query(sql, [req.token.user.user_id], (err,result)=>{
        if(err) throw err;
        res.json(result);
    });
});

app.post('/notification',verifyToken,(req,res)=>{
    let sql = "INSERT INTO user_notification SET ? ";
    conn.query(sql, [req.body], (err,result)=>{
        if(err) throw err;
        io.to(users[req.body.user_id])
            .emit('new notification',{notification:`Someone wants to trace you`});
        res.json({message: "Notification sent"});
    });
});

app.post('/notification/decline',verifyToken,(req,res)=>{
    let sql = "DELETE FROM user_notification WHERE user_notification_id = ? ";
    conn.query(sql, [req.body.user_notification_id], (err,result)=>{
        if(err) throw err;
        res.json("Decline success");
    });   
});


app.post('/notification/confirm',verifyToken,(req,res)=>{

    if(req.body.notification.notification_type_id == 1){
        if(req.body.notification.isConfirm == true){
    
            let insert = [[req.body.notification.from_user_id],[req.body.notification.user_id]];
            let sql = "INSERT INTO contacts(user_id,friend_id) VALUES (?)";
    
            conn.query(sql,[insert],(err,result)=>{
                if(err) console.log(err);
                io.to(users[req.body.user_id])
                    .emit('new notification',{notification:`Your request has been accepted`});
                deleteNotificaton(req,res);
            });
        }
    } 

    if(req.body.notification.notification_type_id == 2){
        deleteNotificaton(req,res);
    }
    
});

function deleteNotificaton(req,res){

    let sql = "DELETE FROM user_notification WHERE user_notification_id =  "+req.body.notification.user_notification_id;  

    let ha = conn.query(sql ,(err,result)=>{
        if(err) throw err;
        res.json({message: 'notification confirm'});
    });

}

app.get('/user/:id',verifyToken,(req,res)=>{
    let sql = "SELECT user_id,email,firstname,lastname FROM user WHERE user_id = ?";

    conn.query(sql,[req.params.id],(err,result)=>{
        if(err) throw err;
        res.json(result[0]);
    });
});

app.get('/notification-type/:id',verifyToken,(req,res)=>{
    let sql = "SELECT * FROM notification_type WHERE notification_type_id = ?";

    conn.query(sql,[req.params.id],(err,result)=>{
        if(err) throw err;
        res.json(result[0]);
    });
});

app.post('/group',verifyToken, (req,res)=>{
    let sql = "INSERT INTO trace_group(name) VALUES (?)";
    conn.query(sql,[req.body.name],(err,result)=>{
        if(err) throw err;
        sql = "INSERT INTO user_group(user_id,group_id,isAdmin) VALUES (?)"
        let insert = [req.token.user.user_id,result.insertId,1];
        conn.query(sql,[insert],(err,result2)=>{
            if(err) throw err;
            res.json({
                group_id: result.insertId,
                name: req.body.name
            });
        });
    })
});

app.get('/group',verifyToken, (req,res)=>{
    let sql = `SELECT trace_group.group_id ,trace_group.name 
    FROM user_group 
    INNER JOIN trace_group ON trace_group.group_id = user_group.group_id 
    WHERE user_group.user_id = ?`;
    conn.query(sql,[req.token.user.user_id], (err,result)=>{
        if(err) throw err;
        res.json(result);
    });
});
