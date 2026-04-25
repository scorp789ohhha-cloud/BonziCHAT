// ========================================================================
// Server init
// ========================================================================

// Filesystem reading functions
const fs = require('fs-extra');

// Load settings
try {
        stats = fs.lstatSync('settings.json');
} catch (e) {
        // If settings do not yet exist
        if (e.code == "ENOENT") {
                try {
                        fs.copySync(
                                'settings.example.json',
                                'settings.json'
                        );
                        console.log("Created new settings file.");
                } catch(e) {
                        console.log(e);
                        throw "Could not create new settings file.";
                }
        // Else, there was a misc error (permissions?)
        } else {
                console.log(e);
                throw "Could not read 'settings.json'.";
        }
}

// Load settings into memory
const settings = require("./settings.json");

// Setup basic express server
var express = require('express');
var app = express();
if (settings.express.serveStatic)
        app.use(express.static('./build/www'));
var server = require('http').createServer(app);

// File upload endpoint (clip button)
var multer = require('multer');
var path = require('path');
var crypto = require('crypto');
var uploadDir = path.join(__dirname, 'build', 'www', 'uploads');
fs.ensureDirSync(uploadDir);
var ALLOWED_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp',
                    '.mp3', '.wav', '.ogg', '.m4a',
                    '.mp4', '.webm', '.mov'];
var EXT_TO_KIND = {
        '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.webp': 'image', '.bmp': 'image',
        '.mp3': 'audio', '.wav': 'audio', '.ogg': 'audio', '.m4a': 'audio',
        '.mp4': 'video', '.webm': 'video', '.mov': 'video'
};
var upload = multer({
        storage: multer.diskStorage({
                destination: uploadDir,
                filename: function (req, file, cb) {
                        var ext = path.extname(file.originalname).toLowerCase();
                        cb(null, crypto.randomBytes(12).toString('hex') + ext);
                }
        }),
        limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
        fileFilter: function (req, file, cb) {
                var ext = path.extname(file.originalname).toLowerCase();
                if (ALLOWED_EXTS.indexOf(ext) === -1) {
                        return cb(new Error('File type not allowed'));
                }
                cb(null, true);
        }
});
app.post('/upload', function (req, res) {
        var ip = req.headers['cf-connecting-ip']
              || (req.connection && req.connection.remoteAddress)
              || req.ip;
        var Flood = require('./flood.js');
        var Ban = require('./ban.js');
        if (Ban.isBanned && Ban.isBanned(ip)) {
                return res.status(403).json({ error: 'Banned' });
        }
        var uc = Flood.checkUpload(ip);
        if (!uc.allow) {
                return res.status(429).json({ error: uc.reason });
        }
        upload.single('file')(req, res, function (err) {
                if (err) return res.status(400).json({ error: err.message });
                if (!req.file) return res.status(400).json({ error: 'No file' });
                var ext = path.extname(req.file.filename).toLowerCase();
                res.json({
                        url: '/uploads/' + req.file.filename,
                        kind: EXT_TO_KIND[ext] || 'image'
                });
        });
});

// Init socket.io
var io = require('socket.io')(server);
var port = process.env.PORT || settings.port;

exports.io = io;

// Init sanitize-html
var sanitize = require('sanitize-html');

// Init winston loggers (hi there)
const Log = require('./log.js');
Log.init();
const log = Log.log;

// Load ban list
const Ban = require('./ban.js');
Ban.init();

// Start actually listening
server.listen(port, '0.0.0.0', function () {
        console.log(
                " Welcome to BonziCHAT!\n",
                "Time to pop bubblegum!\n",
                "Leaked by KKK Fan",
                "----------------------\n",
                "Server listening at port " + port
        );
});
app.use(express.static(__dirname + '/public'));

// ========================================================================
// Banning functions
// ========================================================================

// ========================================================================
// Helper functions
// ========================================================================

const Utils = require("./utils.js")

// ========================================================================
// The Beef(TM)
// ========================================================================

const Meat = require("./meat.js");
Meat.beat();

// Console commands
const Console = require('./console.js');
Console.listen();
