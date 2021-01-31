const express = require('express')
const http = require('http')
const socketIO = require('socket.io')
const path = require('path')

const app = express()
const server = http.createServer(app)
const io = socketIO(server)

// const {Chess} = require('../node_modules/chess.js/chess')

const publicPath = path.join(__dirname, '/../public')
const staticPath = path.join(__dirname, '/../static')

app.use(express.static(publicPath))
app.use('/static', express.static(staticPath))

// Starts the server
// Change port as needed
const port = process.env.PORT || 3333;
server.listen(port, function () {
    console.log('Server started on port ' + port)
})

let games = Array(100).fill({numPlayers: 0, playerIds: []});

// Does something when a client connects
io.on('connection', (socket) => {

    // CZ: Update to input roomId, dictionary socket.id to username
    let playerId = Math.floor((Math.random() * 100) + 1);
    let tempRoomId = 1;
    socket.join(tempRoomId);
    numPlayers = io.sockets.adapter.rooms.get(tempRoomId).size;
    if (numPlayers <= 2) {
        console.log('player ' + playerId + ' connected to Room ' + tempRoomId);
        // the first player to join the room gets white
        let color;
        if (numPlayers === 2) color = 'black';
        else color = 'white';

        socket.emit('player', {
            playerId,
            numPlayers,
            color,
            tempRoomId
        })
    }
    else {
        socket.emit('full', tempRoomId);
        // CZ: Uncomment after wrapping in socket.on input
        // return;
    }






    let joinedRoomId = null;

    socket.on('joined', (roomId) => {
        // if the room is not full then add the player to that room
        if (games[roomId].numPlayers < 2) {
            games[roomId].numPlayers++;
            games[roomId].playerIds.push(playerId);
            joinedRoomId = roomId;
        } // else emit the full event
        else {
            socket.emit('full', roomId);
            return;
        }
        console.log('Room ' + roomId);
        console.log(games[roomId]);
        let numPlayers = games[roomId].numPlayers;
        // the first player to join the room gets white
        if (numPlayers % 2 === 0) color = 'black';
        else color = 'white';

        socket.emit('player', {
            playerId,
            numPlayers,
            color,
            roomId
        })
    })

    // The client side emits a 'move' event when a valid move has been made.
    socket.on('move', function (msg) {
        // pass on the move event to the other clients
        socket.broadcast.emit('move', msg);
    })

    // 'play' is emitted when both players have joined and the game can start
    socket.on('play', function (msg) {
        socket.broadcast.emit('play', msg);
        console.log("ready to play");
    })

    // when the user disconnects from the server, remove him from the game room
    socket.on('disconnect', function () {
        if (joinedRoomId !== null) {
            games[joinedRoomId].numPlayers--;
            let idx = games[joinedRoomId].playerIds.indexOf(playerId);
            if (idx > -1) {
                games[joinedRoomId].playerIds.splice(idx, 1);
            }
        }
        console.log('player ' + playerId + ' disconnected');
    })
})



// Handles get requests (loads front page index.html)
app.get('/', function (req, res) {
    res.sendFile('/index.html')
})




