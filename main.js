import randomStreetView from 'random-streetview';
let express = require('express');
let cookieParser = require('cookie-parser');
let crypto = require('crypto');
let app = express();
app.use(cookieParser());

const bodyParser = require('body-parser')
app.use(
    bodyParser.urlencoded({
        extended: true
    })
)

const sqlite3 = require('sqlite3').verbose();
let geoDB = new sqlite3.Database('./db/borders.db', sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the borders database.');
});

let primaryDB = new sqlite3.Database('./db/primaryData.db', sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the borders database.');
});

var geometryData = []; //ISO code is the index of the 2d geometry array
var countryData = []; //ISO code is the index of the country's data array

function loadGeographyData() {
    //Load all data in global scope arrays
    let i = 0;
    for(i = 1; i < 246; i++) {
        let sql_query = 'SELECT WKT_GEOMETRY geometryBlob, iso3 countryISOCode, name countryName, area countryArea ' +
            'FROM borders_geolist WHERE ogc_fid = ?';
        let wktString, cISO, cName, cArea;
        geoDB.get(sql_query, [countryID], (err, row) => {
            if (err) {
                return console.error(err.message);
            }
            wktString = row.geometryBlob;
            cISO = row.countryISOCode;
            cName = row.countryName;
            cArea = row.countryArea;
        });

        let polygonArray = convertBorderGeometry(wktString);
        let countryData = [parseInt(cISO), cName, parseInt(cArea)];
        geometryData.push(polygonArray);
        countryData.push(countryData);
    }
}

app.get('/', function (req, res) {
    res.send('Hello World');
})

app.get('/play', function (req, res) {
    let userCookie = req.cookies.userData;
    if(userCookie === undefined) {
        //Start a new session
        res.writeHead(301,
            {Location: 'https://geo.sonder.click/playsession'}
        );
        res.end();
    } else {
        //Continue current game
    }
})

app.get('/play/startsession', function (req, res) {
    let sessionID = generateSessionID();
    res.cookie('sessionID', sessionID, {signed: true}).send();
    let mapID = req.query.mapID;
    let rounds = parseInt(req.query.rounds);
    if(startSession(sessionID, mapID, rounds)) {
        res.writeHead(301,
            {Location: 'https://geo.sonder.click/play'}
        );
        res.end();
    }
})

var server = app.listen(8081, function () {
    var host = server.address().address;
    var port = server.address().port;

    console.log("Example app listening at http://%s:%s", host, port);
})

let generateSessionID = function() {
    return crypto.randomBytes(16).toString('base64');
}

let runGame = function(sessionID) {
    //Query session ID for game data
    let sql_query = 'SELECT MapID mapID, GameRound currentRound, GameScore currentScore, ' +
        'GameLatitude currentLatitude, GameLongitude currentLongitude, GameLength totalRounds ' +
        'FROM sessions WHERE SessionID = ?';
    let mapID, currentRound, currentScore, gameLat, gameLong, totalRounds;
    primaryDB.get(sql_query, [sessionID], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        mapID = row.mapID;
        currentRound = row.currentRound;
        currentScore = row.currentScore;
        gameLat = row.currentLatitude;
        gameLong = row.currentLongitude;
        totalRounds = row.totalRounds;
    });

    currentRound++;
    if(currentRound > totalRounds) {
        //Quit session
    }

    let gameLocation = generateValidMap(mapID);

}

let convertArrayToBlob = function(array) {
    let blob, i = 0;
    for(i = 0; i < array.length - 1; i++) {
        blob.concat(array[i] + ',');
    }
    blob.concat(array[i]);
    return blob;
}

let convertBlobToArray = function(dataType, arrayDimension, blob) {
    let blobSplit = blob.split(',');
    if(arrayDimension === 1) {
        let array = [], i = 0;
        for(i = 0; i < blobSplit.length; i++) {
            switch(dataType) {
                case 'INTEGER': array.push(parseInt(blobSplit[i])); break;
                case 'FLOAT': array.push(parseFloat(blobSplit[i])); break;
                case 'STRING': array.push(blobSplit[i]); break;
            }
        }

        return array;
    }

    if(arrayDimension === 2) {
        let array = [], i = 0;
        for(i = 0; i < blobSplit.length; i+=2) {
            switch(dataType) {
                case 'INTEGER': array.push([parseInt(blobSplit[i]), parseInt(blobSplit[i+1])]); break;
                case 'FLOAT': array.push([parseFloat(blobSplit[i]), parseFloat(blobSplit[i+1])]); break;
                case 'STRING': array.push([blobSplit[i], blobSplit[i+1]]); break;
            }
        }

        return array;
    }

    return null;
}

let startSession = function(sessionID, mapID, rounds) {
    let locationArray = generateValidMap(getWhitelistCountries(mapID), rounds);
    let locationBlob = convertArrayToBlob(locationArray);

    let sql_insert = 'INSERT INTO sessions(SessionID, MapID, GameRound, GameScore, SessionCreationTime,' +
        ' GeneratedLocations, UserInputLocations) VALUES(?, ?, ?, ?, ?, ?, ?)'

    db.run(sql_insert, [sessionID, mapID, 0, 0, Date.now(), locationBlob, ''], function(err) {
        if (err) {
            return false;
        } else {
            return true;
        }
    });
}

let getWhitelistCountries = function(mapID) {
    let whitelist = [];
    let sql_query = 'SELECT CountryCodeArray ccArray FROM maps WHERE MapID = ?';
    let blobString;
    primaryDB.get(sql_query, [mapID], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        blobString = row.ccArray;
    });

    let blobStringArray = blobString.split(','), i;
    for(i = 0; i < blobStringArray.length; i++) {
        whitelist.push(parseInt(blobStringArray[i]));
    }

    return whitelist;
}

let generateValidMap = async function (countryWhitelist, rounds) {
    let locations = [];
    let i;
    for(i = 0; i < rounds; i++) {
        let countryIndex = countryWhitelist[Math.floor(Math.random() * (countryWhitelist.length + 1)) - 1];
        let polygonArray = geometryData[countryIndex];
        await randomStreetView.setParameters({
            polygon: polygonArray,
            type: 'photo',
            enableCaching: true,
            endZoom: 16,
            cacheKey: 'ISO=' + cISO,
            distribution: 'weighted',
            google: true
        });

        let roundLocation = randomStreetView.getRandomLocation();
        locations.push(roundLocation);
    }

    return locations;
}

let convertBorderGeometry = async function(wktString) {
    let strLength = wktString.length;
    let wktStringF = wktString.slice(16, strLength-3);
    let polygonArray = [];
    let index = 0;
    let wktSpliceArray = wktStringF.split(',');
    for(index = 0; index < wktSpliceArray.length; index += 2) {
        let spliceArr = [parseFloat(wktSpliceArray[index]), parseFloat(wktSpliceArray[index+1])];
        polygonArray.push(spliceArr);
    }

    return polygonArray;
}