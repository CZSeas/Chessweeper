// TODO: Handle refresh by setting up playerId game room check

// COMPLETE: Decrement hidden bombs when exploded

const http = require('http');
const path = require('path');
const socketIO = require('socket.io');
const cookieParser = require('cookie-parser');
const session = require('express-session')

const express = require('express');

const app = express()
const server = http.createServer(app)
const io = socketIO(server);

const publicPath = path.join(__dirname, '/../public')
const staticPath = path.join(__dirname, '/../static')

/* ------------------------EXPRESS SERVER------------------------------------- */

// Starts the server
// Change port as needed
const port = process.env.PORT || 3333;
server.listen(port, function () {
    console.log('Server started on port ' + port);
})

// Create session
const sessionMiddleware = session({
    secret: "cool calamari"
});

app.use(express.static(publicPath));
app.use('/static', express.static(staticPath));

app.use(express.urlencoded());
app.use(express.json());
app.use(cookieParser());

app.use(sessionMiddleware);

// Force HTTPS for live
app.use(function(req, res, next) {
    if ((req.get('X-Forwarded-Proto') !== 'https') && process.env.PORT) {
        res.redirect('https://' + req.get('Host') + req.url);
    } else
        next();
});

// Runs function for every socket that connects
io.use(function (socket, next) {
    // Create session for connecting socket
    sessionMiddleware(socket.request, {}, next);
});

// Redirect to home
app.get('/', function (req, res) {
    res.redirect('/home');
})

// Handles get requests (loads front page game.html)
app.get('/home', function (req, res) {
    res.sendFile(path.join(publicPath, 'html/home.html'));
})

// Redirect to play
app.post('/home', function (req, res) {
    req.session.username = req.body.username;
    req.session.roomId = req.body.roomId;
    req.session.save(() => {
        res.redirect('/play');
    })
})

app.get('/play', function (req, res) {
    res.sendFile(path.join(publicPath, 'html/game.html'));
})

app.get('/login', function (req, res) {
    let data = {
        username: req.session.username,
        roomId: req.session.roomId,
        playerId: req.session.id
    }
    res.json(data);
})

/* ----------------------------SOCKET IO------------------------------------- */

const columns = 'abcdefgh';

// Set of users
let playerIds = [];

function zeros(dimensions) {
    let array = [];
    for (let i = 0; i < dimensions[0]; ++i) {
        array.push(dimensions.length === 1 ? 0 : zeros(dimensions.slice(1)));
    }
    return array;
}

function mapFen(square) {
    let i = parseInt(square[1]) - 1;
    let j = columns.indexOf(square[0]);
    return [i, j];
}

