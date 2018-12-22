const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const mysql = require('mysql');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const secretKey = "traceme";
const cors = require('cors');
const formidable = require('formidable');
var uniqid = require('uniqid');
var Jimp = require('jimp');
var fs = require('fs');
var path = require('path');
var https = require('https');

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

    socket.emit('getId',null);

    socket.on('setId', id => {
        users[id] = socket.id;
        socket.user_id = id;
        console.log(`user[${id}] is set to ${socket.id}`);
    });

    socket.on('disconnect', ()=>{
        if(socket.user_id !== 'undefined'){
            console.log('socket '+socket.user_id+' disconnected');
            delete users[socket.user_id] ;
        }
    });

    socket.on('join',data => {
        socket.join(data.traceId);
        console.log('user joined trace id = '+data.traceId);
        socket.broadcast.to(data.traceId).emit('user join',data.user);
    });

    socket.on('leave', data=>{
        socket.leave(data.traceId);
        console.log('user left trace id = '+data.traceId);
        socket.broadcast.to(data.traceId).emit('user left',data.user);
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

function uploadPhoto(req,res,next){
    var form = new formidable.IncomingForm();
    var profilePath;

    form.parse(req, (err,fields,files)=>{
        req.body = fields;
    });

    form.on('fileBegin', function (name, file){
        let newImageName = uniqid()+'.'+ file.name.split('.').pop();
        profilePath = __dirname + '/images/' + newImageName;
        file.path = profilePath;
        profilePath = 'http://localhost:8080/images/' + newImageName;
    });

    form.on('file', function (name, file){
        req.body.profile_picture = profilePath;
        console.log('Uploaded ' + file.name);
    });

    form.on('end', () => {
        req.body.profile_picture = profilePath;
        next();
    });

}

app.post('/sign-up',uploadPhoto, (req,res) => {


    let hash = bcrypt.hashSync(req.body.password, 10);

    let sql = ` INSERT INTO user SET
    firstname = '${req.body.firstname}',
    lastname = '${req.body.lastname}',
    password = '${hash}',
    email = '${req.body.email}'`;

    if(!!req.body.profile_picture) {
        sql += `, profile_picture ='${req.body.profile_picture}'`;
    }
    
    conn.query(sql, (err,result)=> {
        if(err) throw err;
        let user = {
            user_id : result.insertId,
            email: req.body.email,
            firstname: req.body.firstname,
            lastname: req.body.lastname,
            isPremium: false
        };
        if(!!req.body.profile_picture) {
            user.profile_picture = req.body.profile_picture;
        } else {
            user.profile_picture = 'http://localhost:8080/images/default.png';
        }
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
                    isPremium: result[0].isPremium,
                    profile_picture: result[0].profile_picture
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
    let sql = "SELECT user_id,email,firstname,lastname,profile_picture FROM user WHERE user_id = ?";

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

app.get('/group/:id',verifyToken, (req,res)=>{
    let group_id = req.params.id;
    let sql = `SELECT * FROM trace_group WHERE group_id = ? `;
    conn.query(sql,[group_id], (err,result)=>{
        if(err) throw err;
        res.json(result[0]);
    });
});

app.get('/group/user/:id',verifyToken,(req,res)=>{
    let group_id = req.params.id;
    let sql = `SELECT user.user_id, user.firstname, user.lastname, user.profile_picture FROM user_group 
    LEFT JOIN user ON user.user_id = user_group.user_id 
    WHERE group_id = ? `;
    conn.query(sql,group_id,(err,result)=>{
        if(err) throw err;
        res.json(result);
    });
});

app.post('/group/user/',verifyToken,(req,res)=>{
    
});

app.delete('/group',verifyToken, (req,res)=>{
    let sql = `DELETE FROM trace_group WHERE group_id = ?`;
    conn.query(sql, [req.body.group_id] , (err,result)=>{
        res.json({message: 'Group deleted'});
    });
});

app.patch('/group',verifyToken, (req,res)=>{
    let sql = `UPDATE trace_group SET ? WHERE ?`;
    conn.query(sql, [req.body , {group_id: req.body.group_id}] , (err,result)=>{
        res.json({message: 'Group updated'});
    });
});

app.get('/merge-photo',(req,res)=>{
    //CALLBACK HELL!
    Jimp.read('./images/marker.png')
    .then(image => {

        Jimp.read(req.query.image).then(image2=>{
            image2 = image2.resize(30,30);
            image.composite(image2,13,10).getBase64(Jimp.AUTO,(err,result)=>{
                if(err) throw err;
                // res.set('Content-Type', 'text/html');
                // res.write('<html><body><img src="')
                // res.write(result);
                // res.end('"/></body></html>');
                res.json({result});
            });
        });

    })
    .catch(err => {
        // Handle an exception.
    });
});

//serve images
app.use('/images',express.static('images'));
