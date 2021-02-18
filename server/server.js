


// COMPLETE: Decrement hidden bombs when exploded
// COMPLETE: Handle refresh by setting up sessionId game room check
// COMPLETE: refactor game to server side
// COMPLETE: handle bomb king

const http = require('http');
const path = require('path');
const socketIO = require('socket.io');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const chess = require('../public/js/chess.js');

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
    } else {
        next();
    }
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
    req.session.connections = 0;
    req.session.save(() => {
        res.redirect('/play');
    })
})

app.get('/play', function (req, res) {
    res.sendFile(path.join(publicPath, 'html/game.html'));
})


/* ----------------------------SOCKET IO------------------------------------- */

const columns = 'abcdefgh';

let sessions = {}; // Set of users
let rooms = {}; // Set of rooms
let games = {}; // Set of games

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

function mapIdx(i, j) {
    let square = columns[j] + (i+1).toString();
    return square;
}

// Does something when a client connects
io.on('connection', (socket) => {

    const session = socket.request.session;
    let username = session.username;
    let sessionId = session.id;
    let roomId = session.roomId;
    let color;

    // TODO: dictionary sessionId to username, set room options [WIP]

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

    function configureOptions (options) {
        if (options.mines) {
            let mineOptions = options.mineOptions;
            rooms[roomId][sessionId].maxFBombs = mineOptions.numFriendlyBombs;
            rooms[roomId][sessionId].maxNBombs = mineOptions.numNeutralBombs;
            rooms[roomId][sessionId].hBombs = zeros([8, 8]);
            rooms[roomId][sessionId].fBombs = zeros([8, 8]);
            rooms[roomId][sessionId].nBombs = zeros([8, 8]);
            rooms[roomId][sessionId].numFBombs = 0;
            rooms[roomId][sessionId].numNBombs = 0;
        }
    }

    // TODO: implement set bombs
    socket.on('configOptions', () => {
        configureOptions(roomOptions);
    })

    socket.on('play', () => {
        io.to(roomId).emit('play');
        rooms[roomId].playing = true;
    })

    socket.on('ready', () => {
        rooms[roomId][sessionId].ready = true;
    })

    // Join room given by roomId and find numPlayers in room
    socket.join(roomId);

    // Check if room contains sessionId
    if (rooms[roomId] && (sessionId in rooms[roomId])) {
        try {
            session.connections++;
            session.save();
            sessions[sessionId] = session;
            let data = {
                fen: games[roomId].fen(),
                color: rooms[roomId][sessionId].color,
                roomOptions: roomOptions,
                headerText: rooms[roomId][sessionId].headerText,
                ready: rooms[roomId][sessionId].ready,
                playing: rooms[roomId].playing
            }
            socket.emit('loadGame', data);
        } catch (e) {
            console.log(e)
            handleErrorRedirect();
        }
    }
    else {
        // If 1 player then white, if 2 players then black, otherwise full.
        // let numPlayers = io.sockets.adapter.rooms.get(roomId).size;
        let numPlayers;
        if (rooms[roomId]) {
            numPlayers = rooms[roomId].numPlayers;
        } else {
            numPlayers = 0;
        }
        if (numPlayers <= 1) {
            if (numPlayers === 0) {
                rooms[roomId] = {};
                games[roomId] = new chess.Chess();
            }
            session.connections++;
            session.save();
            sessions[sessionId] = session;
            rooms[roomId][sessionId] = {};
            console.log('player ' + username + ' connected to room ' + roomId);
            // the first player to join the room gets white
            if (numPlayers === 1) {
                color = 'black';
            } else {
                color = 'white';
            }
            rooms[roomId][sessionId].color = color;
            let gameFen = games[roomId].fen();
            numPlayers++;
            rooms[roomId].numPlayers = numPlayers;
            // Send initial data to client socket
            socket.emit('player', {
                sessionId,
                numPlayers,
                color,
                roomOptions,
                gameFen
            })

        } else {
            // TODO: redirect when full, probe room size before login
            handleErrorRedirect('Room is full.');
        }
    }


    // The client side emits a 'move' event when a valid move has been made.
    socket.on('move', function (move) {
        let game = games[roomId];
        let targetPiece = game.get(move.to);
        game.move(move, {legal: false});

        io.to(roomId).emit('move', game.fen());

        if (game.game_over() || (targetPiece !== null
                && targetPiece.type === 'k')) {
            // TODO: test checkmate, handle checkBomb in checkmate situations
            rooms[roomId].playing = false;
            io.to(roomId).emit('gameOver', game.turn() === 'w' ? 'black' : 'white');
        } else {
            // TODO: add other bomb types
            let type = 'f';
            let [i, j] = mapFen(move.to)
            // TODO: remove temp neutral bombs
            if (rooms[roomId][sessionId].hBombs !== undefined && (rooms[roomId][sessionId].hBombs[i][j] === 1
                    || rooms[roomId][sessionId].fBombs[i][j] === 1)) {
                explodeBomb(move.to);
                games[roomId].load(games[roomId].fen()); // reload game
                io.to(roomId).emit('explodeBomb', {
                    gameFen: games[roomId].fen(),
                    square: move.to,
                    type: type,
                    i: i,
                    j: j
                })
            }
        }
    })

    // 'play' is emitted when both players have joined and the game can start
    socket.on('setup', () => {
        io.to(roomId).emit('setup');
    })

    // when the user disconnects from the server, remove them from the game room
    socket.on('disconnect', function () {
        // TODO: add way to leave room without closing tab
        session.connections--;
        session.save();
        sessions[sessionId] = session;
        // Set 10s timeout to handle refresh
        setTimeout(function () {
            if (sessions[sessionId] && sessions[sessionId].connections <= 0) {
                delete rooms[roomId][sessionId];
                delete sessions[sessionId];
                rooms[roomId].numPlayers--;
                console.log('player ' + sessionId + ' disconnected from Room ' + roomId);
                io.to(roomId).emit('gameOver', color === 'white' ? 'black' : 'white');
            }
        }, 10000);
    })


/* ----------------------------BOMB MECHANICS--------------------------------------------- */
    // TODO: refactor away from maxbombs == ready
    // TODO: add other bomb types
    let tempFBombs = zeros([8, 8]);
    let tempNumFBombs = 0;

    socket.on('addBomb', function (msg) {
        let square = msg.square;
        let [i, j] = mapFen(square);
        if (msg.type === 'f') {
            if (tempNumFBombs < rooms[roomId][sessionId].maxFBombs && tempFBombs[i][j] !== 1
                    && !rooms[roomId][sessionId].ready) {

                // TODO: add bombs to temporary queue until confirmation
                tempNumFBombs++;
                tempFBombs[i][j] = 1;

                socket.emit('highlightBomb', {
                    square: square,
                    type: msg.type
                })
            } else if (tempFBombs[i][j] === 1 && !rooms[roomId][sessionId].ready) {
                tempNumFBombs--;
                tempFBombs[i][j] = 0;
                socket.emit('unhighlightBomb', {
                    square: square,
                    type: msg.type
                })
            }
        } else if (msg.type === 'n') {
            // TODO: implement and fade highlight out over time;
            // if (rooms[roomId][sessionId].numNBombs < rooms[roomId][sessionId].maxNBombs) {
            //     rooms[roomId][sessionId].numNBombs++;
            //     rooms[roomId][sessionId].nBombs[i][j] = 1;
            //     socket.emit('highlightBomb', {
            //         square: square,
            //         type: msg.type
            //     })
            // }
        }
    })

    socket.on('confirmBombs', () => {
        for (let i = 0; i < tempFBombs.length; i++) {
            for (let j = 0; j < tempFBombs[0].length; j++) {
                if (tempFBombs[i][j] === 1) {
                    rooms[roomId][sessionId].numFBombs++;
                    rooms[roomId][sessionId].fBombs[i][j] = 1;
                    // Add bombs to opponent hBombs
                    socket.to(roomId).emit('addHiddenBomb', {i: i, j: j})
                }
            }
        }
        rooms[roomId][sessionId].ready = true;
        socket.to(roomId).emit('opponentReady');
    })

    socket.on('addHiddenBomb', function (msg) {
        // TODO: try to fix the rooms[roomId][sessionId].hBombs bug
        if (rooms[roomId][sessionId].hBombs) {
            rooms[roomId][sessionId].hBombs[msg.i][msg.j] = 1;
        }
    })

    socket.on('removeBomb', function (msg) {
        if (msg.type === 'f') {
            rooms[roomId][sessionId].fBombs[msg.i][msg.j] = 0;
            rooms[roomId][sessionId].hBombs[msg.i][msg.j] = 0;
        } else {
            // TODO: do something
        }
    })

    socket.on('highlightBombs', () => {
        // TODO: highlight other types of bombs
        try {
            let fBombs = rooms[roomId][sessionId].fBombs
            for (let i = 0; i < fBombs.length; i++) {
                for (let j = 0; j < fBombs[0].length; j++) {
                    if (fBombs[i][j] === 1) {
                        let square = mapIdx(i, j);
                        socket.emit('highlightBomb', {
                            square: square,
                            type: 'f'
                        })
                    }
                }
            }
        } catch (e) {
            handleErrorRedirect();
        }

    })

    socket.on('getBombsAdjacent', function (square) {
        let numAdjacent = getBombsAdjacent(square);
        socket.emit('getBombsAdjacent', numAdjacent);
    })

    function explodeBomb(square) {
        let col = columns.indexOf(square[0]);
        let row = parseInt(square[1]);
        for (let i = Math.max(0, col - 1); i <= Math.min(7, col + 1); i++) {
            for (let j = Math.max(1, row - 1); j <= Math.min(8, row + 1); j++) {
                let squareFen = `${columns[i]}${j}`;
                if (games[roomId].get(squareFen)
                    && games[roomId].get(squareFen).type === 'k') {
                    io.to(roomId).emit('gameOver', games[roomId].turn() === 'w' ? 'black' : 'white');
                }
                games[roomId].remove(squareFen);
            }
        }
    }

    function getBombsAdjacent (square) {
        let [row, col] = mapFen(square);
        let numAdjacent = 0;
        for (let i = Math.max(0, row - 1); i <= Math.min(7, row + 1); i++) {
            for (let j = Math.max(0, col - 1); j <= Math.min(7, col + 1); j++) {
                if (!rooms[roomId][sessionId].hBombs) break;
                if (rooms[roomId][sessionId].hBombs[i][j] === 1) {
                    numAdjacent++;
                }
                if (rooms[roomId][sessionId].fBombs[i][j] === 1) {
                    numAdjacent++;
                }
            }
        }
        return numAdjacent;
    }



/* ----------------------------VISUAL------------------------------------------------- */

    socket.on('setHeader', (str) => {
        rooms[roomId][sessionId].headerText = str;
    })

    socket.on('unhighlightBomb', (msg) => {
        socket.emit('unhighlightBomb', msg);
    })

    // Check if the move square is a bomb and returns bool
    // socket.on('checkBomb', function (target) {
    //     let isBomb = false;
    //     if (rooms[roomId][sessionId].hBombs) {
    //         let [i, j] = mapFen(target)
    //         if (rooms[roomId][sessionId].hBombs[i][j] === 1) {
    //             isBomb = true;
    //         }
    //     }
    //     socket.emit('isBomb', isBomb);
    // })

    // // explode a bomb
    // socket.on('explodeBomb', function (square) {
    //     io.to(roomId).emit('explodeBomb', square);
    // })

    // socket.on('skipTurn', () => {
    //     socket.emit('skipTurn');
    // })

    process.on('uncaughtException', function (err) {
        console.error((new Date).toUTCString() + ' uncaughtException:', err.message);
        console.error(err.stack);
        handleErrorRedirect();
        // Send the error log to your email
        // process.exit(1);
    })

    function handleErrorRedirect(msg=null) {
        session.connections--;
        session.save();
        sessions[sessionId] = session;
        if (msg) {
            socket.emit('error', msg);
        } else {
            socket.emit('error', ('An error has occurred, please try again.'));
        }

    }
})