// Does something when a client connects
io.on('connection', (socket) => {

    // TODO: Update to input roomId, dictionary socket.id to username, set room options [WIP]
    let username = socket.handshake.auth.username;
    let playerId = socket.handshake.auth.playerId;
    let roomId = socket.handshake.auth.roomId;
    let color;
    let userIsConnected = true;

    // game config
    let roomOptions = {
        mines: true,
        mineOptions: {
            // Per Side
            numNeutralBombs: 0,
            numFriendlyBombs: 2,
            allowFlags: true
        }
    }

    // bombs
    let hBombs; // hidden bombs sent by opponent
    let fBombs; // keep track of friendly bombs for adjacency
    let nBombs;
    let maxFBombs;
    let maxNBombs;
    let numFBombs;
    let numNBombs;

    function configureOptions (options) {
        if (options.mines) {
            let mineOptions = options.mineOptions;
            maxFBombs = mineOptions.numFriendlyBombs;
            maxNBombs = mineOptions.numNeutralBombs;
            hBombs = zeros([8, 8]);
            fBombs = zeros([8, 8]);
            nBombs = zeros([8, 8]);
            numFBombs = 0;
            numNBombs = 0;
        }
    }

    // TODO: do something on login
    socket.on('login', function (msg) {
      if (msg !== null) {
          if (playerIds.includes(msg)) {
              userIsConnected = true;
          }
      }
    })

    // Join room given by roomId and find numPlayers in room
    socket.join(roomId);
    let numPlayers = io.sockets.adapter.rooms.get(roomId).size;

    // If 1 player then white, if 2 players then black, otherwise full.
    if (numPlayers <= 2) {
        console.log('player ' + username + ' connected to room ' + roomId);
        // the first player to join the room gets white
        if (numPlayers === 2) color = 'black';
        else color = 'white';
        // Send initial data to client socket
        socket.emit('player', {
            playerId,
            numPlayers,
            color,
            roomOptions
        })
    } else {
        // TODO: redirect when full, probe room size before login
        socket.emit('full', roomId);
    }

    // TODO: implement set bombs
    socket.on('configOptions', () => {
        configureOptions(roomOptions);
        // if (roomOptions.mines) {
        //     socket.emit('setBombs');
        // } else {
        //     // Handshake with opponent
        //     socket.to(roomId).emit('ready');
        // }
        // socket.to(roomId).emit('ready');
    })

    // The client side emits a 'move' event when a valid move has been made.
    socket.on('move', function (move) {
        socket.to(roomId).emit('move', move);
        // TODO: add other bomb types
        let type = 'f'
        let [i, j] = mapFen(move.to)
        if (hBombs !== undefined && hBombs[i][j] === 1) {
            io.to(roomId).emit('explodeBomb', {
                square: move.to,
                type: type,
                i: i,
                j: j
            })
        }
    })

    // 'play' is emitted when both players have joined and the game can start
    socket.on('setup', () => {
        io.to(roomId).emit('setup');
    })

    socket.on('gameOver', function (color) {
        io.to(roomId).emit('gameOver', color);
    })

    // when the user disconnects from the server, remove him from the game room
    socket.on('disconnect', function () {
        // TODO: add way to leave room without closing tab
        userIsConnected = false;
        // // Set 10s timeout to handle refresh
        // setTimeout(function () {
        //     if (!userIsConnected) {
        //         // TODO: dictionary of playerIds does nothing right now
        //         playerIds.pop(playerId);
        //         console.log('player ' + playerId + ' disconnected from Room ' + roomId);
        //         io.to(roomId).emit('gameOver', color === 'white' ? 'black' : 'white');
        //     }
        // }, 10000);
        console.log('player ' + username + ' disconnected from room ' + roomId);
        io.to(roomId).emit('gameOver', color === 'white' ? 'black' : 'white');
    })

    /**
     * BOMB STUFF
     */

    function getBombsAdjacent (square) {
        let [row, col] = mapFen(square);
        let numAdjacent = 0;
        for (let i = Math.max(0, row - 1); i <= Math.min(7, row + 1); i++) {
            for (let j = Math.max(0, col - 1); j <= Math.min(7, col + 1); j++) {
                if (!hBombs) break;
                if (hBombs[i][j] === 1) {
                    numAdjacent++;
                }
                if (fBombs[i][j] === 1) {
                    numAdjacent++;
                }
            }
        }
        return numAdjacent;
    }

    socket.on('addHiddenBomb', function (msg) {
        // TODO: try to fix the hbombs bug
        if (hBombs) {
            hBombs[msg.i][msg.j] = 1;
        }
    })

    socket.on('removeHiddenBomb', function (msg) {
        if (hBombs) {
            hBombs[msg.i][msg.j] = 0;
        }
    })

    socket.on('getBombsAdjacent', function (square) {
        let numAdjacent = getBombsAdjacent(square);
        socket.emit('getBombsAdjacent', numAdjacent);
    })

    // Check if the move square is a bomb and returns bool
    socket.on('checkBomb', function (target) {
        let isBomb = false;
        if (hBombs) {
            let [i, j] = mapFen(target)
            if (hBombs[i][j] === 1) {
                isBomb = true;
            }
        }
        socket.emit('isBomb', isBomb);
    })

    // TODO: refactor away from maxbombs == ready
    socket.on('addBomb', function (msg) {
        let square = msg.square;
        let [i, j] = mapFen(square);
        if (msg.type === 'f') {
            if (numFBombs < maxFBombs && fBombs[i][j] !== 1) {
                numFBombs++;
                fBombs[i][j] = 1;
                // Add bombs to opponents hBombs
                socket.to(roomId).emit('addHiddenBomb', {i: i, j: j})
                socket.emit('highlightBomb', {
                    square: square,
                    type: msg.type
                })
                if (numFBombs === maxFBombs) {
                    socket.to(roomId).emit('ready');
                }
            }
        } else if (msg.type === 'n') {
            // TODO: implement and fade highlight out over time;
            // if (numNBombs < maxNBombs) {
            //     numNBombs++;
            //     nBombs[i][j] = 1;
            //     socket.emit('highlightBomb', {
            //         square: square,
            //         type: msg.type
            //     })
            // }
        }
    })

    // // explode a bomb
    // socket.on('explodeBomb', function (square) {
    //     io.to(roomId).emit('explodeBomb', square);
    // })

    // socket.on('skipTurn', () => {
    //     socket.emit('skipTurn');
    // })
})




